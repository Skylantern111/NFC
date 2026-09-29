// Shared, role-neutral settings for drivers/user-driver.js and
// drivers/admin-driver.js: where the app runs, timeouts, the browser, and
// which environment the drivers may touch. No workflow lives here — each
// role's steps stay in its own driver (see drivers/README.md).
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DRIVERS_DIR = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = resolve(DRIVERS_DIR, '..');
export const OUTPUT_DIR = join(DRIVERS_DIR, 'output');

// Local, git-ignored settings (drivers/.env.drivers — see drivers.env.example).
const envFile = join(DRIVERS_DIR, '.env.drivers');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const env = process.env;

// preview: the app with Firebase config blanked — mock data, no sign-in, no
//          database. Safe; nothing real is read or written. Default.
// live:    a real deployment (BASE_URL) with real test accounts.
export const MODE = env.DRIVER_MODE === 'live' ? 'live' : 'preview';

// Writes in live mode (claim, Lost Mode, recovery, release, blacklist) need
// BOTH flags, and only ever touch TEST_TAG_ID. Without them the live run is
// read-only: it opens dialogs and cancels them.
export const ALLOW_WRITES = MODE === 'live' && env.DRIVER_ALLOW_WRITES === '1';
export const TEST_TAG_ID = env.TEST_TAG_ID || '';

export const TIMEOUTS = {
  page: Number(env.DRIVER_PAGE_TIMEOUT_MS || 20000), // a route to settle
  step: Number(env.DRIVER_STEP_TIMEOUT_MS || 10000), // one element/state
};

export const VIEWPORTS = {
  phone: { width: 375, height: 812, mobile: true },
  desktop: { width: 1280, height: 900, mobile: false },
};

export const CHROME_PATH =
  env.CHROME_PATH ||
  [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].find((p) => existsSync(p));

export const HEADLESS = env.DRIVER_HEADLESS !== '0';

// Role credentials are read by each driver separately (never shared):
// TEST_USER_EMAIL / TEST_USER_PASSWORD in user-driver.js,
// TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD in admin-driver.js.
export function requireEnv(names, role) {
  const missing = names.filter((n) => !env[n]);
  if (missing.length) {
    throw new Error(`[${role}] live mode needs ${missing.join(', ')} (set them in drivers/.env.drivers).`);
  }
  return Object.fromEntries(names.map((n) => [n, env[n]]));
}

// The app URL. Preview mode starts its own Vite dev server with the
// Firebase variables blanked (process env beats .env in Vite), so preview
// can never reach the real project. Live mode must name its BASE_URL.
export async function startApp(role) {
  if (MODE === 'live') {
    if (!env.BASE_URL) throw new Error(`[${role}] live mode needs BASE_URL.`);
    return { baseUrl: env.BASE_URL.replace(/\/$/, ''), stop: () => {} };
  }
  if (env.BASE_URL) {
    // Caller runs a preview server already.
    return { baseUrl: env.BASE_URL.replace(/\/$/, ''), stop: () => {} };
  }
  const port = Number(env.DRIVER_PREVIEW_PORT || (role === 'ADMIN' ? 5298 : 5297));
  const blank = {
    VITE_FIREBASE_API_KEY: '',
    VITE_FIREBASE_AUTH_DOMAIN: '',
    VITE_FIREBASE_PROJECT_ID: '',
    VITE_FIREBASE_STORAGE_BUCKET: '',
    VITE_FIREBASE_MESSAGING_SENDER_ID: '',
    VITE_FIREBASE_APP_ID: '',
  };
  const vite = spawn(process.execPath, [join(PROJECT_ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort'], {
    cwd: PROJECT_ROOT,
    env: { ...env, ...blank },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  vite.stderr.on('data', (d) => (stderr += d));
  const baseUrl = `http://localhost:${port}`;
  const started = Date.now();
  while (Date.now() - started < 30000) {
    if (vite.exitCode !== null) throw new Error(`[${role}] preview server exited: ${stderr.slice(0, 400)}`);
    try {
      const res = await fetch(baseUrl);
      if (res.ok) return { baseUrl, stop: () => vite.kill() };
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  vite.kill();
  throw new Error(`[${role}] preview server did not start on ${baseUrl}.`);
}
