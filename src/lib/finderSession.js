import { nanoid } from 'nanoid';

const KEY = 'reclaim_finder_token';

// Ephemeral fallback when localStorage throws (private mode, storage
// blocked). Module-scoped so every call within the same tab/session gets
// the SAME token — without this, each getFinderToken() call minted a fresh
// random id, so a private-mode finder was treated as a stranger on every
// re-render, orphaning their own in-progress report/chat mid-session.
let ephemeralToken = null;

// Persistent anonymous identity for finders (no account). Stored in
// localStorage so re-scanning a tag restores the same chat session.
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
