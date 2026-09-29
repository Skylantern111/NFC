// USER DRIVER — a normal TagBack owner, and nothing else.
//
// Covers the owner console only: sign-up form, sign-in, Dashboard, My Items,
// claim, edit item, Lost Mode, finder activity, chat, recovery, recovered
// list, release (confirmation), Messages, Notifications, Settings, phone
// navigation, sign-out — and checks that this account can't get into the
// admin console. It never opens an admin page except to confirm it is
// refused. Admin checks live in admin-driver.js.
//
//   node drivers/user-driver.js            (preview mode, safe default)
//   DRIVER_MODE=live node drivers/user-driver.js
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

const ROLE = 'USER';
const LIVE = MODE === 'live';
// Owner credentials only — this driver never reads the admin variables.
const creds = LIVE ? requireEnv(['TEST_USER_EMAIL', 'TEST_USER_PASSWORD'], ROLE) : {};
if (LIVE && process.env.TEST_ADMIN_EMAIL && process.env.TEST_ADMIN_EMAIL === creds.TEST_USER_EMAIL) {
  throw new Error('[USER] TEST_USER_EMAIL must be a different account from TEST_ADMIN_EMAIL.');
}

// Preview mode has one known mock item without Lost Mode, and a mock
// recovered chat (lib/ownerItems.js *Mock()).
const PREVIEW_ITEM = 'AirPods Case';
const LOAD_ERROR_TITLES = ["You're offline", "You don't have access to this", "We couldn't load"];

// Which state My Items is in: 'list', 'empty' or a load-error title.
async function waitForItemsState() {
  const titles = JSON.stringify(LOAD_ERROR_TITLES);
  await b.waitFor(
    `document.querySelector('[aria-label^="More actions for "]') || document.body.innerText.includes('No items yet') || ${titles}.some((t) => document.body.innerText.includes(t))`,
    { what: 'My Items to show a list, the empty state or a load error', timeout: TIMEOUTS.page }
  );
  if (await b.count('[aria-label^="More actions for "]')) return 'list';
  if (await b.hasText('No items yet')) return 'empty';
  return b.eval(`${titles}.find((t) => document.body.innerText.includes(t))`);
}

let b; // browser
let run; // step runner
const state = { verified: true, itemName: null, ownsTestTag: false, testTagChatId: null };

// ---- sign-up form (client-side checks only; never submits a real account)
async function testRegistrationForm() {
  await run.step('Registration form validation', { page: '/register' }, async () => {
    await b.goto('/register');
    await b.click('Create account', { within: 'form' });
    await b.waitForText('Enter your name.');
    assert(await b.hasText('Enter your email.'), 'email required error', 'missing');
    assert((await b.focused()).includes('displayName'), 'focus on first invalid field (Name)', await b.focused());
    await b.fill('#displayName', 'TEST_USER form check');
    await b.fill('#email', 'first@example.com');
    await b.fill('#confirmEmail', 'second@example.com');
    await b.click('Create account', { within: 'form' });
    await b.waitForText('The two emails don’t match.');
    assert((await b.path()) === '/register', 'stays on /register (nothing submitted)', await b.path());
    return 'required fields and mismatched emails are caught before sending';
  });
}

// ---- sign-in
async function loginAsUser() {
  if (!LIVE) {
    run.skip('Sign in as user', 'preview mode has no sign-in (auth guards are bypassed)');
    return;
  }
  await run.step('Sign in as user', { page: '/login', critical: true }, async () => {
    await b.goto('/login');
    await b.fill('#email', creds.TEST_USER_EMAIL);
    await b.fill('#password', creds.TEST_USER_PASSWORD);
    await b.click('Sign in', { within: 'form' });
    await b.waitForPath('/dashboard', { timeout: TIMEOUTS.page });
    return 'landed on /dashboard';
  });
}

async function testVerificationState() {
  await run.step('Email verification state', { page: '/dashboard/settings' }, async () => {
    await b.goto('/dashboard/settings');
    await b.waitForText('Settings');
    if (!LIVE) return 'preview mode: no account, verification not shown';
    const status = await b.waitForAnyText(['Email verified', 'Email not verified']);
    state.verified = status === 'Email verified';
    return state.verified ? 'account email is verified' : 'account email is NOT verified — claim is expected to be blocked';
  });
}

// ---- dashboard
async function testUserDashboard() {
  await run.step('Dashboard', { page: '/dashboard' }, async () => {
    await b.goto('/dashboard');
    const shown = await b.waitForAnyText(['Action needed', 'Get started in', 'All clear', ...LOAD_ERROR_TITLES], { timeout: TIMEOUTS.page });
    if (LOAD_ERROR_TITLES.some((t) => shown.startsWith(t))) {
      assert(await b.hasText('Try again'), 'load error offers Try again', 'no Try again');
      await b.click('Try again');
      return `load error shown ("${shown}") with Try again — not an empty state`;
    }
    const order = await b.eval(`(() => { const t = document.body.innerText; const a = t.indexOf('Action needed'); const y = t.indexOf('Your items'); return a === -1 || y === -1 || a < y; })()`);
    assert(order, '"Action needed" above "Your items"', 'counts are above actions');
    const tile = await b.eval(`[...document.querySelectorAll('a[href="/dashboard/messages?filter=open"]')].map((a) => a.innerText.replace(/\\s+/g, ' ')).join('')`);
    if (tile) assert(tile.includes('Open chats'), 'tile labelled "Open chats" (matches Messages Open filter)', tile);
    return `state: ${shown}`;
  });

  await run.step('Offline state', { page: '/dashboard' }, async () => {
    await b.send('Network.enable');
    await b.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    try {
      await b.waitForText("You're offline", { timeout: 5000 });
    } finally {
      await b.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    }
    await b.waitFor(`!document.body.innerText.includes("You're offline — changes will send")`, { what: 'offline banner to clear' });
    return 'offline banner appears and clears on reconnect';
  });
}

// ---- navigation (phone): tab bar + drawer, and no admin links
async function testUserNavigation() {
  await run.step('Phone navigation', { page: '/dashboard' }, async () => {
    await b.setViewport(VIEWPORTS.phone);
    await b.goto('/dashboard');
    const tabs = await b.eval(`[...document.querySelectorAll('nav[aria-label=Main] a')].filter((a) => a.getBoundingClientRect().bottom > innerHeight - 80).map((a) => a.getAttribute('href'))`);
    for (const href of ['/dashboard', '/dashboard/items', '/dashboard/messages', '/dashboard/notifications']) {
      assert(tabs.includes(href), `bottom tab ${href}`, JSON.stringify(tabs));
    }
    await b.click('Open menu');
    await b.waitFor(`document.querySelector('[role=dialog]')`, { what: 'drawer' });
    const drawer = await b.eval(`[...document.querySelectorAll('[role=dialog] a, [role=dialog] button')].map((e) => e.innerText.trim()).filter(Boolean)`);
    for (const label of ['Settings', 'Privacy', 'Log out']) assert(drawer.some((d) => d.includes(label)), `drawer has ${label}`, JSON.stringify(drawer));
    assert(!drawer.some((d) => /Inventory|Moderation|Owners|NFC Register/.test(d)), 'no admin entries in drawer', JSON.stringify(drawer));
    await b.key('Escape');
    await b.waitFor(`!document.querySelector('[role=dialog]')`, { what: 'drawer to close' });
    const adminLinks = await b.count('a[href^="/admin"]');
    assert(adminLinks === 0, 'no /admin links anywhere in the owner console', `${adminLinks} found`);
    await b.setViewport(VIEWPORTS.desktop);
    return 'tabs Home/My Items/Messages/Alerts; drawer Settings/Privacy/Log out; no admin links';
  });
}

// ---- items
async function testUserItems() {
  await run.step('My Items', { page: '/dashboard/items' }, async () => {
    await b.goto('/dashboard/items');
    const shown = await waitForItemsState();
    if (shown === 'empty') {
      assert(await b.hasText('Claim your first tag'), 'empty state offers Claim your first tag', 'no next action');
      return 'empty state with next action';
    }
    if (shown !== 'list') return `load error shown: ${shown}`;
    const names = await b.eval(`[...document.querySelectorAll('[aria-label^="More actions for "]')].map((e) => e.getAttribute('aria-label').replace('More actions for ', ''))`);
    state.ownsTestTag = TEST_TAG_ID ? await b.hasText(TEST_TAG_ID) : false;
    state.itemName = LIVE ? null : PREVIEW_ITEM;
    if (LIVE && state.ownsTestTag) {
      state.itemName = await b.eval(`(() => { const li = [...document.querySelectorAll('li')].find((l) => l.innerText.includes(${JSON.stringify(TEST_TAG_ID)}) && l.querySelector('[aria-label^="More actions for "]')); return li ? li.querySelector('[aria-label^="More actions for "]').getAttribute('aria-label').replace('More actions for ', '') : null; })()`);
    } else if (LIVE) {
      state.itemName = names[0] || null;
    }
    return `${names.length} item(s)`;
  });
}

async function testClaimTag() {
  await run.step('Claim tag page', { page: '/dashboard/items/claim' }, async () => {
    await b.goto('/dashboard/items/claim');
    if (LIVE && !state.verified) {
      await b.waitForText('Verify your email first');
      return 'unverified account sees the verify gate, as expected';
    }
    await b.waitForText('Claim a tag');
    // Simulated reader (see browser.js) — checks the scan states only.
    await b.waitForText('Ready to scan');
    await b.click('Start scanning');
    await b.waitForText('Looking for NFC tag…');
    await b.click('Enter Tag ID manually');
    await b.waitFor(`document.activeElement?.id === 'tagId'`, { what: 'focus on TagBack ID field' });
    await b.click('Claim tag', { within: 'form' });
    await b.waitForText('Enter the TagBack ID, or scan the tag.');
    assert(await b.hasText('Choose a category.'), 'category required error', 'missing');
    await b.fill('#tagId', 'hello');
    await b.click('Claim tag', { within: 'form' });
    await b.waitForText('That doesn’t look like a TagBack ID');
    return 'scan states (simulated reader), manual entry, field errors';
  });

  if (!LIVE) return run.skip('Claim TEST_TAG_ID', 'preview mode has no database');
  if (!ALLOW_WRITES || !TEST_TAG_ID) return run.skip('Claim TEST_TAG_ID', 'writes off (set DRIVER_ALLOW_WRITES=1 and TEST_TAG_ID)');
  if (state.ownsTestTag) return run.skip('Claim TEST_TAG_ID', `${TEST_TAG_ID} is already on this account`);
  if (!state.verified) return run.skip('Claim TEST_TAG_ID', 'account email not verified');
  await run.step('Claim TEST_TAG_ID', { page: '/dashboard/items/claim' }, async () => {
    await b.goto(`/dashboard/items/claim?tagId=${encodeURIComponent(TEST_TAG_ID)}`);
    await b.fill('#itemName', 'TEST_TAG item');
    await b.click('css:#category');
    await b.click('Other', { within: '[role=listbox]' });
    await b.click('Claim tag', { within: 'form' });
    await b.waitForPath('/dashboard/items', { timeout: TIMEOUTS.page });
    await b.waitForText('Tag connected successfully');
    state.ownsTestTag = true;
    state.itemName = 'TEST_TAG item';
    return `${TEST_TAG_ID} claimed`;
  });
}

// Writes happen only in preview (mock data) or on TEST_TAG_ID with writes on.
const canWriteItem = () => !LIVE || (ALLOW_WRITES && state.ownsTestTag);

async function openItemMenu(name) {
  await b.goto('/dashboard/items');
  await b.waitForText(name, { timeout: TIMEOUTS.page });
  await b.click(`More actions for ${name}`);
  await b.waitFor(`document.querySelector('[role=menu]')`, { what: 'item menu' });
}

async function testEditItem() {
  if (!state.itemName) return run.skip('Edit item', 'no item on this account');
  await run.step('Edit item', { page: '/dashboard/items' }, async () => {
    await openItemMenu(state.itemName);
    await b.click('Edit item…', { within: '[role=menu]' });
    await b.waitFor(`document.querySelector('[role=dialog] #itemName')`, { what: 'edit dialog' });
    const current = await b.eval(`document.querySelector('[role=dialog] #itemName').value`);
    assert(current === state.itemName, `name prefilled with "${state.itemName}"`, current);
    await b.fill('[role=dialog] #itemName', '');
    await b.click('Save changes', { within: '[role=dialog]' });
    await b.waitFor(`document.querySelector('#itemName-error')`, { what: 'name error' });
    if (!canWriteItem()) {
      await b.key('Escape');
      await b.waitFor(`!document.querySelector('[role=dialog]')`, { what: 'dialog to close' });
      const focus = await b.focused();
      assert(focus.includes('More actions for'), 'focus back on the item menu button', focus);
      return 'prefilled, empty name refused, Escape returns focus (read-only run)';
    }
    const newName = LIVE ? 'TEST_TAG item (edited)' : 'White earbuds case';
    await b.fill('[role=dialog] #itemName', newName);
    await b.click('Save changes', { within: '[role=dialog]' });
    await b.waitFor(`!document.querySelector('[role=dialog]')`, { what: 'dialog to close after save' });
    await b.waitForText(newName);
    // Preview data is page state and resets on the next load; live keeps it.
    if (LIVE) state.itemName = newName;
    return `renamed to "${newName}"`;
  });
}

async function testLostMode() {
  if (!state.itemName) return run.skip('Lost Mode', 'no item on this account');
  await run.step('Lost Mode confirmation', { page: '/dashboard/items' }, async () => {
    await b.goto('/dashboard/items');
    await b.waitForText(state.itemName, { timeout: TIMEOUTS.page });
    const card = `li:has([aria-label="More actions for ${state.itemName}"])`;
    if (await b.eval(`!!document.querySelector(${JSON.stringify(card)})?.innerText.includes('I have it back')`)) {
      return 'item already in Lost Mode — confirmation not re-tested';
    }
    await b.click('Report lost', { within: card });
    await b.waitForText('When Lost Mode is on:');
    assert(await b.hasText('Turn on Lost Mode'), 'confirm button "Turn on Lost Mode"', 'missing');
    if (!canWriteItem()) {
      await b.click('Cancel', { within: '[role=dialog]' });
      return 'dialog explains Lost Mode; cancelled (read-only run)';
    }
    await b.click('Turn on Lost Mode', { within: '[role=dialog]' });
    await b.waitForText('Lost Mode is now active');
    await b.click('I have it back', { within: card });
    await b.click('Turn off Lost Mode', { within: '[role=dialog]' });
    await b.waitFor(`!document.querySelector(${JSON.stringify(card)})?.innerText.includes('Lost Mode is now active')`, { what: 'Lost Mode off' });
    return 'turned on (success message shown), then off again';
  });
}

// ---- finder activity, chat, recovery
async function testFinderActivity() {
  await run.step('Finder activity on Dashboard', { page: '/dashboard' }, async () => {
    await b.goto('/dashboard');
    await b.waitForAnyText(['Action needed', 'All clear', 'Get started in', ...LOAD_ERROR_TITLES], { timeout: TIMEOUTS.page });
    if (!(await b.hasText('Someone found your item'))) return 'no open finder report on this account';
    assert(await b.hasText('Reply to finder'), 'incident card offers Reply to finder', 'missing');
    if (LIVE && state.ownsTestTag && state.itemName) {
      // The Reply link on the incident card whose heading is the test item.
      state.testTagChatId = await b.eval(`(() => {
        const h = [...document.querySelectorAll('h3')].find((x) => x.innerText.trim() === ${JSON.stringify(state.itemName)});
        let card = h; while (card && !card.querySelector('a[href^="/chat/"]')) card = card.parentElement;
        return card ? card.querySelector('a[href^="/chat/"]').getAttribute('href') : null;
      })()`);
    }
    return 'incident card with Reply to finder';
  });
}

async function testChat() {
  // Preview: the only chat route is /chat/preview-<tag>, where the viewer is
  // the finder — owner-only controls (Mark as recovered) need live mode.
  const path = LIVE ? state.testTagChatId : '/chat/preview-mock-tag-1';
  if (!path) return run.skip('Chat', 'no chat on TEST_TAG_ID (needs a finder report first)');
  await run.step('Chat', { page: path }, async () => {
    await b.goto(path);
    await b.waitFor(`document.querySelector('#chat-composer') || document.body.innerText.includes('read-only')`, { what: 'chat to load' });
    await b.fill('#chat-composer', 'TEST_USER message');
    await b.key('Enter');
    await b.waitFor(`document.querySelector('[aria-label=Messages]')?.innerText.includes('TEST_USER message')`, { what: 'message in thread' });
    assert(await b.eval(`document.querySelector('#chat-composer').value === ''`), 'composer cleared after send', 'not cleared');
    const reportLabel = LIVE ? 'Report this finder' : 'Report the owner';
    await b.click(reportLabel);
    await b.waitFor(`document.querySelector('#report-reason')`, { what: 'report dialog' });
    const max = await b.eval(`document.querySelector('#report-reason').maxLength`);
    assert(max === 500, 'report reason limited to 500', String(max));
    await b.key('Escape');
    return 'message sent with Enter; report dialog (500 limit) cancelled';
  });

  if (!LIVE || !ALLOW_WRITES) return run.skip('Mark as recovered', LIVE ? 'writes off' : 'owner controls need live mode');
  await run.step('Mark as recovered', { page: path }, async () => {
    await b.goto(path);
    if (await b.hasText('Marked as recovered')) return 'already recovered';
    await b.click('Mark as recovered');
    await b.waitForText('Mark this item as recovered?');
    await b.click('Confirm recovered', { within: '[role=dialog]' });
    await b.waitForText('Recovered');
    return 'marked recovered';
  });
}

async function testRecoveredHistory() {
  await run.step('Recovered list', { page: '/dashboard/items' }, async () => {
    await b.goto('/dashboard/items');
    await waitForItemsState();
    const has = await b.eval(`!!document.querySelector('#recovered-heading')`);
    if (!LIVE) assert(has, 'preview shows the mock recovered chat', 'no Recovered section');
    return has ? 'Recovered section listed' : 'no recovered chats on this account';
  });
}

async function testReleaseConfirmation() {
  if (!state.itemName) return run.skip('Release tag', 'no item on this account');
  await run.step('Release confirmation', { page: '/dashboard/items' }, async () => {
    await openItemMenu(state.itemName);
    await b.click('Release tag…', { within: '[role=menu]' });
    await b.waitForText("This can't be undone.");
    const focus = await b.focused();
    assert(focus.includes('Cancel'), 'Cancel focused first', focus);
    await b.key('Escape');
    await b.waitFor(`!document.querySelector('[role=dialog]')`, { what: 'dialog to close' });
    return 'dialog lists what is deleted; Cancel first; Escape closes';
  });
}

async function releaseTestTag() {
  if (!LIVE || !ALLOW_WRITES || !state.ownsTestTag) return run.skip('Release TEST_TAG_ID', 'writes off or TEST_TAG_ID not on this account');
  await run.step('Release TEST_TAG_ID', { page: '/dashboard/items' }, async () => {
    await openItemMenu(state.itemName);
    await b.click('Release tag…', { within: '[role=menu]' });
    await b.click('Release tag', { within: '[role=dialog]' });
    await b.waitForText('Tag released', { timeout: TIMEOUTS.page });
    return `${TEST_TAG_ID} released back to stock`;
  });
}

// ---- messages, notifications, settings
async function testMessagesAndAlerts() {
  await run.step('Messages', { page: '/dashboard/messages' }, async () => {
    await b.goto('/dashboard/messages');
    await b.waitFor(
      `document.querySelector('[aria-label="Filter conversations"]') || ['No conversations yet', "We couldn't load your conversations", "You're offline", "You don't have access"].some((t) => document.body.innerText.includes(t))`,
      { what: 'Messages to show filters, the empty state or a load error', timeout: TIMEOUTS.page }
    );
    const shown = (await b.bodyText()).split(/\r?\n/).find((l) => /No conversations yet|couldn't load|offline|access/.test(l)) || 'list';
    if (await b.count('[aria-label="Filter conversations"] button')) {
      await b.click('Recovered', { within: '[aria-label="Filter conversations"]' });
      const pressed = await b.eval(`document.querySelector('[aria-label="Filter conversations"] [aria-pressed=true]')?.innerText`);
      assert(pressed === 'Recovered', 'Recovered filter pressed', String(pressed));
      assert((await b.path()).includes('filter=resolved'), 'URL keeps the filter', await b.path());
      return 'filters toggle (aria-pressed) and update the URL';
    }
    return `state: ${shown}`;
  });
  await run.step('Notifications', { page: '/dashboard/notifications' }, async () => {
    await b.goto('/dashboard/notifications');
    const shown = await b.waitForAnyText(['new.', "You're all caught up", 'We couldn\'t load your notifications'], { timeout: TIMEOUTS.page });
    return `state: ${shown}`;
  });
}

async function testSettings() {
  await run.step('Settings', { page: '/dashboard/settings' }, async () => {
    await b.goto('/dashboard/settings');
    const before = await b.eval(`document.documentElement.classList.contains('dark')`);
    await b.click('css:[role=switch]');
    const after = await b.eval(`document.documentElement.classList.contains('dark')`);
    assert(before !== after, 'Dark mode switch toggles the theme', `dark=${after}`);
    await b.click('css:[role=switch]');
    if (LIVE) {
      const original = await b.eval(`document.querySelector('#settings-name')?.value`);
      await b.fill('#settings-name', '');
      await b.click('Save changes');
      await b.waitForText('Enter your name.');
      await b.fill('#settings-name', original || 'TEST_USER');
      // The danger zone only renders for a signed-in account.
      await b.click('Delete my account');
      await b.waitForText('Delete your account?');
      const disabled = await b.eval(`[...document.querySelectorAll('[role=dialog] button')].find((x) => x.innerText.includes('Delete account'))?.disabled`);
      assert(disabled === true, '"Delete account" disabled until DELETE + password', String(disabled));
      await b.click('Cancel', { within: '[role=dialog]' });
      return 'theme switch, name validation, delete dialog guarded (never submitted)';
    }
    return 'theme switch (name and delete account need a signed-in account — live mode)';
  });
}

// ---- role separation
async function testUserCannotAccessAdmin() {
  if (!LIVE) return run.skip('Admin console is refused', 'preview mode bypasses route guards — only live mode can check this');
  for (const route of ['/admin/inventory', '/admin/moderation', '/admin/owners']) {
    await run.step(`Admin route refused: ${route}`, { page: route }, async () => {
      await b.goto(route);
      await b.waitForPath('/admin/login', { timeout: TIMEOUTS.page });
      await b.waitForText('does not have admin access');
      const sidebar = await b.hasText('Admin console') && (await b.count('a[href="/admin/moderation"]'));
      assert(!sidebar, 'no admin navigation rendered', 'admin sidebar visible');
      return 'redirected to /admin/login with "does not have admin access"';
    });
  }
}

async function logoutUser() {
  if (!LIVE) return run.skip('Sign out', 'preview mode has no session');
  await run.step('Sign out', { page: '/dashboard' }, async () => {
    await b.goto('/dashboard');
    await b.click('Log out');
    await b.waitFor(`location.pathname === '/'`, { what: 'landing page' });
    await b.goto('/dashboard/items');
    await b.waitForPath('/login', { timeout: TIMEOUTS.page });
    return 'signed out; owner pages redirect to /login';
  });
}

// ---- main
async function main() {
  console.log(`[USER] Starting user driver — mode: ${MODE}${LIVE ? `, writes: ${ALLOW_WRITES ? `on (TEST_TAG_ID=${TEST_TAG_ID || 'unset'})` : 'off'}` : ''}`);
  const app = await startApp(ROLE);
  b = await launchBrowser(ROLE, { debugPort: 9401, baseUrl: app.baseUrl });
  await b.init(VIEWPORTS.desktop);
  await b.addInitScript(FAKE_NDEF_READER);
  run = createRunner(ROLE, b);
  let code = 1;
  try {
    await testRegistrationForm();
    await loginAsUser();
    await testVerificationState();
    await testUserDashboard();
    await testUserNavigation();
    await testUserItems();
    await testClaimTag();
    await testUserItems(); // refresh after a possible claim
    await testEditItem();
    await testLostMode();
    await testFinderActivity();
    await testChat();
    await testRecoveredHistory();
    await testReleaseConfirmation();
    await testMessagesAndAlerts();
    await testSettings();
    await testUserCannotAccessAdmin();
    await releaseTestTag();
    await logoutUser();
  } catch (err) {
    if (!(err instanceof CriticalFailure)) throw err;
    console.log(`[USER] Stopped: ${err.message}`);
  } finally {
    code = run.summary();
    b.close();
    app.stop();
  }
  console.log('[USER] User driver complete');
  process.exitCode = code;
}

main().catch((err) => {
  console.error(`[USER] Driver crashed: ${err.stack || err}`);
  process.exitCode = 1;
});
