import { useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, firebaseReady } from '../firebase/config';

// Realistic placeholder data so Dashboard/Items still preview when no real
// Firebase project is configured (mirrors the `*Mock()` convention used in
// NfcLanding.jsx). Kept as functions (not constants) so each hook instance
// gets its own object identity.
export function ownerItemsMock() {
  // Snapshot the mock "lost since" instants once per call rather than
  // closing over `Date.now()` inside toMillis() — a real Firestore Timestamp
  // returns the same value on every call, and Dashboard.jsx's stale-nudge
  // dismissal relies on that (it keys off lostSince.toMillis(), which must
  // stay stable across renders or a dismiss can never match the item it
  // dismissed).
  const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
  const sixteenDaysAgo = Date.now() - 16 * 24 * 60 * 60 * 1000;
  return [
    {
      tagId: 'mock-tag-1',
      itemName: 'Black Travel Backpack',
      isLostMode: true,
      lostMessage: 'Lost at the airport — reward for safe return!',
      rewardAmount: 40,
      lostSince: { toMillis: () => twoHoursAgo },
    },
    {
      // Lost 16 days ago, no open report against it — demonstrates the
      // Dashboard.jsx stale-lost nudge (§4.5/§5.8) alongside mock-tag-1's
      // active-incident hero card.
      tagId: 'mock-tag-2',
      itemName: 'Car Keys',
      isLostMode: true,
      lostMessage: 'Lost somewhere near the office parking lot.',
      rewardAmount: 0,
      lostSince: { toMillis: () => sixteenDaysAgo },
    },
    { tagId: 'mock-tag-3', itemName: 'AirPods Case', isLostMode: false, lostMessage: '', rewardAmount: 0 },
  ];
}

export function ownerReportsMock() {
  return [
    {
      id: 'mock-report-1',
      tagId: 'mock-tag-1',
      initialMessage: 'Found it near baggage claim — left with the airline desk.',
      location: { lat: 40.6413, lng: -73.7781, accuracy: 15 },
      status: 'open',
      // Shaped like a Firestore Timestamp so callers can uniformly call .toMillis().
      timestamp: { toMillis: () => Date.now() - 2 * 60 * 60 * 1000 },
    },
  ];
}

export function ownerChatsMock() {
  return [
    {
      id: 'mock-chat-1',
      tagId: 'mock-tag-1',
      reportId: 'mock-report-1',
      lastMessageText: 'Found it near baggage claim — left with the airline desk.',
      lastMessageAt: { toMillis: () => Date.now() - 2 * 60 * 60 * 1000 },
      unreadFor: ['owner'],
    },
  ];
}

export function ownerNotificationsMock() {
  return [
    {
      id: 'mock-notif-1',
      type: 'report',
      tagId: 'mock-tag-1',
      chatId: 'mock-chat-1',
      read: false,
      createdAt: { toMillis: () => Date.now() - 2 * 60 * 60 * 1000 },
    },
  ];
}

// Live: itemOwners where ownerUid == uid -> the owner's tagIds. Shared by
// every hook below that needs to join another collection ("my chats", "my
// notifications") against the owner's own tags, since none of those docs
// carry ownerUid directly (itemOwners stays private — see firestore.rules).
export function useOwnerTagIds(user) {
  const [tagIds, setTagIds] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!firebaseReady || !user) return;
    setLoaded(false);
    const q = query(collection(db, 'itemOwners'), where('ownerUid', '==', user.uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setTagIds(snap.docs.map((d) => d.id));
        setLoaded(true);
      },
      () => setLoaded(true)
    );
    return unsub;
  }, [user]);

  if (!firebaseReady) {
    return { tagIds: ownerItemsMock().map((i) => i.tagId), loaded: true };
  }
  return { tagIds, loaded };
}

// Live join: itemOwners (ownerUid == uid) -> items/{tagId}. In placeholder
// mode returns a static mock list, but also exposes `updateMockItem` so
// pages like Items.jsx can locally preview a toggle without persistence.
export function useOwnerItems(user) {
  const [mockItems, setMockItems] = useState(ownerItemsMock);
  const { tagIds, loaded: ownersLoaded } = useOwnerTagIds(user);
  const [itemsById, setItemsById] = useState({});

  useEffect(() => {
    if (!firebaseReady || tagIds.length === 0) return;
    const unsubs = tagIds.map((tagId) =>
      onSnapshot(
        doc(db, 'items', tagId),
        (snap) => {
          setItemsById((prev) => ({
            ...prev,
            [tagId]: snap.exists() ? { tagId, ...snap.data() } : null,
          }));
        },
        () => {
          setItemsById((prev) => ({ ...prev, [tagId]: null }));
        }
      )
    );
    return () => unsubs.forEach((u) => u());
    // tagIds is derived data (small, changes rarely) — join for a stable dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tagIds.join(',')]);

  const updateMockItem = (tagId, patch) =>
    setMockItems((xs) => xs.map((x) => (x.tagId === tagId ? { ...x, ...patch } : x)));

  if (!firebaseReady) {
    return { items: mockItems, loading: false, updateMockItem };
  }

  const items = tagIds.map((id) => itemsById[id]).filter(Boolean);
  const loading = !ownersLoaded || tagIds.some((id) => itemsById[id] === undefined);
  return { items, loading, updateMockItem: () => {} };
}

// Live open reports for a set of owner tagIds. Firestore `in` supports up to
// 30 disjunction values, which comfortably covers a single owner's items.
export function useOwnerOpenReports(tagIds) {
  const key = useMemo(() => tagIds.slice().sort().join(','), [tagIds]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firebaseReady) {
      setReports(ownerReportsMock());
      setLoading(false);
      return;
    }
    if (tagIds.length === 0) {
      setReports([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(
      collection(db, 'reports'),
      where('tagId', 'in', tagIds.slice(0, 30)),
      where('status', '==', 'open')
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setReports(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { reports, loading: firebaseReady ? loading : false };
}

// NfcLanding.jsx creates `reports` and `chats` as two separate addDoc calls
// (no chatId stored back on the report), so the hero card looks the paired
// chat up by querying chats where reportId == report.id.
export async function findChatIdForReport(report) {
  if (!firebaseReady) return `preview-${report.tagId}`;
  try {
    const q = query(collection(db, 'chats'), where('reportId', '==', report.id), limit(1));
    const snap = await getDocs(q);
    if (!snap.empty) return snap.docs[0].id;
  } catch {
    // Fall through to null — hero card just omits the "Open chat" link.
  }
  return null;
}

// Live: every chat against one of the owner's tags — the join described on
// useOwnerTagIds. Sorted newest-activity-first client-side since Firestore
// can't combine an `in` filter with orderBy on a different field without a
// composite index.
export function useOwnerChats(user) {
  const { tagIds, loaded: tagsLoaded } = useOwnerTagIds(user);
  const key = useMemo(() => tagIds.slice().sort().join(','), [tagIds]);
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firebaseReady) {
      setChats(ownerChatsMock());
      setLoading(false);
      return;
    }
    if (!tagsLoaded) return;
    if (tagIds.length === 0) {
      setChats([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(collection(db, 'chats'), where('tagId', 'in', tagIds.slice(0, 30)));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setChats(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tagsLoaded]);

  const sorted = useMemo(
    () =>
      chats.slice().sort((a, b) => (b.lastMessageAt?.toMillis?.() ?? 0) - (a.lastMessageAt?.toMillis?.() ?? 0)),
    [chats]
  );

  return { chats: sorted, loading: firebaseReady ? loading : false };
}

// Live: every notification against one of the owner's tags (same join
// shape as useOwnerChats/useOwnerOpenReports). Newest first, plus an
// unread count for the sidebar badge (§5.1).
export function useOwnerNotifications(user) {
  const { tagIds, loaded: tagsLoaded } = useOwnerTagIds(user);
  const key = useMemo(() => tagIds.slice().sort().join(','), [tagIds]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firebaseReady) {
      setNotifications(ownerNotificationsMock());
      setLoading(false);
      return;
    }
    if (!tagsLoaded) return;
    if (tagIds.length === 0) {
      setNotifications([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(collection(db, 'notifications'), where('tagId', 'in', tagIds.slice(0, 30)));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setNotifications(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tagsLoaded]);

  const sorted = useMemo(
    () =>
      notifications
        .slice()
        .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0)),
    [notifications]
  );
  const unreadCount = useMemo(() => sorted.filter((n) => !n.read).length, [sorted]);

  return { notifications: sorted, unreadCount, loading: firebaseReady ? loading : false };
}

export async function markNotificationRead(notifId) {
  if (!firebaseReady) return;
  await updateDoc(doc(db, 'notifications', notifId), { read: true });
}

// Called from the finder's own flows (NfcLanding filing a report, Chat
// sending a message) — never from owner actions on their own item, since an
// owner doesn't need to be notified about their own change.
export async function notifyOwner({ type, tagId, chatId, reportId }) {
  if (!firebaseReady) return;
  await addDoc(collection(db, 'notifications'), {
    type,
    tagId,
    chatId: chatId || null,
    reportId: reportId || null,
    read: false,
    createdAt: serverTimestamp(),
  });
}

// Stamps the parent chat doc's activity markers after a message is sent, so
// Messages.jsx can show a snippet/timestamp without reading every thread.
// `unreadFor` tracks which side hasn't seen the latest message yet.
export async function touchChatActivity(chatId, { sender, text }) {
  if (!firebaseReady) return;
  const otherRole = sender === 'owner' ? 'finder' : 'owner';
  await updateDoc(doc(db, 'chats', chatId), {
    lastMessageAt: serverTimestamp(),
    lastMessageText: text.slice(0, 140),
    unreadFor: arrayUnion(otherRole),
  });
}

// Marks a chat read for one side (owner viewing Messages/Chat, or a finder
// revisiting their chat link).
export async function markChatRead(chatId, role) {
  if (!firebaseReady) return;
  await updateDoc(doc(db, 'chats', chatId), { unreadFor: arrayRemove(role) });
}
