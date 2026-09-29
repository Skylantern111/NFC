// Role-neutral browser helpers for the two drivers: start Chrome, drive it
// over the DevTools Protocol (Node's built-in WebSocket — no extra
// packages), and run named steps with clear [ROLE] logs and a screenshot on
// failure. Nothing here knows about users or admins; the workflows live in
// user-driver.js and admin-driver.js.
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CHROME_PATH, HEADLESS, OUTPUT_DIR, TIMEOUTS } from './driver-config.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Each driver gets its own Chrome with a fresh, throw-away profile: no
// shared cookies, storage or sign-in between the user and admin runs.
export async function launchBrowser(role, { debugPort, baseUrl }) {
  if (!CHROME_PATH) throw new Error(`[${role}] Chrome not found. Set CHROME_PATH.`);
  const profile = mkdtempSync(join(tmpdir(), `tagback-${role.toLowerCase()}-`));
  const args = [
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    ...(HEADLESS ? ['--headless=new'] : []),
    'about:blank',
  ];
  const proc = spawn(CHROME_PATH, args, { stdio: 'ignore' });

  let page;
  for (let i = 0; i < 60 && !page; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json();
      page = targets.find((t) => t.type === 'page');
    } catch {
      // Chrome still starting
    }
    if (!page) await sleep(250);
  }
  if (!page) {
    proc.kill();
    throw new Error(`[${role}] could not connect to Chrome on port ${debugPort}.`);
  }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  return new Browser({ role, ws, proc, profile, baseUrl });
}

class Browser {
  constructor({ role, ws, proc, profile, baseUrl }) {
    this.role = role;
    this.ws = ws;
    this.proc = proc;
    this.profile = profile;
    this.baseUrl = baseUrl;
    this.nextId = 0;
    this.pending = new Map();
    this.consoleErrors = [];
    ws.addEventListener('message', (e) => this.#onMessage(JSON.parse(e.data)));
  }

  #onMessage(msg) {
    if (msg.id && this.pending.has(msg.id)) {
      const { resolve, reject } = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
      return;
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      this.consoleErrors.push((d.exception?.description || d.text || '').split('\n')[0]);
    } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      this.consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300));
    }
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async init(viewport) {
    await this.send('Runtime.enable');
    await this.send('Page.enable');
    await this.setViewport(viewport);
  }

  async setViewport({ width, height, mobile }) {
    await this.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
  }

  // Runs before every page load (e.g. a simulated NDEFReader).
  async addInitScript(source) {
    await this.send('Page.addScriptToEvaluateOnNewDocument', { source });
  }

  async goto(path, { settleMs = 1200 } = {}) {
    await this.send('Page.navigate', { url: this.baseUrl + path });
    await this.waitFor(`document.readyState === 'complete'`, { what: `page ${path} to load`, timeout: TIMEOUTS.page });
    await sleep(settleMs);
  }

  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(`page script failed: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
    return r.result.value;
  }

  path() {
    return this.eval('location.pathname + location.search');
  }

  bodyText() {
    return this.eval('document.body.innerText');
  }

  async hasText(text) {
    return this.eval(`document.body.innerText.includes(${JSON.stringify(text)})`);
  }

  async count(selector) {
    return this.eval(`document.querySelectorAll(${JSON.stringify(selector)}).length`);
  }

  async waitFor(expression, { what = expression, timeout = TIMEOUTS.step } = {}) {
    const started = Date.now();
    let last;
    while (Date.now() - started < timeout) {
      try {
        last = await this.eval(`!!(${expression})`);
        if (last) return true;
      } catch {
        // page mid-navigation
      }
      await sleep(200);
    }
    throw new Error(`timed out after ${timeout} ms waiting for ${what}`);
  }

  waitForText(text, opts = {}) {
    return this.waitFor(`document.body.innerText.includes(${JSON.stringify(text)})`, { what: `text "${text}"`, ...opts });
  }

  // Resolves with whichever text appears first.
  async waitForAnyText(texts, opts = {}) {
    const list = JSON.stringify(texts);
    await this.waitFor(`${list}.some((t) => document.body.innerText.includes(t))`, { what: `one of ${list}`, ...opts });
    return this.eval(`${list}.find((t) => document.body.innerText.includes(t))`);
  }

  waitForPath(prefix, opts = {}) {
    return this.waitFor(`location.pathname.startsWith(${JSON.stringify(prefix)})`, { what: `URL ${prefix}`, ...opts });
  }

  // A real mouse click at the element's centre — Radix menus and dialogs
  // react to pointer events, not to element.click().
  async click(target, { within } = {}) {
    const found = await this.eval(`(() => {
      const target = ${JSON.stringify(target)};
      const root = ${within ? `document.querySelector(${JSON.stringify(within)})` : 'document'};
      if (!root) return null;
      const visible = (el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
      let el = null;
      if (target.startsWith('css:')) el = [...root.querySelectorAll(target.slice(4))].find(visible);
      else {
        const nodes = [...root.querySelectorAll('button, a, [role=menuitem], [role=tab], [role=switch], label, summary')].filter(visible);
        const name = (n) => ((n.getAttribute('aria-label') || '') + ' ' + n.innerText).replace(/\\s+/g, ' ').trim();
        el = nodes.find((n) => name(n) === target) || nodes.find((n) => name(n).includes(target));
      }
      if (!el) return null;
      el.scrollIntoView({ block: 'center' });
      const b = el.getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    })()`);
    if (!found) throw new Error(`could not find "${target}" to click`);
    const base = { x: found.x, y: found.y, button: 'left', clickCount: 1 };
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: found.x, y: found.y });
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...base });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...base });
    await sleep(400);
  }

  // Sets an input/textarea the way React sees typing (native setter + input event).
  async fill(selector, value) {
    const ok = await this.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.focus();
      return true;
    })()`);
    if (!ok) throw new Error(`could not find field ${selector}`);
    await sleep(150);
  }

  async key(key, { shift = false } = {}) {
    const codes = { Tab: 9, Enter: 13, Escape: 27, ArrowDown: 40, ArrowUp: 38, ' ': 32 };
    const base = { key, code: key === ' ' ? 'Space' : key, windowsVirtualKeyCode: codes[key], modifiers: shift ? 8 : 0 };
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base, ...(key === 'Enter' ? { text: '\r' } : {}) });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    await sleep(250);
  }

  // Description of the focused element, e.g. `BUTTON "More actions for …"`.
  focused() {
    return this.eval(`(() => { const a = document.activeElement; if (!a || a === document.body) return 'BODY';
      return a.tagName + ' "' + (a.getAttribute('aria-label') || a.innerText || a.id || '').trim().replace(/\\s+/g, ' ').slice(0, 60) + '"'; })()`);
  }

  async dialogOpen() {
    return this.eval(`!!document.querySelector('[role=dialog]')`);
  }

  async screenshot(name) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
    const { data } = await this.send('Page.captureScreenshot', { format: 'png' });
    const file = join(OUTPUT_DIR, `${name}.png`);
    writeFileSync(file, Buffer.from(data, 'base64'));
    return file;
  }

  takeConsoleErrors() {
    const out = this.consoleErrors.slice();
    this.consoleErrors.length = 0;
    return out;
  }

  close() {
    try {
      this.ws.close();
    } catch {
      // already closed
    }
    this.proc.kill();
    setTimeout(() => {
      try {
        rmSync(this.profile, { recursive: true, force: true });
      } catch {
        // Chrome may still hold files briefly; the OS temp dir cleans up.
      }
    }, 1500);
  }
}

// ---- step runner -----------------------------------------------------------

export class CriticalFailure extends Error {}

export function assert(condition, expected, actual) {
  if (!condition) {
    const err = new Error(`expected: ${expected}\n         actual:   ${actual}`);
    err.assertion = true;
    throw err;
  }
}

export function createRunner(role, browser) {
  const results = [];
  const log = (msg) => console.log(`[${role}] ${msg}`);
  let n = 0;

  async function step(workflow, { page, critical = false } = {}, fn) {
    n += 1;
    log(`${workflow}${page ? ` (${page})` : ''}`);
    browser.takeConsoleErrors();
    try {
      const note = await fn();
      const errors = browser.takeConsoleErrors();
      if (errors.length) throw Object.assign(new Error(`expected: no console errors\n         actual:   ${errors.join(' | ')}`), { assertion: true });
      results.push({ workflow, page, status: 'PASS', note });
      log(`  ✓ ${note || 'ok'}`);
    } catch (err) {
      let shot = '';
      try {
        shot = await browser.screenshot(`${role.toLowerCase()}-${String(n).padStart(2, '0')}-${workflow.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`);
      } catch {
        // screenshot is best-effort
      }
      let where = '';
      try {
        where = await browser.path();
      } catch {
        // page unavailable
      }
      results.push({ workflow, page, status: 'FAIL', note: err.message });
      console.log(`[${role}] ✗ FAIL — ${workflow}`);
      console.log(`[${role}]   driver:   ${role.toLowerCase()}-driver.js`);
      console.log(`[${role}]   page:     ${where || page || '?'}`);
      console.log(`[${role}]   ${err.message.replace(/\n/g, `\n[${role}]   `)}`);
      if (shot) console.log(`[${role}]   screenshot: ${shot}`);
      if (critical) throw new CriticalFailure(`${workflow} failed; later steps depend on it.`);
    }
  }

  function skip(workflow, reason) {
    results.push({ workflow, status: 'SKIP', note: reason });
    log(`${workflow} — SKIP: ${reason}`);
  }

  function summary() {
    const count = (s) => results.filter((r) => r.status === s).length;
    console.log(`\n[${role}] ─── summary ───`);
    for (const r of results) console.log(`[${role}] ${r.status.padEnd(4)}  ${r.workflow}${r.status !== 'PASS' && r.note ? `  — ${r.note.split('\n')[0]}` : ''}`);
    console.log(`[${role}] ${count('PASS')} passed, ${count('FAIL')} failed, ${count('SKIP')} skipped`);
    return count('FAIL') > 0 ? 1 : 0;
  }

  return { step, skip, summary, log };
}

// Simulated Web NFC reader for headless Chrome (no NFC hardware): scan()
// resolves and never reads, write() resolves. Lets the drivers check the
// scan states; it proves nothing about real tags.
export const FAKE_NDEF_READER = `window.NDEFReader = class {
  scan() { return new Promise(() => {}); }
  write() { return Promise.resolve(); }
};`;
