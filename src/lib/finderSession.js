import { nanoid } from 'nanoid';

const KEY = 'reclaim_finder_token';

// Ephemeral fallback when localStorage throws (private mode, storage
// blocked). Module-scoped so every call within the same tab/session gets
// the SAME token — without this, each getFinderToken() call minted a fresh
// random id, so a private-mode finder was treated as a stranger on every
// re-render, orphaning their own in-progress report/chat mid-session.
let ephemeralToken = null;

// Persistent anonymous identity for finders (no account). Stored in
// localStorage, so the finder can still reply in their chats from this
// browser. Re-scanning a tag offers the chat again via rememberChatForTag
// below (same browser only).
export function getFinderToken() {
  try {
    let token = localStorage.getItem(KEY);
    if (!token) {
      token = nanoid(24);
      localStorage.setItem(KEY, token);
    }
    return token;
  } catch {
    // Private mode / storage blocked: fall back to one ephemeral token for
    // the tab's lifetime (still won't survive a reload/new tab — there's no
    // storage to persist it in — but at least stays stable within one).
    if (!ephemeralToken) ephemeralToken = nanoid(24);
    return ephemeralToken;
  }
}

// UI_UX_IMPROVEMENT_ROUND2.md B2: the chat a finder started from a tag, so
// tapping the same tag again offers "Continue your conversation" instead
// of a new report. One localStorage entry per tag, written once when the
// report is sent. Same browser only — nothing here syncs across devices,
// and clearing browser data removes it.
const CHAT_KEY_PREFIX = 'tagback_finder_chat_';
const CHAT_ID_RE = /^[A-Za-z0-9_-]{10,64}$/;

export function rememberChatForTag(tagId, chatId) {
  try {
    localStorage.setItem(CHAT_KEY_PREFIX + tagId, chatId);
  } catch {
    // Storage blocked: the chat link itself is the only way back.
  }
}

// Returns a stored chat id, or null (missing, malformed, or storage blocked).
export function chatForTag(tagId) {
  try {
    const id = localStorage.getItem(CHAT_KEY_PREFIX + tagId);
    if (id && CHAT_ID_RE.test(id)) return id;
    if (id) localStorage.removeItem(CHAT_KEY_PREFIX + tagId);
  } catch {
    // Fall through.
  }
  return null;
}

export function forgetChatForTag(tagId) {
  try {
    localStorage.removeItem(CHAT_KEY_PREFIX + tagId);
  } catch {
    // Nothing to do.
  }
}
