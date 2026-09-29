// ADMIN DRIVER — a TagBack administrator, and nothing else.
//
// Covers the admin console only: its sign-in and access gate, navigation,
// NFC Register, Inventory (search, filters, blacklist/unblacklist), Tag
// Content, Moderation, Owners, Error log, admin Settings and sign-out. It
// never uses the owner console (/dashboard); owner checks live in
// user-driver.js.
//
//   node drivers/admin-driver.js            (preview mode, safe default)
//   DRIVER_MODE=live node drivers/admin-driver.js
//
// See drivers/README.md for modes and environment variables.
import {
  ALLOW_WRITES,
  MODE,
  TEST_TAG_ID,
  TIMEOUTS,
  VIEWPORTS,
  requireEnv,
  startApp,
} from './driver-config.js';
import { CriticalFailure, FAKE_NDEF_READER, assert, createRunner, launchBrowser } from './browser.js';

const ROLE = 'ADMIN';
const LIVE = MODE === 'live';
// Admin credentials only — this driver never reads the owner variables.
const creds = LIVE ? requireEnv(['TEST_ADMIN_EMAIL', 'TEST_ADMIN_PASSWORD'], ROLE) : {};
if (LIVE && process.env.TEST_USER_EMAIL && process.env.TEST_USER_EMAIL === creds.TEST_ADMIN_EMAIL) {
  throw new Error('[ADMIN] TEST_ADMIN_EMAIL must be a different account from TEST_USER_EMAIL.');
}

// The admin console's own navigation (components/nav/AdminSidebar.jsx).
const ADMIN_NAV = [
  ['/admin/inventory', 'Inventory'],
  ['/admin/nfc-register', 'NFC Register'],
  ['/admin/tags', 'Tag Content'],
  ['/admin/moderation', 'Moderation'],
  ['/admin/owners', 'Owners'],
  ['/admin/settings', 'Settings'],
];
const PREVIEW_NOTE = 'Preview mode — sample tags only';

let b;
let run;

// ---- access gate and sign-in
async function testConsoleNeedsSignIn() {
  if (!LIVE) return run.skip('Console refuses signed-out visitors', 'preview mode bypasses the admin gate');
  await run.step('Console refuses signed-out visitors', { page: '/admin/inventory' }, async () => {
    await b.goto('/admin/inventory');
    await b.waitForPath('/admin/login', { timeout: TIMEOUTS.page });
    assert((await b.count('a[href="/admin/moderation"]')) === 0, 'no admin navigation before sign-in', 'admin nav visible');
    return 'signed-out visitor sent to /admin/login';
  });
}

async function loginAsAdmin() {
  if (!LIVE) return run.skip('Sign in as admin', 'preview mode has no sign-in (admin gate bypassed)');
  await run.step('Sign in as admin', { page: '/admin/login', critical: true }, async () => {
    await b.goto('/admin/login');
    await b.fill('#admin-email', creds.TEST_ADMIN_EMAIL);
    await b.fill('#admin-password', creds.TEST_ADMIN_PASSWORD);
    await b.click('Sign in', { within: 'form' });
    await b.waitFor(
      `location.pathname.startsWith('/admin/inventory') || location.pathname.startsWith('/admin/verify-email') || document.body.innerText.includes("doesn't have admin access")`,
      { what: 'admin sign-in result', timeout: TIMEOUTS.page }
    );
    const path = await b.path();
    assert(!path.startsWith('/admin/verify-email'), 'admin rights (verified passcode admin or custom claim)', 'account email not verified — sent to /admin/verify-email');
    assert(path.startsWith('/admin/inventory'), 'landed on /admin/inventory', `${path} — ${(await b.bodyText()).slice(0, 120)}`);
    return 'signed in; admin gate let the account through';
  });
}

async function testAdminConsole() {
  await run.step('Admin console and navigation', { page: '/admin/inventory' }, async () => {
    await b.goto('/admin/inventory');
    // textContent: the sidebar label is CSS-uppercased in innerText.
    await b.waitFor(`document.body.textContent.includes('Admin console')`, { what: 'admin sidebar', timeout: TIMEOUTS.page });
    for (const [href, label] of ADMIN_NAV) {
      assert((await b.count(`nav[aria-label=Main] a[href="${href}"]`)) > 0, `nav link ${label} (${href})`, 'missing');
    }
    const ownerLinks = await b.count('a[href^="/dashboard"]');
    assert(ownerLinks === 0, 'no owner-console links in the admin console', `${ownerLinks} found`);
    assert(!(await b.path()).startsWith('/dashboard'), 'not treated as an owner (stays in /admin)', await b.path());
    return `${ADMIN_NAV.length} admin nav items; no owner links`;
  });
}

// ---- NFC register (scan states only; real reading/writing needs hardware)
async function testNfcRegistration() {
  await run.step('NFC Register scan states', { page: '/admin/nfc-register' }, async () => {
    await b.goto('/admin/nfc-register');
    await b.waitForText('Register tags');
    await b.waitForText('Tap a sticker to register it');
    await b.click('Start NFC scan');
    await b.waitForText('Looking for NFC tag…');
    await b.click('Cancel scan');
    await b.waitForText('Tap a sticker to register it');
    return 'ready → looking → cancelled (simulated reader)';
  });
  run.skip('Register and write a real sticker', 'needs NFC hardware and a real tap — manual check (docs/FIREBASE_SETUP.md §9 step 15)');
}

// ---- inventory
async function testInventory() {
  await run.step('Inventory list, search and filters', { page: '/admin/inventory' }, async () => {
    await b.goto('/admin/inventory');
    await b.waitFor(`document.querySelectorAll('tbody tr').length > 0`, { what: 'inventory rows (or the empty row)', timeout: TIMEOUTS.page });
    if (!LIVE) assert(await b.hasText(PREVIEW_NOTE), 'preview note shown', 'missing');
    const rows = await b.eval(`[...document.querySelectorAll('tbody tr')].filter((r) => r.querySelector('[data-label="TagBack ID"]')).map((r) => r.querySelector('[data-label="TagBack ID"]').innerText.trim())`);
    if (!rows.length) {
      assert(await b.hasText('No NFC tags have been registered yet') || (await b.hasText('No tags match this view')), 'empty inventory explains next step', 'no message');
      return 'no tags registered (empty state)';
    }
    const first = rows[0];
    await b.fill('input[type=search]', first);
    await b.waitFor(`[...document.querySelectorAll('tbody [data-label="TagBack ID"]')].every((c) => c.innerText.includes(${JSON.stringify(first)}))`, { what: `rows filtered to ${first}` });
    await b.fill('input[type=search]', '');
    await b.click('Blacklisted', { within: 'main' });
    const pressed = await b.eval(`[...document.querySelectorAll('button[aria-pressed=true]')].map((x) => x.innerText).join(' ')`);
    assert(pressed.includes('Blacklisted'), 'Blacklisted filter pressed', pressed);
    await b.click('All', { within: 'main' });
    return `${rows.length} row(s); search and status filter work`;
  });
}

async function openRowMenu(tagId) {
  await b.fill('input[type=search]', tagId);
  await b.waitFor(`document.querySelector('[aria-label="Actions for ${tagId}"]')`, { what: `row ${tagId}`, timeout: TIMEOUTS.page });
  await b.click(`Actions for ${tagId}`);
  await b.waitFor(`document.querySelector('[role=menu]')`, { what: 'row menu' });
}

async function testBlacklistFlow() {
  await run.step('Blacklist dialog', { page: '/admin/inventory' }, async () => {
    await b.goto('/admin/inventory');
    await b.waitFor(`document.querySelectorAll('tbody tr').length > 0`, { what: 'inventory rows', timeout: TIMEOUTS.page });
    const target = LIVE && TEST_TAG_ID
      ? TEST_TAG_ID
      : await b.eval(`(() => { const r = [...document.querySelectorAll('tbody tr')].find((x) => x.querySelector('[data-label=Status]')?.innerText.includes('Registered')); return r ? r.querySelector('[data-label="TagBack ID"]').innerText.trim() : null; })()`);
    if (!target) return 'no non-blacklisted tag to try';
    await openRowMenu(target);
    await b.click('Blacklist…', { within: '[role=menu]' });
    await b.waitFor(`document.querySelector('#blacklist-reason')`, { what: 'blacklist dialog' });
    const disabled = () => b.eval(`[...document.querySelectorAll('[role=dialog] button')].find((x) => x.innerText.trim() === 'Blacklist tag')?.disabled`);
    assert((await disabled()) === true, 'confirm disabled until a reason is typed', 'enabled');
    await b.fill('#blacklist-reason', 'TEST_ADMIN driver check');
    assert((await disabled()) === false, 'confirm enabled with a reason', 'still disabled');
    const write = LIVE && ALLOW_WRITES && target === TEST_TAG_ID;
    if (!write) {
      await b.key('Escape');
      await b.waitFor(`!document.querySelector('[role=dialog]')`, { what: 'dialog to close' });
      const focus = await b.focused();
      assert(focus.includes(`Actions for ${target}`), 'focus back on the row menu', focus);
      return `reason required; cancelled (${LIVE ? 'writes off' : 'preview'}); focus returned`;
    }
    await b.click('Blacklist tag', { within: '[role=dialog]' });
    await b.waitFor(`[...document.querySelectorAll('tbody tr')].some((r) => r.innerText.includes(${JSON.stringify(TEST_TAG_ID)}) && r.innerText.includes('Blacklisted'))`, { what: `${TEST_TAG_ID} blacklisted`, timeout: TIMEOUTS.page });
    return `${TEST_TAG_ID} blacklisted`;
  });

  await run.step('Unblacklist confirmation', { page: '/admin/inventory' }, async () => {
    await b.goto('/admin/inventory');
    await b.waitFor(`document.querySelectorAll('tbody tr').length > 0`, { what: 'inventory rows', timeout: TIMEOUTS.page });
    const target = LIVE && ALLOW_WRITES && TEST_TAG_ID
      ? TEST_TAG_ID
      : await b.eval(`(() => { const r = [...document.querySelectorAll('tbody tr')].find((x) => x.querySelector('[data-label=Status]')?.innerText.includes('Blacklisted')); return r ? r.querySelector('[data-label="TagBack ID"]').innerText.trim() : null; })()`);
    if (!target) return 'no blacklisted tag to try';
    await openRowMenu(target);
    await b.click('Unblacklist', { within: '[role=menu]' });
    if (!LIVE) {
      await b.waitForText(PREVIEW_NOTE);
      return 'preview mode: shows the "nothing is saved" note instead of the dialog';
    }
    await b.waitForText(`Unblacklist ${target}?`, { timeout: TIMEOUTS.page });
    assert(await b.hasText('The tag goes back to'), 'dialog names the status restored', 'missing');
    if (!(ALLOW_WRITES && target === TEST_TAG_ID)) {
      await b.click('Cancel', { within: '[role=dialog]' });
      return 'dialog names the restored status; cancelled';
    }
    await b.click('Unblacklist', { within: '[role=dialog]' });
    await b.waitForText(`${TEST_TAG_ID} is`, { timeout: TIMEOUTS.page });
    return `${TEST_TAG_ID} restored`;
  });
}

async function testTagContent() {
  await run.step('Tag Content list', { page: '/admin/tags' }, async () => {
    await b.goto('/admin/tags');
    await b.waitForText('Open editor');
    const shown = await b.waitForAnyText(['Edit content', 'No tags in this view.', 'Preview mode — no Firestore configured.'], { timeout: TIMEOUTS.page });
    return `state: ${shown}`;
  });
}

// ---- moderation
async function testModeration() {
  await run.step('Moderation queue', { page: '/admin/moderation' }, async () => {
    await b.goto('/admin/moderation');
    await b.waitFor(`document.body.textContent.includes('Banned tokens') || document.body.textContent.includes('Nothing reported')`, { what: 'moderation queue or empty state', timeout: TIMEOUTS.page });
    if (await b.hasText('Nothing reported')) return 'empty queue';
    assert(await b.hasText('Show reviewed'), 'Show reviewed switch', 'missing');
    if (await b.eval(`[...document.querySelectorAll('button')].some((x) => x.innerText.trim() === 'Ban finder')`)) {
      await b.click('Ban finder');
      await b.waitForText("A finder who clears their browser data gets a new identity");
      assert((await b.focused()).includes('Cancel'), 'Cancel focused first', await b.focused());
      await b.click('Cancel', { within: '[role=dialog]' });
    }
    return 'queue listed; ban confirmation explains its limit; cancelled';
  });

  if (!LIVE) return run.skip('Reported chat opens read-only for admin', 'preview mode has no real chats');
  await run.step('Reported chat opens read-only for admin', { page: '/admin/moderation' }, async () => {
    const href = await b.eval(`document.querySelector('a[aria-label="View chat"]')?.getAttribute('href') || null`);
    if (!href) return 'no reported chat to open';
    await b.goto(href);
    await b.waitForText('Admin view · read-only', { timeout: TIMEOUTS.page });
    await b.waitForText('This conversation is read-only.');
    assert((await b.count('#chat-composer')) === 0, 'no message box for admins', 'composer present');
    return 'admin sees the chat read-only, with the reason';
  });
}

// ---- owners
async function testOwnerManagement() {
  await run.step('Owner lookup', { page: '/admin/owners' }, async () => {
    await b.goto('/admin/owners');
    await b.waitForText('Look up an owner');
    const id = LIVE && TEST_TAG_ID ? TEST_TAG_ID : 'TB-ZZZZ-9999';
    await b.fill('input[aria-label="TagBack ID"]', id);
    await b.click('Look up owner', { within: 'form' });
    const shown = await b.waitForAnyText(
      ['Owner lookup needs a real Firebase project', 'has no owner yet', 'Tags owned', "You don't have permission"],
      { timeout: TIMEOUTS.page }
    );
    if (shown === 'Tags owned') {
      assert(await b.hasText('Disable account') || (await b.hasText('Re-enable account')), 'disable control present', 'missing');
      return `owner found for ${id} (not disabled — read-only)`;
    }
    return `result: ${shown}`;
  });
}

// ---- error log
async function testErrorLogs() {
  await run.step('Error log', { page: '/admin/errors' }, async () => {
    await b.goto('/admin/errors');
    const shown = await b.waitForAnyText(['No errors reported', 'Pages:'], { timeout: TIMEOUTS.page });
    if (shown === 'Pages:' && (await b.hasText('Clear all'))) {
      await b.click('Clear all');
      await b.waitForText('Clear the whole error log?');
      await b.click('Cancel', { within: '[role=dialog]' });
      return 'error groups listed; Clear all asks first; cancelled';
    }
    return 'empty error log';
  });
}

// ---- settings
async function testAdminSettings() {
  await run.step('Admin Settings', { page: '/admin/settings' }, async () => {
    await b.goto('/admin/settings');
    await b.waitForText('Admin signup passcode');
    await b.waitFor(`!document.body.innerText.includes('Status: loading')`, { what: 'passcode status' });
    if (LIVE) assert(await b.hasText('Admin (set by the setup script)') || (await b.hasText('Admin (signed up with passcode)')), 'admin access badge', 'missing');
    let note = 'passcode card, error log link, developer tools';
    if (await b.eval(`[...document.querySelectorAll('button')].some((x) => x.innerText.trim() === 'Turn off')`)) {
      await b.click('Turn off');
      await b.waitForText('Turn off admin sign-up?');
      await b.click('Cancel', { within: '[role=dialog]' });
      note += '; Turn off asks first (cancelled)';
    }
    if (!LIVE) {
      await b.click('Register test tag');
      await b.waitForText('Preview mode — no Firebase project is configured');
      note += '; test-tag button refuses in preview';
    }
    return note;
  });
}

async function logoutAdmin() {
  if (!LIVE) return run.skip('Sign out', 'preview mode has no session');
  await run.step('Sign out', { page: '/admin/settings' }, async () => {
    await b.goto('/admin/settings');
    await b.click('Log out', { within: 'main' });
    await b.waitFor(`location.pathname === '/'`, { what: 'landing page' });
    await b.goto('/admin/inventory');
    await b.waitForPath('/admin/login', { timeout: TIMEOUTS.page });
    return 'signed out; console redirects to /admin/login';
  });
}

// ---- main
async function main() {
  console.log(`[ADMIN] Starting admin driver — mode: ${MODE}${LIVE ? `, writes: ${ALLOW_WRITES ? `on (TEST_TAG_ID=${TEST_TAG_ID || 'unset'})` : 'off'}` : ''}`);
  const app = await startApp(ROLE);
  b = await launchBrowser(ROLE, { debugPort: 9402, baseUrl: app.baseUrl });
  await b.init(VIEWPORTS.desktop);
  await b.addInitScript(FAKE_NDEF_READER);
  run = createRunner(ROLE, b);
  let code = 1;
  try {
    await testConsoleNeedsSignIn();
    await loginAsAdmin();
    await testAdminConsole();
    await testNfcRegistration();
    await testInventory();
    await testBlacklistFlow();
    await testTagContent();
    await testModeration();
    await testOwnerManagement();
    await testErrorLogs();
    await testAdminSettings();
    await logoutAdmin();
  } catch (err) {
    if (!(err instanceof CriticalFailure)) throw err;
    console.log(`[ADMIN] Stopped: ${err.message}`);
  } finally {
    code = run.summary();
    b.close();
    app.stop();
  }
  console.log('[ADMIN] Admin driver complete');
  process.exitCode = code;
}

main().catch((err) => {
  console.error(`[ADMIN] Driver crashed: ${err.stack || err}`);
  process.exitCode = 1;
});
