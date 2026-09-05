import { useEffect, useMemo, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { db, auth, firebaseReady } from '../firebase/config';
import { chunk } from './utils';

// Admin moderation queue (§4.13/§5.4). A chat lands here once its owner
// reports it (public/Chat.jsx writes chats/{id}.blocked = true). Listing it
// isn't itself an enforcement action — the real enforcement is banning the
// finder's session token, which firestore.rules#isBlockedToken then checks
// on every reports/chats/messages create.
export function moderationMocks() {
  return {
    chats: [
      {
        id: 'mock-chat-2',
        tagId: 'mock-tag-1',
        finderSessionToken: 'fnd_9x2a1demo',
        blockedReason: 'Spam links in every message.',
        blockedAt: { toMillis: () => Date.now() - 3 * 60 * 60 * 1000 },
      },
      {
        id: 'mock-chat-3',
        tagId: 'mock-tag-2',
        finderSessionToken: 'fnd_k7qz0demo',
        blockedReason: 'Harassment.',
        blockedAt: { toMillis: () => Date.now() - 26 * 60 * 60 * 1000 },
      },
    ],
    items: {
      'mock-tag-1': { itemName: 'Black Travel Backpack' },
      'mock-tag-2': { itemName: 'Car Keys' },
    },
  };
}

// Live: chats flagged by an owner, joined against items for the display
// name, plus the current blockedTokens set so the UI can show Ban/Unban
// per row. In placeholder mode, `toggleMockBan` stands in for the two real
// write functions below so the queue is still interactive to preview.
export function useModerationQueue() {
  const [chats, setChats] = useState([]);
  const [items, setItems] = useState({});
  const [bannedTokens, setBannedTokens] = useState(new Set());
  const [mockBanned, setMockBanned] = useState(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firebaseReady) return;
    const q = query(collection(db, 'chats'), where('blocked', '==', true));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setChats(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, []);

  useEffect(() => {
    if (!firebaseReady) return;
    const unsub = onSnapshot(collection(db, 'blockedTokens'), (snap) => {
      setBannedTokens(new Set(snap.docs.map((d) => d.id)));
    });
    return unsub;
  }, []);

  const tagKey = useMemo(() => [...new Set(chats.map((c) => c.tagId))].sort().join(','), [chats]);

  // `in` queries cap at 30 disjunction values — past 30 distinct reported
  // tags, chunk into multiple listeners instead of silently dropping the
  // rest (they'd otherwise render "Unknown item" with no explanation).
  useEffect(() => {
    if (!firebaseReady || !tagKey) {
      if (firebaseReady) setItems({});
      return;
    }
    const groups = chunk(tagKey.split(','), 30);
    const partials = groups.map(() => ({}));
    const unsubs = groups.map((group, i) =>
      onSnapshot(query(collection(db, 'items'), where('tagId', 'in', group)), (snap) => {
        partials[i] = Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]));
        setItems(Object.assign({}, ...partials));
      })
    );
    return () => unsubs.forEach((u) => u());
  }, [tagKey]);

  const toggleMockBan = (token) =>
    setMockBanned((s) => {
      const next = new Set(s);
      if (next.has(token)) next.delete(token);
      else next.add(token);
      return next;
    });

  if (!firebaseReady) {
    const mock = moderationMocks();
    return { chats: mock.chats, items: mock.items, bannedTokens: mockBanned, loading: false, toggleMockBan };
  }
  return { chats, items, bannedTokens, loading, toggleMockBan: () => {} };
}

export async function banToken(token, { tagId, reason } = {}) {
  if (!firebaseReady) return;
  await setDoc(doc(db, 'blockedTokens', token), {
    bannedAt: serverTimestamp(),
    bannedBy: auth.currentUser?.uid || null,
    tagId: tagId || null,
    reason: reason || null,
  });
}

export async function unbanToken(token) {
  if (!firebaseReady) return;
  await deleteDoc(doc(db, 'blockedTokens', token));
}

// Admin marks a reported chat as reviewed (handled, no ban needed) so it can
// be filtered out of the default queue view without pretending the report
// never happened — see Moderation.jsx's "reviewed" filter.
export async function markChatReviewed(chatId) {
  if (!firebaseReady) return;
  await updateDoc(doc(db, 'chats', chatId), {
    reviewedAt: serverTimestamp(),
    reviewedBy: auth.currentUser?.uid || null,
  });
}
