// End-to-end rules replay (SYSTEM_AUDIT_ROUND3.md D1).
//
// firestore.rules.test.js checks single rules with hand-made data. That
// missed two live bugs where every owner was blocked (ROUND2 A0: profiles
// without `disabled`; ROUND3 A1: the owner's own itemOwners query). This
// file replays the app's real Firestore calls — same shapes as the code in
// src/ — in order, as three realistic users:
//   - an owner who signed up normally (has a users/{uid} profile doc)
//   - a finder with no account
//   - a passcode admin (users/{uid}.isAdmin, email verified — passcode admins
//     must verify, EMAIL_OWNERSHIP_PLAN.md D1)
// Steps share state and run in order; if one fails, later ones may too —
// read the first failure.
//
// Run with `npm test` (starts the Firestore emulator).

import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, test } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  deleteField,
  doc,
  documentId,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

const TAG = 'TB-FLOW-2345';
const OWNER = 'flow-owner';
const ADMIN = 'flow-admin';
const TOKEN = 'flow-finder-token-0123456';
const PASSCODE = 'FLOWPASS';

let env;
const dbs = {};
const owner = () => (dbs.owner ||= env.authenticatedContext(OWNER, { email: 'owner@example.com', email_verified: true }).firestore());
const admin = () => (dbs.admin ||= env.authenticatedContext(ADMIN, { email: 'admin@example.com', email_verified: true }).firestore());
const finder = () => (dbs.finder ||= env.unauthenticatedContext().firestore());
const stranger = () => (dbs.stranger ||= env.authenticatedContext('flow-stranger').firestore());
const ids = {};

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'tagback-flows-test',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
  await env.clearFirestore();
  // The only seeded doc: an existing admin set the signup passcode.
  await env.withSecurityRulesDisabled((c) => setDoc(doc(c.firestore(), 'meta', 'adminSignup'), { passcode: PASSCODE }));
});

afterAll(async () => {
  await env.cleanup();
});

describe('1. sign up (components/SignupForm.jsx)', () => {
  test('admin signs up with the passcode, then the passcode copy is removed', async () => {
    const ref = doc(admin(), 'users', ADMIN);
    await assertSucceeds(
      setDoc(ref, {
        uid: ADMIN,
        email: 'admin@example.com',
        displayName: 'Admin',
        notificationPrefs: { inApp: true, email: true },
        createdAt: serverTimestamp(),
        isAdmin: true,
        adminPasscode: PASSCODE,
      })
    );
    await assertSucceeds(updateDoc(ref, { adminPasscode: deleteField() }));
  });

  test('owner signs up (regular profile, no `disabled` field)', async () => {
    await assertSucceeds(
      setDoc(doc(owner(), 'users', OWNER), {
        uid: OWNER,
        email: 'owner@example.com',
        displayName: 'Owner',
        notificationPrefs: { inApp: true, email: true },
        createdAt: serverTimestamp(),
        isAdmin: false,
      })
    );
  });
});

describe('2. admin registers and writes a sticker (admin/NfcRegister.jsx)', () => {
  test('duplicate check by physicalUid', async () => {
    await assertSucceeds(getDocs(query(collection(admin(), 'tags'), where('physicalUid', '==', '04AABBCC'), limit(1))));
  });

  test('register transaction (tags + tagAdmin)', async () => {
    const db = admin();
    await assertSucceeds(
      runTransaction(db, async (tx) => {
        const ref = doc(db, 'tags', TAG);
        await tx.get(ref);
        tx.set(ref, {
          tagId: TAG,
          physicalUid: '04AABBCC',
          chipType: 'NTAG215',
          nfcCapabilityAtRegistration: 'uid-and-ndef',
          status: 'registered',
          registeredAt: serverTimestamp(),
          writeStatus: 'not_written',
        });
        tx.set(doc(db, 'tagAdmin', TAG), { registeredBy: ADMIN, registeredAt: serverTimestamp() });
      })
    );
  });

  test('record the write result', async () => {
    await assertSucceeds(
      updateDoc(doc(admin(), 'tags', TAG), { writeStatus: 'written', lastWrittenAt: serverTimestamp(), lastWriteError: null })
    );
  });

  test('inventory list, counts, and tag profiles', async () => {
    await assertSucceeds(getDocs(query(collection(admin(), 'tags'), orderBy('registeredAt', 'desc'), limit(100))));
    await assertSucceeds(getCountFromServer(query(collection(admin(), 'tags'), where('status', '==', 'registered'))));
    await assertSucceeds(getDocs(query(collection(admin(), 'tagProfiles'), where(documentId(), 'in', [TAG]))));
  });
});

describe('3. owner claims and sets up the item (ClaimTag, Items, NfcSetup)', () => {
  test('claim transaction', async () => {
    const db = owner();
    await assertSucceeds(
      runTransaction(db, async (tx) => {
        await tx.get(doc(db, 'tags', TAG));
        await tx.get(doc(db, 'itemOwners', TAG));
        await tx.get(doc(db, 'tagProfiles', TAG));
        tx.set(doc(db, 'itemOwners', TAG), { ownerUid: OWNER });
        tx.set(doc(db, 'items', TAG), {
          tagId: TAG,
          itemName: 'Backpack',
          category: 'Luggage',
          isLostMode: false,
          lostMessage: '',
          rewardAmount: 0,
        });
        tx.update(doc(db, 'tags', TAG), { status: 'claimed' });
      })
    );
  });

  test('owner lists their own tags (useOwnerTagIds) — ROUND3 A1', async () => {
    await assertSucceeds(getDocs(query(collection(owner(), 'itemOwners'), where('ownerUid', '==', OWNER))));
  });

  test('a stranger cannot list someone else\'s tags', async () => {
    await assertFails(getDocs(query(collection(stranger(), 'itemOwners'), where('ownerUid', '==', OWNER))));
  });

  test('owner reads item and tag by id', async () => {
    await assertSucceeds(getDoc(doc(owner(), 'items', TAG)));
    await assertSucceeds(getDoc(doc(owner(), 'tags', TAG)));
  });

  test('arm lost mode', async () => {
    await assertSucceeds(
      updateDoc(doc(owner(), 'items', TAG), {
        isLostMode: true,
        lostSince: serverTimestamp(),
        lostMessage: 'Please help',
        rewardAmount: 20,
      })
    );
  });

  test('save the NFC profile', async () => {
    await assertSucceeds(
      setDoc(doc(owner(), 'tagProfiles', TAG), {
        landingMode: 'lostfound',
        website: 'https://example.com',
        contactEnabled: false,
        lostFoundEnabled: true,
        updatedAt: serverTimestamp(),
        updatedBy: OWNER,
        editorRole: 'owner',
      })
    );
  });

  test('tap count, settings, stale-nudge dismissal', async () => {
    await assertSucceeds(getCountFromServer(collection(owner(), 'tags', TAG, 'scans')));
    // Settings clears the old, unused phone field (ROUND4 C2).
    await assertSucceeds(updateDoc(doc(owner(), 'users', OWNER), { phone: deleteField() }));
    await assertSucceeds(updateDoc(doc(owner(), 'users', OWNER), { [`staleNudgeDismissed.${TAG}`]: 123 }));
  });
});

describe('4. finder taps, reports and chats (NfcLanding, Chat)', () => {
  test('reads tag, item and profile by id', async () => {
    await assertSucceeds(getDoc(doc(finder(), 'tags', TAG)));
    await assertSucceeds(getDoc(doc(finder(), 'items', TAG)));
    await assertSucceeds(getDoc(doc(finder(), 'tagProfiles', TAG)));
  });

  test('records a scan', async () => {
    await assertSucceeds(
      addDoc(collection(finder(), 'tags', TAG, 'scans'), { timestamp: serverTimestamp(), landingMode: 'lostfound' })
    );
  });

  test('files a report, opens a chat, notifies the owner', async () => {
    const report = await assertSucceeds(
      addDoc(collection(finder(), 'reports'), {
        tagId: TAG,
        finderSessionToken: TOKEN,
        initialMessage: 'Found it at the station',
        locationNote: null,
        location: { lat: 1.5123, lng: 2.5123, accuracy: 11 },
        status: 'open',
        timestamp: serverTimestamp(),
      })
    );
    ids.report = report.id;
    const chat = await assertSucceeds(
      addDoc(collection(finder(), 'chats'), {
        reportId: ids.report,
        tagId: TAG,
        finderSessionToken: TOKEN,
        createdAt: serverTimestamp(),
        lastMessageAt: serverTimestamp(),
        lastMessageText: 'Found it at the station',
        unreadFor: ['owner'],
      })
    );
    ids.chat = chat.id;
    // The report message is also the thread's first message
    // (UI_UX_IMPROVEMENT_PLAN.md BUG3).
    await assertSucceeds(
      addDoc(collection(finder(), 'chats', ids.chat, 'messages'), {
        sender: 'finder',
        text: 'Found it at the station',
        timestamp: serverTimestamp(),
        finderSessionToken: TOKEN,
      })
    );
    await assertSucceeds(
      addDoc(collection(finder(), 'notifications'), {
        type: 'report',
        tagId: TAG,
        chatId: ids.chat,
        reportId: ids.report,
        read: false,
        createdAt: serverTimestamp(),
      })
    );
  });

  test('opens the chat, marks it read, sends a message, notifies', async () => {
    await assertSucceeds(getDoc(doc(finder(), 'chats', ids.chat)));
    await assertSucceeds(getDocs(query(collection(finder(), 'chats', ids.chat, 'messages'), orderBy('timestamp', 'asc'))));
    await assertSucceeds(updateDoc(doc(finder(), 'chats', ids.chat), { unreadFor: arrayRemove('finder') }));
    await assertSucceeds(
      addDoc(collection(finder(), 'chats', ids.chat, 'messages'), {
        sender: 'finder',
        text: 'Where can we meet?',
        timestamp: serverTimestamp(),
        finderSessionToken: TOKEN,
      })
    );
    await assertSucceeds(
      updateDoc(doc(finder(), 'chats', ids.chat), { lastMessageAt: serverTimestamp(), unreadFor: arrayUnion('owner') })
    );
    await assertSucceeds(
      addDoc(collection(finder(), 'notifications'), {
        type: 'message',
        tagId: TAG,
        chatId: ids.chat,
        reportId: null,
        read: false,
        createdAt: serverTimestamp(),
      })
    );
  });
});

describe('5. owner inbox and reply (Dashboard, Messages, Notifications, Chat)', () => {
  test('open reports, chats and notifications queries', async () => {
    await assertSucceeds(
      getDocs(query(collection(owner(), 'reports'), where('tagId', 'in', [TAG]), where('status', '==', 'open')))
    );
    await assertSucceeds(getDocs(query(collection(owner(), 'chats'), where('tagId', 'in', [TAG]))));
    const snap = await assertSucceeds(
      getDocs(query(collection(owner(), 'notifications'), where('tagId', 'in', [TAG]), orderBy('createdAt', 'desc'), limit(200)))
    );
    ids.notif = snap.docs[0].id;
  });

  test('chat preview and report-to-chat lookup', async () => {
    await assertSucceeds(
      getDocs(query(collection(owner(), 'chats', ids.chat, 'messages'), orderBy('timestamp', 'desc'), limit(1)))
    );
    await assertSucceeds(
      getDocs(query(collection(owner(), 'chats'), where('tagId', '==', TAG), where('reportId', '==', ids.report), limit(1)))
    );
  });

  test('marks read, replies, marks a notification read', async () => {
    await assertSucceeds(updateDoc(doc(owner(), 'chats', ids.chat), { unreadFor: arrayRemove('owner') }));
    await assertSucceeds(
      addDoc(collection(owner(), 'chats', ids.chat, 'messages'), { sender: 'owner', text: 'Lobby at 5', timestamp: serverTimestamp() })
    );
    await assertSucceeds(
      updateDoc(doc(owner(), 'chats', ids.chat), {
        lastMessageAt: serverTimestamp(),
        lastMessageText: 'Lobby at 5',
        unreadFor: arrayUnion('finder'),
      })
    );
    await assertSucceeds(updateDoc(doc(owner(), 'notifications', ids.notif), { read: true }));
  });

  test('the finder keeps replying after the owner replies', async () => {
    for (const text of ['I found it near the lobby', 'Around 6 PM']) {
      await assertSucceeds(updateDoc(doc(finder(), 'chats', ids.chat), { unreadFor: arrayRemove('finder') }));
      await assertSucceeds(
        addDoc(collection(finder(), 'chats', ids.chat, 'messages'), {
          sender: 'finder',
          text,
          timestamp: serverTimestamp(),
          finderSessionToken: TOKEN,
        })
      );
      await assertSucceeds(
        updateDoc(doc(finder(), 'chats', ids.chat), { lastMessageAt: serverTimestamp(), unreadFor: arrayUnion('owner') })
      );
      await assertSucceeds(
        addDoc(collection(owner(), 'chats', ids.chat, 'messages'), { sender: 'owner', text: 'Thanks!', timestamp: serverTimestamp() })
      );
    }
  });

  // One browser can hold the finder token and also be signed in as the
  // owner (pages/public/Chat.jsx keeps that tab on the finder side). The
  // finder's messages still only need the token.
  test('a finder message from a browser signed in as the owner', async () => {
    await assertSucceeds(
      addDoc(collection(owner(), 'chats', ids.chat, 'messages'), {
        sender: 'finder',
        text: 'Sent from the same browser',
        timestamp: serverTimestamp(),
        finderSessionToken: TOKEN,
      })
    );
    await assertSucceeds(
      updateDoc(doc(owner(), 'chats', ids.chat), { lastMessageAt: serverTimestamp(), unreadFor: arrayUnion('owner') })
    );
  });

  test('both sides report the chat', async () => {
    await assertSucceeds(
      updateDoc(doc(owner(), 'chats', ids.chat), { blocked: true, reportedByOwner: { reason: 'spam', at: serverTimestamp() } })
    );
    await assertSucceeds(
      updateDoc(doc(finder(), 'chats', ids.chat), { blocked: true, reportedByFinder: { reason: 'rude', at: serverTimestamp() } })
    );
  });
});

describe('6. admin moderation and owner lookup (Moderation, Owners, TagContent)', () => {
  test('moderation queue, item names, ban list', async () => {
    await assertSucceeds(getDocs(query(collection(admin(), 'chats'), where('blocked', '==', true))));
    await assertSucceeds(getDocs(query(collection(admin(), 'items'), where('tagId', 'in', [TAG]))));
    await assertSucceeds(getDocs(collection(admin(), 'blockedTokens')));
  });

  test('ban, notify owner, mark reviewed, unban', async () => {
    await assertSucceeds(
      setDoc(doc(admin(), 'blockedTokens', TOKEN), { bannedAt: serverTimestamp(), bannedBy: ADMIN, tagId: TAG, reason: 'spam' })
    );
    await assertSucceeds(
      addDoc(collection(admin(), 'notifications'), {
        type: 'moderation_resolved',
        tagId: TAG,
        chatId: ids.chat,
        reportId: null,
        read: false,
        createdAt: serverTimestamp(),
      })
    );
    await assertSucceeds(updateDoc(doc(admin(), 'chats', ids.chat), { reviewedAt: serverTimestamp(), reviewedBy: ADMIN }));
    await assertSucceeds(deleteDoc(doc(admin(), 'blockedTokens', TOKEN)));
  });

  test('owner lookup and their other tags', async () => {
    await assertSucceeds(getDoc(doc(admin(), 'itemOwners', TAG)));
    await assertSucceeds(getDoc(doc(admin(), 'users', OWNER)));
    await assertSucceeds(getDocs(query(collection(admin(), 'itemOwners'), where('ownerUid', '==', OWNER))));
  });

  test('edit tag content, read tap counts, change the signup passcode', async () => {
    await assertSucceeds(
      setDoc(doc(admin(), 'tagProfiles', TAG), {
        landingMode: 'lostfound',
        displayName: 'Acme',
        contactEnabled: false,
        lostFoundEnabled: true,
        updatedAt: serverTimestamp(),
        updatedBy: ADMIN,
        editorRole: 'admin',
      })
    );
    await assertSucceeds(getCountFromServer(collection(admin(), 'tags', TAG, 'scans')));
    await assertSucceeds(
      getCountFromServer(query(collection(admin(), 'tags', TAG, 'scans'), where('landingMode', '==', 'lostfound')))
    );
    await assertSucceeds(
      setDoc(doc(admin(), 'meta', 'adminSignup'), { passcode: 'NEWPASS9', updatedAt: serverTimestamp(), updatedBy: ADMIN })
    );
  });
});

describe('7. owner recovers and releases (Chat, Items, lib/ownerItems#releaseTag)', () => {
  test('mark recovered (item, chat, report)', async () => {
    await assertSucceeds(updateDoc(doc(owner(), 'items', TAG), { isLostMode: false, lostSince: null }));
    await assertSucceeds(updateDoc(doc(owner(), 'chats', ids.chat), { resolved: true }));
    // Resolving also drops the finder's location (ROUND4 C3).
    await assertSucceeds(
      updateDoc(doc(owner(), 'reports', ids.report), { status: 'resolved', location: null, locationNote: null })
    );
  });

  test('clear read notifications', async () => {
    const snap = await getDocs(query(collection(owner(), 'notifications'), where('tagId', 'in', [TAG])));
    for (const d of snap.docs.filter((d) => d.data().read)) await assertSucceeds(deleteDoc(d.ref));
  });

  test('release: history clean-up, then the release transaction', async () => {
    const db = owner();
    const byTag = (name) => getDocs(query(collection(db, name), where('tagId', '==', TAG)));
    const [reports, notifs, chats] = await Promise.all([byTag('reports'), byTag('notifications'), byTag('chats')]);
    // Messages of chats that will be deleted go first (subcollection).
    for (const c of chats.docs.filter((d) => !d.data().blocked)) {
      const msgs = await getDocs(collection(db, 'chats', c.id, 'messages'));
      const mb = writeBatch(db);
      msgs.docs.forEach((m) => mb.delete(m.ref));
      await assertSucceeds(mb.commit());
    }
    const batch = writeBatch(db);
    reports.docs.forEach((d) => batch.delete(d.ref));
    notifs.docs.forEach((d) => batch.delete(d.ref));
    chats.docs.forEach((d) =>
      d.data().blocked ? batch.update(d.ref, { archivedAt: serverTimestamp() }) : batch.delete(d.ref)
    );
    await assertSucceeds(batch.commit());
    await assertSucceeds(
      runTransaction(db, async (tx) => {
        tx.delete(doc(db, 'itemOwners', TAG));
        tx.delete(doc(db, 'items', TAG));
        tx.delete(doc(db, 'tagProfiles', TAG));
        tx.update(doc(db, 'tags', TAG), { status: 'registered' });
      })
    );
  });
});

describe('8. admin blacklist round trip (Inventory.jsx)', () => {
  test('blacklist, then un-blacklist', async () => {
    const db = admin();
    const b1 = writeBatch(db);
    b1.update(doc(db, 'tags', TAG), { status: 'blacklisted' });
    b1.set(
      doc(db, 'tagAdmin', TAG),
      { blacklistedFromStatus: 'registered', flagReason: 'test', blacklistedBy: ADMIN, blacklistedAt: serverTimestamp() },
      { merge: true }
    );
    await assertSucceeds(b1.commit());
    await assertSucceeds(getDoc(doc(db, 'tagAdmin', TAG)));
    const b2 = writeBatch(db);
    b2.update(doc(db, 'tags', TAG), {
      status: 'registered',
      blacklistedFromStatus: deleteField(),
      flagReason: deleteField(),
      blacklistedBy: deleteField(),
      blacklistedAt: deleteField(),
    });
    b2.set(
      doc(db, 'tagAdmin', TAG),
      { blacklistedFromStatus: deleteField(), flagReason: deleteField(), blacklistedBy: deleteField(), blacklistedAt: deleteField() },
      { merge: true }
    );
    await assertSucceeds(b2.commit());
  });
});

describe('9. errors and account deletion (lib/errorLog.js, lib/account.js)', () => {
  test('a finder\'s browser reports a crash; the admin reads and clears it', async () => {
    const ref = await assertSucceeds(
      addDoc(collection(finder(), 'clientErrors'), {
        message: 'TypeError: flow test',
        stack: null,
        url: `/nfc/${TAG}`,
        userAgent: 'flows.test.js',
        uid: null,
        at: serverTimestamp(),
      })
    );
    await assertSucceeds(getDocs(query(collection(admin(), 'clientErrors'), orderBy('at', 'desc'), limit(100))));
    await assertSucceeds(deleteDoc(doc(admin(), 'clientErrors', ref.id)));
  });

  test('the owner (no tags left after release) deletes their account profile', async () => {
    const owned = await assertSucceeds(getDocs(query(collection(owner(), 'itemOwners'), where('ownerUid', '==', OWNER))));
    if (owned.size !== 0) throw new Error('expected no owned tags after release');
    await assertSucceeds(deleteDoc(doc(owner(), 'users', OWNER)));
  });
});
