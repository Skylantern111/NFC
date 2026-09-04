import { nanoid } from 'nanoid';

const KEY = 'reclaim_finder_token';

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
    // Private mode / storage blocked: fall back to an ephemeral token.
    return nanoid(24);
  }
}
