// Firestore rules test suite (MAIN_FUNCTIONS_IMPROVEMENT_PLAN.md §6.2).
//
// Runs against the Firestore emulator, NOT production — never talks to the
// real nfc-lost-and-found project. Must be run via:
//
//   npm test
//
// (wraps `firebase emulators:exec --only firestore "vitest run"` — see
// package.json. Running `vitest` directly will fail with a connection
// error, since nothing starts the emulator for you that way.)
//
// Covers the transaction/rules interactions this project's correctness
// actually depends on: claim, registration, release, and the tagProfiles/
// chats field whitelists — the areas every prior change in this session
// (rules rename, admin registration, release, finder-report) was verified
// by manual code reading only, never an actual test run.

import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

let testEnv;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'tagback-rules-test',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

// Seeds data bypassing rules entirely — the emulator equivalent of the
// Admin SDK writes admin/NfcRegister.jsx and the claim transaction would
// have already produced, so each test starts from a known state instead of
// re-deriving it through the rules under test.
async function seed(setupFn) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setupFn(context.firestore());
  });
}

describe('tags — registration (admin-only)', () => {
  test('a non-admin cannot create a tags doc', async () => {
    const owner = testEnv.authenticatedContext('owner-1');
    await assertFails(
      setDoc(doc(owner.firestore(), 'tags', 'TB-AAAA-1111'), {
        tagId: 'TB-AAAA-1111',
        physicalUid: null,
        status: 'registered',
      })
    );
  });

  test('an admin can create a tags doc', async () => {
    const admin = testEnv.authenticatedContext('admin-1', { admin: true });
    await assertSucceeds(
      setDoc(doc(admin.firestore(), 'tags', 'TB-AAAA-1111'), {
        tagId: 'TB-AAAA-1111',
        physicalUid: '04A2248B7C6180',
        chipType: 'NTAG215',
        nfcCapabilityAtRegistration: 'uid-and-ndef',
        status: 'registered',
        registeredAt: serverTimestamp(),
        registeredBy: 'admin-1',
        writeStatus: 'not_written',
      })
    );
  });

  test('anyone (even unauthenticated) can read tag status', async () => {
    await seed((db) =>
      setDoc(doc(db, 'tags', 'TB-AAAA-1111'), { tagId: 'TB-AAAA-1111', status: 'registered' })
    );
    const finder = testEnv.unauthenticatedContext();
    await assertSucceeds(getDoc(doc(finder.firestore(), 'tags', 'TB-AAAA-1111')));
  });
});

describe('claim transaction (dashboard/ClaimTag.jsx)', () => {
  async function seedRegisteredTag(tagId = 'TB-BBBB-2222') {
    await seed((db) => setDoc(doc(db, 'tags', tagId), { tagId, status: 'registered' }));
    return tagId;
  }

  test('a signed-in user can claim a registered tag', async () => {
    const tagId = await seedRegisteredTag();
    const owner = testEnv.authenticatedContext('owner-1');
    const db = owner.firestore();
    await assertSucceeds(
      runTransaction(db, async (tx) => {
        tx.set(doc(db, 'itemOwners', tagId), { ownerUid: 'owner-1' });
        tx.set(doc(db, 'items', tagId), {
          tagId,
          itemName: 'Test Backpack',
          isLostMode: false,
          lostMessage: '',
          rewardAmount: 0,
        });
        tx.update(doc(db, 'tags', tagId), { status: 'claimed' });
      })
    );
  });

  test('claiming rejects a blacklisted tag', async () => {
    const tagId = 'TB-CCCC-3333';
    await seed((db) => setDoc(doc(db, 'tags', tagId), { tagId, status: 'blacklisted' }));
    const owner = testEnv.authenticatedContext('owner-1');
    const db = owner.firestore();
    await assertFails(
      runTransaction(db, async (tx) => {
        tx.set(doc(db, 'itemOwners', tagId), { ownerUid: 'owner-1' });
        tx.update(doc(db, 'tags', tagId), { status: 'claimed' });
      })
    );
  });

  test('claiming rejects an already-claimed tag', async () => {
    const tagId = 'TB-DDDD-4444';
    await seed(async (db) => {
      await setDoc(doc(db, 'tags', tagId), { tagId, status: 'claimed' });
      await setDoc(doc(db, 'itemOwners', tagId), { ownerUid: 'owner-1' });
    });
    const otherOwner = testEnv.authenticatedContext('owner-2');
    const db = otherOwner.firestore();
    // itemOwners already exists — create must fail regardless of the
    // tags#update clause, since that clause requires status == 'registered'.
    await assertFails(setDoc(doc(db, 'itemOwners', tagId), { ownerUid: 'owner-2' }));
  });

  test('an owner cannot self-assign a different ownerUid than their own', async () => {
    const tagId = await seedRegisteredTag('TB-EEEE-5555');
    const owner = testEnv.authenticatedContext('owner-1');
    await assertFails(
      setDoc(doc(owner.firestore(), 'itemOwners', tagId), { ownerUid: 'someone-else' })
    );
  });
});

describe('items/reports/messages — field bounds (§R2.3)', () => {
  test('rewardAmount cannot be negative', async () => {
    const tagId = 'TB-QQQQ-1818';
    await seed(async (db) => {
      await setDoc(doc(db, 'tags', tagId), { tagId, status: 'claimed' });
      await setDoc(doc(db, 'itemOwners', tagId), { ownerUid: 'owner-1' });
      await setDoc(doc(db, 'items', tagId), { tagId, itemName: 'Test', isLostMode: false, rewardAmount: 0 });
    });
    const owner = testEnv.authenticatedContext('owner-1');
    await assertFails(updateDoc(doc(owner.firestore(), 'items', tagId), { rewardAmount: -5 }));
  });

  test('itemName over 100 chars is rejected', async () => {
    const tagId = 'TB-RRRR-1919';
    await seed(async (db) => {
      await setDoc(doc(db, 'tags', tagId), { tagId, status: 'claimed' });
      await setDoc(doc(db, 'itemOwners', tagId), { ownerUid: 'owner-1' });
      await setDoc(doc(db, 'items', tagId), { tagId, itemName: 'Test', isLostMode: false });
    });
    const owner = testEnv.authenticatedContext('owner-1');
    await assertFails(
      updateDoc(doc(owner.firestore(), 'items', tagId), { itemName: 'x'.repeat(101) })
    );
  });

  test('a report with an over-length initialMessage is rejected', async () => {
    const tagId = 'TB-SSSS-2020';
    await seed((db) => setDoc(doc(db, 'tags', tagId), { tagId, status: 'claimed' }));
    const finder = testEnv.unauthenticatedContext();
    await assertFails(
      setDoc(doc(finder.firestore(), 'reports', 'report-1'), {
        tagId,
        finderSessionToken: 'token-1',
        status: 'open',
        initialMessage: 'x'.repeat(501),
      })
    );
  });

  test('a chat message with over-length text is rejected', async () => {
    const tagId = 'TB-TTTT-2121';
    const chatId = 'chat-bounds-1';
    await seed(async (db) => {
      await setDoc(doc(db, 'tags', tagId), { tagId, status: 'claimed' });
      await setDoc(doc(db, 'chats', chatId), { tagId, finderSessionToken: 'token-1' });
    });
    const finder = testEnv.unauthenticatedContext();
    await assertFails(
      setDoc(doc(finder.firestore(), 'chats', chatId, 'messages', 'msg-1'), {
        sender: 'finder',
        finderSessionToken: 'token-1',
        text: 'x'.repeat(1001),
      })
    );
  });
});

describe('release (lib/ownerItems.js#releaseTag, §3.2)', () => {
  async function seedClaimedTag(tagId, ownerUid) {
    await seed(async (db) => {
      await setDoc(doc(db, 'tags', tagId), { tagId, status: 'claimed' });
      await setDoc(doc(db, 'itemOwners', tagId), { ownerUid });
      await setDoc(doc(db, 'items', tagId), { tagId, itemName: 'Test', isLostMode: false });
    });
  }

  test('the owner can release a tag they own', async () => {
    const tagId = 'TB-FFFF-6666';
    await seedClaimedTag(tagId, 'owner-1');
    const owner = testEnv.authenticatedContext('owner-1');
    const db = owner.firestore();
    await assertSucceeds(
      runTransaction(db, async (tx) => {
        tx.delete(doc(db, 'itemOwners', tagId));
        tx.delete(doc(db, 'items', tagId));
        tx.update(doc(db, 'tags', tagId), { status: 'registered' });
      })
    );
  });

  test('a non-owner cannot release someone else\'s tag', async () => {
    const tagId = 'TB-GGGG-7777';
    await seedClaimedTag(tagId, 'owner-1');
    const notOwner = testEnv.authenticatedContext('owner-2');
    const db = notOwner.firestore();
    await assertFails(
      runTransaction(db, async (tx) => {
        tx.delete(doc(db, 'itemOwners', tagId));
        tx.delete(doc(db, 'items', tagId));
        tx.update(doc(db, 'tags', tagId), { status: 'registered' });
      })
    );
  });
});

describe('tagProfiles (dashboard/NfcSetup.jsx, §3.1)', () => {
  test('the owner can save an https link', async () => {
    const tagId = 'TB-HHHH-8888';
    await seed(async (db) => {
      await setDoc(doc(db, 'tags', tagId), { tagId, status: 'claimed' });
      await setDoc(doc(db, 'itemOwners', tagId), { ownerUid: 'owner-1' });
    });
    const owner = testEnv.authenticatedContext('owner-1');
    await assertSucceeds(
      setDoc(doc(owner.firestore(), 'tagProfiles', tagId), {
        website: 'https://example.com',
        lostFoundEnabled: true,
      })
    );
  });

  test('a non-https link is rejected', async () => {
    const tagId = 'TB-IIII-9999';
    await seed(async (db) => {
      await setDoc(doc(db, 'tags', tagId), { tagId, status: 'claimed' });
      await setDoc(doc(db, 'itemOwners', tagId), { ownerUid: 'owner-1' });
    });
    const owner = testEnv.authenticatedContext('owner-1');
    await assertFails(
      setDoc(doc(owner.firestore(), 'tagProfiles', tagId), { website: 'http://example.com' })
    );
  });

  test('an unknown field is rejected', async () => {
    const tagId = 'TB-JJJJ-1010';
    await seed(async (db) => {
      await setDoc(doc(db, 'tags', tagId), { tagId, status: 'claimed' });
      await setDoc(doc(db, 'itemOwners', tagId), { ownerUid: 'owner-1' });
    });
    const owner = testEnv.authenticatedContext('owner-1');
    await assertFails(
      setDoc(doc(owner.firestore(), 'tagProfiles', tagId), { emailAddress: 'me@example.com' })
    );
  });

  // §R2.1 — contactEnabled previously had no field to actually reveal.
  test('an https contactUrl is accepted alongside contactEnabled', async () => {
    const tagId = 'TB-OOOO-1616';
    await seed(async (db) => {
      await setDoc(doc(db, 'tags', tagId), { tagId, status: 'claimed' });
      await setDoc(doc(db, 'itemOwners', tagId), { ownerUid: 'owner-1' });
    });
    const owner = testEnv.authenticatedContext('owner-1');
    await assertSucceeds(
      setDoc(doc(owner.firestore(), 'tagProfiles', tagId), {
        contactEnabled: true,
        contactUrl: 'https://wa.me/15555550100',
      })
    );
  });

  test('a non-https contactUrl is rejected', async () => {
    const tagId = 'TB-PPPP-1717';
    await seed(async (db) => {
      await setDoc(doc(db, 'tags', tagId), { tagId, status: 'claimed' });
      await setDoc(doc(db, 'itemOwners', tagId), { ownerUid: 'owner-1' });
    });
    const owner = testEnv.authenticatedContext('owner-1');
    await assertFails(
      setDoc(doc(owner.firestore(), 'tagProfiles', tagId), {
        contactEnabled: true,
        contactUrl: 'tel:+15555550100',
      })
    );
  });

  test('a non-owner cannot write another owner\'s tagProfile', async () => {
    const tagId = 'TB-KKKK-1212';
    await seed(async (db) => {
      await setDoc(doc(db, 'tags', tagId), { tagId, status: 'claimed' });
      await setDoc(doc(db, 'itemOwners', tagId), { ownerUid: 'owner-1' });
    });
    const notOwner = testEnv.authenticatedContext('owner-2');
    await assertFails(
      setDoc(doc(notOwner.firestore(), 'tagProfiles', tagId), { website: 'https://example.com' })
    );
  });
});

describe('chats — finder report path (public/Chat.jsx, §5.1)', () => {
  async function seedChat(tagId, ownerUid, finderSessionToken) {
    const chatId = 'chat-1';
    await seed((db) =>
      setDoc(doc(db, 'chats', chatId), { tagId, finderSessionToken, blocked: false })
    );
    await seed((db) => setDoc(doc(db, 'itemOwners', tagId), { ownerUid }));
    return chatId;
  }

  // NOTE on what this actually proves: isChatParty()'s finder branch
  // compares resource.data.finderSessionToken to request.resource.data's —
  // which are equal whenever the update doesn't touch that field, making
  // the "matching token" check a tautology for this shape of write (see
  // the comment above this clause in firestore.rules). This test pins down
  // that documented, accepted behavior — it does NOT prove token
  // possession is required, because it isn't for this specific write.
  test('an unauthenticated caller can file a finder report (documented limitation — see firestore.rules chats#update comment)', async () => {
    const chatId = await seedChat('TB-LLLL-1313', 'owner-1', 'finder-token-abc');
    const anyoneWithTheChatId = testEnv.unauthenticatedContext();
    await assertSucceeds(
      updateDoc(doc(anyoneWithTheChatId.firestore(), 'chats', chatId), {
        blocked: true,
        reportedByFinder: { reason: 'harassment', at: serverTimestamp() },
      })
    );
  });

  test('a finder report cannot also touch other fields', async () => {
    const chatId = await seedChat('TB-MMMM-1414', 'owner-1', 'finder-token-abc');
    const finder = testEnv.unauthenticatedContext();
    await assertFails(
      updateDoc(doc(finder.firestore(), 'chats', chatId), {
        blocked: true,
        reportedByFinder: { reason: 'x', at: serverTimestamp() },
        tagId: 'TB-SOMETHING-ELSE',
      })
    );
  });

  test('both sides can report the same chat, each once (SYSTEM_AUDIT_PLAN.md B6)', async () => {
    const chatId = await seedChat('TB-NNNN-1515', 'owner-1', 'finder-token-abc');
    const owner = testEnv.authenticatedContext('owner-1');
    await assertSucceeds(
      updateDoc(doc(owner.firestore(), 'chats', chatId), {
        blocked: true,
        reportedByOwner: { reason: 'spam', at: serverTimestamp() },
      })
    );
    const finder = testEnv.unauthenticatedContext();
    await assertSucceeds(
      updateDoc(doc(finder.firestore(), 'chats', chatId), {
        blocked: true,
        reportedByFinder: { reason: 'abuse', at: serverTimestamp() },
      })
    );
    await assertFails(
      updateDoc(doc(finder.firestore(), 'chats', chatId), {
        blocked: true,
        reportedByFinder: { reason: 'overwrite', at: serverTimestamp() },
      })
    );
  });
});

describe('tag content (NFC_WRITE_DATA_ADMIN_PLAN.md — admin/TagContent.jsx)', () => {
  const adminCtx = () => testEnv.authenticatedContext('admin-1', { admin: true });

  test('an admin can set profile content on an unclaimed tag', async () => {
    const tagId = 'TB-UUUU-2222';
    await seed((db) => setDoc(doc(db, 'tags', tagId), { tagId, status: 'registered' }));
    await assertSucceeds(
      setDoc(doc(adminCtx().firestore(), 'tagProfiles', tagId), {
        landingMode: 'profile',
        displayName: 'Acme Coffee',
        bio: 'Best beans in town',
        instagram: 'https://instagram.com/acme',
        lostFoundEnabled: true,
        contactEnabled: false,
        updatedAt: serverTimestamp(),
        updatedBy: 'admin-1',
      })
    );
  });

  test('an admin can edit a claimed tag\'s content', async () => {
    const tagId = 'TB-UUUU-2323';
    await seed(async (db) => {
      await setDoc(doc(db, 'tags', tagId), { tagId, status: 'claimed' });
      await setDoc(doc(db, 'itemOwners', tagId), { ownerUid: 'owner-1' });
      await setDoc(doc(db, 'tagProfiles', tagId), { website: 'https://spam.example' });
    });
    await assertSucceeds(
      setDoc(doc(adminCtx().firestore(), 'tagProfiles', tagId), { landingMode: 'lostfound', updatedBy: 'admin-1' })
    );
  });

  test('a signed-in non-owner, non-admin cannot set content', async () => {
    const tagId = 'TB-UUUU-2424';
    await seed((db) => setDoc(doc(db, 'tags', tagId), { tagId, status: 'registered' }));
    const stranger = testEnv.authenticatedContext('stranger-1');
    await assertFails(
      setDoc(doc(stranger.firestore(), 'tagProfiles', tagId), { landingMode: 'redirect', redirectUrl: 'https://evil.example' })
    );
  });

  test('an unknown landingMode is rejected', async () => {
    const tagId = 'TB-UUUU-2525';
    await seed((db) => setDoc(doc(db, 'tags', tagId), { tagId, status: 'registered' }));
    await assertFails(setDoc(doc(adminCtx().firestore(), 'tagProfiles', tagId), { landingMode: 'popup' }));
  });

  test('a non-https redirectUrl is rejected', async () => {
    const tagId = 'TB-UUUU-2626';
    await seed((db) => setDoc(doc(db, 'tags', tagId), { tagId, status: 'registered' }));
    await assertFails(
      setDoc(doc(adminCtx().firestore(), 'tagProfiles', tagId), {
        landingMode: 'redirect',
        redirectUrl: 'javascript:alert(1)',
      })
    );
  });

  test('a displayName over 60 chars is rejected', async () => {
    const tagId = 'TB-UUUU-2727';
    await seed((db) => setDoc(doc(db, 'tags', tagId), { tagId, status: 'registered' }));
    await assertFails(
      setDoc(doc(adminCtx().firestore(), 'tagProfiles', tagId), { landingMode: 'profile', displayName: 'x'.repeat(61) })
    );
  });

  test('updatedBy cannot name someone other than the caller', async () => {
    const tagId = 'TB-UUUU-2828';
    await seed((db) => setDoc(doc(db, 'tags', tagId), { tagId, status: 'registered' }));
    await assertFails(
      setDoc(doc(adminCtx().firestore(), 'tagProfiles', tagId), { landingMode: 'lostfound', updatedBy: 'owner-1' })
    );
  });

  async function claim(tagId) {
    const owner = testEnv.authenticatedContext('owner-1');
    const db = owner.firestore();
    return runTransaction(db, async (tx) => {
      tx.set(doc(db, 'itemOwners', tagId), { ownerUid: 'owner-1' });
      tx.set(doc(db, 'items', tagId), { tagId, itemName: 'Test', isLostMode: false, lostMessage: '', rewardAmount: 0 });
      tx.update(doc(db, 'tags', tagId), { status: 'claimed' });
    });
  }

  test('an unclaimed tag set to profile/redirect cannot be claimed', async () => {
    const tagId = 'TB-UUUU-2929';
    await seed(async (db) => {
      await setDoc(doc(db, 'tags', tagId), { tagId, status: 'registered' });
      await setDoc(doc(db, 'tagProfiles', tagId), { landingMode: 'redirect', redirectUrl: 'https://acme.example' });
    });
    await assertFails(claim(tagId));
  });

  test('an unclaimed tag with lostfound content can still be claimed', async () => {
    const tagId = 'TB-UUUU-3030';
    await seed(async (db) => {
      await setDoc(doc(db, 'tags', tagId), { tagId, status: 'registered' });
      await setDoc(doc(db, 'tagProfiles', tagId), { landingMode: 'lostfound', displayName: 'Stock' });
    });
    await assertSucceeds(claim(tagId));
  });

  test('an admin can read tap counts; a stranger cannot', async () => {
    const tagId = 'TB-UUUU-3131';
    await seed(async (db) => {
      await setDoc(doc(db, 'tags', tagId), { tagId, status: 'registered' });
      await setDoc(doc(db, 'tags', tagId, 'scans', 's1'), { timestamp: serverTimestamp() });
    });
    await assertSucceeds(getDoc(doc(adminCtx().firestore(), 'tags', tagId, 'scans', 's1')));
    const stranger = testEnv.authenticatedContext('stranger-1');
    await assertFails(getDoc(doc(stranger.firestore(), 'tags', tagId, 'scans', 's1')));
  });
});

describe('SYSTEM_AUDIT_PLAN.md fixes', () => {
  const adminCtx = () => testEnv.authenticatedContext('admin-1', { admin: true });

  // ---- A1/A2: users/{uid} ----
  test('A1: a user cannot create their own profile with isAdmin: true without the passcode', async () => {
    const user = testEnv.authenticatedContext('u1');
    await assertFails(setDoc(doc(user.firestore(), 'users', 'u1'), { email: 'a@b.c', isAdmin: true }));
  });

  test('A1: isAdmin: true with a wrong passcode is rejected; the right one works', async () => {
    await seed((db) => setDoc(doc(db, 'meta', 'adminSignup'), { passcode: 'CORRECT-HORSE-BATTERY-1' }));
    const u2 = testEnv.authenticatedContext('u2');
    await assertFails(setDoc(doc(u2.firestore(), 'users', 'u2'), { isAdmin: true, adminPasscode: 'wrong-guess' }));
    const u3 = testEnv.authenticatedContext('u3');
    await assertSucceeds(setDoc(doc(u3.firestore(), 'users', 'u3'), { isAdmin: true, adminPasscode: 'CORRECT-HORSE-BATTERY-1' }));
  });

  test('A1: a plain non-admin profile can still be created', async () => {
    const user = testEnv.authenticatedContext('u4');
    await assertSucceeds(setDoc(doc(user.firestore(), 'users', 'u4'), { email: 'a@b.c', isAdmin: false }));
  });

  test('A1/A2: a user cannot delete their own profile (the delete-and-recreate escalation)', async () => {
    await seed((db) => setDoc(doc(db, 'users', 'u5'), { email: 'a@b.c', disabled: true }));
    const user = testEnv.authenticatedContext('u5');
    await assertFails(deleteDoc(doc(user.firestore(), 'users', 'u5')));
  });

  test('A2: a profile cannot be created with disabled: true', async () => {
    const user = testEnv.authenticatedContext('u6');
    await assertFails(setDoc(doc(user.firestore(), 'users', 'u6'), { disabled: true }));
  });

  // ---- A3: claim can't be split ----
  test('A3: creating only itemOwners (without flipping the tag to claimed) is rejected', async () => {
    const tagId = 'TB-AAAA-9001';
    await seed((db) => setDoc(doc(db, 'tags', tagId), { tagId, status: 'registered' }));
    const user = testEnv.authenticatedContext('squatter');
    await assertFails(setDoc(doc(user.firestore(), 'itemOwners', tagId), { ownerUid: 'squatter' }));
  });

  test('A3: an owner cannot hand ownership to someone else by editing itemOwners', async () => {
    const tagId = 'TB-AAAA-9002';
    await seed(async (db) => {
      await setDoc(doc(db, 'tags', tagId), { tagId, status: 'claimed' });
      await setDoc(doc(db, 'itemOwners', tagId), { ownerUid: 'owner-1' });
    });
    const owner = testEnv.authenticatedContext('owner-1');
    await assertFails(updateDoc(doc(owner.firestore(), 'itemOwners', tagId), { ownerUid: 'someone-else' }));
  });

  test('A3: itemOwners cannot be deleted without releasing the tag in the same write', async () => {
    const tagId = 'TB-AAAA-9003';
    await seed(async (db) => {
      await setDoc(doc(db, 'tags', tagId), { tagId, status: 'claimed' });
      await setDoc(doc(db, 'itemOwners', tagId), { ownerUid: 'owner-1' });
    });
    const owner = testEnv.authenticatedContext('owner-1');
    await assertFails(deleteDoc(doc(owner.firestore(), 'itemOwners', tagId)));
  });

  // ---- A4: release clean-up ----
  test('A4: the owner can delete their tag\'s reports (release clean-up)', async () => {
    const tagId = 'TB-AAAA-9004';
    await seed(async (db) => {
      await setDoc(doc(db, 'tags', tagId), { tagId, status: 'claimed' });
      await setDoc(doc(db, 'itemOwners', tagId), { ownerUid: 'owner-1' });
      await setDoc(doc(db, 'reports', 'r1'), { tagId, finderSessionToken: 't', status: 'open' });
    });
    const owner = testEnv.authenticatedContext('owner-1');
    await assertSucceeds(deleteDoc(doc(owner.firestore(), 'reports', 'r1')));
  });

  // ---- A5: exact field sets on public writes ----
  test('A5: a well-formed report is accepted', async () => {
    const tagId = 'TB-AAAA-9005';
    await seed((db) => setDoc(doc(db, 'tags', tagId), { tagId, status: 'claimed' }));
    const finder = testEnv.unauthenticatedContext();
    await assertSucceeds(
      addDoc(collection(finder.firestore(), 'reports'), {
        tagId,
        finderSessionToken: 'token-abc',
        initialMessage: 'Found it',
        locationNote: 'Front desk',
        location: { lat: 1.5, lng: 2.5, accuracy: 10 },
        status: 'open',
        timestamp: serverTimestamp(),
      })
    );
  });

  test('A5: a report with an extra field is rejected', async () => {
    const tagId = 'TB-AAAA-9006';
    await seed((db) => setDoc(doc(db, 'tags', tagId), { tagId, status: 'claimed' }));
    const finder = testEnv.unauthenticatedContext();
    await assertFails(
      addDoc(collection(finder.firestore(), 'reports'), {
        tagId,
        finderSessionToken: 'token-abc',
        status: 'open',
        junk: 'x'.repeat(1000),
      })
    );
  });

  test('A5: a new chat cannot be pre-set as blocked/resolved', async () => {
    const tagId = 'TB-AAAA-9007';
    await seed((db) => setDoc(doc(db, 'tags', tagId), { tagId, status: 'claimed' }));
    const finder = testEnv.unauthenticatedContext();
    await assertFails(
      addDoc(collection(finder.firestore(), 'chats'), { tagId, finderSessionToken: 'token-abc', resolved: true })
    );
  });

  test('A5: a notification with an unknown type is rejected', async () => {
    const tagId = 'TB-AAAA-9008';
    await seed((db) => setDoc(doc(db, 'items', tagId), { tagId, itemName: 'X', isLostMode: false }));
    const finder = testEnv.unauthenticatedContext();
    await assertFails(
      addDoc(collection(finder.firestore(), 'notifications'), {
        type: 'phishing',
        tagId,
        createdAt: serverTimestamp(),
        read: false,
      })
    );
    await assertSucceeds(
      addDoc(collection(finder.firestore(), 'notifications'), {
        type: 'message',
        tagId,
        chatId: 'c1',
        createdAt: serverTimestamp(),
        read: false,
      })
    );
  });

  // ---- A6: chat preview spoofing ----
  test('A6: a non-owner cannot rewrite the chat preview text; activity markers still work', async () => {
    const tagId = 'TB-AAAA-9009';
    await seed(async (db) => {
      await setDoc(doc(db, 'itemOwners', tagId), { ownerUid: 'owner-1' });
      await setDoc(doc(db, 'chats', 'chat-a6'), { tagId, finderSessionToken: 'token-abc', unreadFor: [] });
    });
    const finder = testEnv.unauthenticatedContext();
    await assertFails(
      updateDoc(doc(finder.firestore(), 'chats', 'chat-a6'), { lastMessageText: 'Send your bank details' })
    );
    await assertSucceeds(
      updateDoc(doc(finder.firestore(), 'chats', 'chat-a6'), { lastMessageAt: serverTimestamp(), unreadFor: ['owner'] })
    );
  });

  // ---- A7: admin-only tag notes ----
  test('A7: tagAdmin is readable by admins only', async () => {
    await seed((db) => setDoc(doc(db, 'tagAdmin', 'TB-AAAA-9010'), { flagReason: 'fraud' }));
    await assertSucceeds(getDoc(doc(adminCtx().firestore(), 'tagAdmin', 'TB-AAAA-9010')));
    await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'tagAdmin', 'TB-AAAA-9010')));
    await assertFails(getDoc(doc(testEnv.authenticatedContext('owner-1').firestore(), 'tagAdmin', 'TB-AAAA-9010')));
  });

  // ---- A8: scan counter ----
  test('A8: scans only for real tags, with server time', async () => {
    await seed((db) => setDoc(doc(db, 'tags', 'TB-AAAA-9011'), { tagId: 'TB-AAAA-9011', status: 'claimed' }));
    const finder = testEnv.unauthenticatedContext();
    await assertSucceeds(
      addDoc(collection(finder.firestore(), 'tags', 'TB-AAAA-9011', 'scans'), {
        timestamp: serverTimestamp(),
        landingMode: 'lostfound',
      })
    );
    await assertFails(
      addDoc(collection(finder.firestore(), 'tags', 'TB-NOPE-0000', 'scans'), { timestamp: serverTimestamp() })
    );
  });

  // ---- chats list is no longer public ----
  test('chats: a stranger cannot list a tag\'s chats; the owner can; get by id stays public', async () => {
    const tagId = 'TB-AAAA-9012';
    await seed(async (db) => {
      await setDoc(doc(db, 'itemOwners', tagId), { ownerUid: 'owner-1' });
      await setDoc(doc(db, 'chats', 'chat-list'), { tagId, finderSessionToken: 'token-abc' });
    });
    const stranger = testEnv.authenticatedContext('stranger-1');
    await assertFails(getDocs(query(collection(stranger.firestore(), 'chats'), where('tagId', '==', tagId))));
    const owner = testEnv.authenticatedContext('owner-1');
    await assertSucceeds(getDocs(query(collection(owner.firestore(), 'chats'), where('tagId', 'in', [tagId]))));
    await assertSucceeds(getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'chats', 'chat-list')));
  });

  // ---- C1: editorRole ----
  test('C1: an owner cannot mark their content as admin-set (to skip the redirect warning)', async () => {
    const tagId = 'TB-AAAA-9013';
    await seed(async (db) => {
      await setDoc(doc(db, 'tags', tagId), { tagId, status: 'claimed' });
      await setDoc(doc(db, 'itemOwners', tagId), { ownerUid: 'owner-1' });
    });
    const owner = testEnv.authenticatedContext('owner-1');
    await assertFails(
      setDoc(doc(owner.firestore(), 'tagProfiles', tagId), {
        landingMode: 'redirect',
        redirectUrl: 'https://example.com',
        editorRole: 'admin',
      })
    );
    await assertSucceeds(
      setDoc(doc(owner.firestore(), 'tagProfiles', tagId), {
        landingMode: 'redirect',
        redirectUrl: 'https://example.com',
        editorRole: 'owner',
      })
    );
  });
});

describe('SYSTEM_AUDIT_ROUND2.md fixes', () => {
  // ---- A1: public get, no public list ----
  test('A1: anyone can open a tag, item or profile by ID', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'tags', 'TB-RRRR-0001'), { tagId: 'TB-RRRR-0001', status: 'registered' });
      await setDoc(doc(db, 'items', 'TB-RRRR-0001'), { tagId: 'TB-RRRR-0001', itemName: 'Wallet' });
      await setDoc(doc(db, 'tagProfiles', 'TB-RRRR-0001'), { displayName: 'Jane' });
    });
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(anon, 'tags', 'TB-RRRR-0001')));
    await assertSucceeds(getDoc(doc(anon, 'items', 'TB-RRRR-0001')));
    await assertSucceeds(getDoc(doc(anon, 'tagProfiles', 'TB-RRRR-0001')));
  });

  test('A1: nobody but an admin can list tags, items or profiles', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'tags', 'TB-RRRR-0002'), { tagId: 'TB-RRRR-0002', status: 'registered' });
      await setDoc(doc(db, 'items', 'TB-RRRR-0002'), { tagId: 'TB-RRRR-0002', itemName: 'Wallet' });
      await setDoc(doc(db, 'tagProfiles', 'TB-RRRR-0002'), { displayName: 'Jane' });
    });
    for (const ctx of [testEnv.unauthenticatedContext(), testEnv.authenticatedContext('stranger-1')]) {
      const db = ctx.firestore();
      await assertFails(getDocs(query(collection(db, 'tags'), where('status', '==', 'registered'))));
      await assertFails(getDocs(collection(db, 'items')));
      await assertFails(getDocs(collection(db, 'tagProfiles')));
    }
    const admin = testEnv.authenticatedContext('admin-1', { admin: true }).firestore();
    await assertSucceeds(getDocs(query(collection(admin, 'tags'), where('status', '==', 'registered'))));
    await assertSucceeds(getDocs(collection(admin, 'items')));
    await assertSucceeds(getDocs(collection(admin, 'tagProfiles')));
  });

  test('A1: an owner can still query their own items', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'itemOwners', 'TB-RRRR-0003'), { ownerUid: 'owner-1' });
      await setDoc(doc(db, 'items', 'TB-RRRR-0003'), { tagId: 'TB-RRRR-0003', itemName: 'Keys' });
    });
    const owner = testEnv.authenticatedContext('owner-1').firestore();
    await assertSucceeds(getDocs(query(collection(owner, 'items'), where('tagId', 'in', ['TB-RRRR-0003']))));
  });

  // ---- A2: disabled admins ----
  test('A2: a disabled admin loses admin rights (claim and passcode admins)', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'users', 'claim-admin'), { disabled: true });
      await setDoc(doc(db, 'users', 'doc-admin'), { isAdmin: true, disabled: true });
      await setDoc(doc(db, 'tagAdmin', 'TB-RRRR-0004'), { flagReason: 'x' });
    });
    const claimAdmin = testEnv.authenticatedContext('claim-admin', { admin: true }).firestore();
    await assertFails(getDoc(doc(claimAdmin, 'tagAdmin', 'TB-RRRR-0004')));
    const docAdmin = testEnv.authenticatedContext('doc-admin', { email_verified: true }).firestore();
    await assertFails(getDoc(doc(docAdmin, 'tagAdmin', 'TB-RRRR-0004')));
  });

  // ---- A3: passcode length ----
  test('A3: a stored passcode shorter than 8 characters never grants admin', async () => {
    await seed((db) => setDoc(doc(db, 'meta', 'adminSignup'), { passcode: 'short12' }));
    const user = testEnv.authenticatedContext('u-short');
    await assertFails(setDoc(doc(user.firestore(), 'users', 'u-short'), { isAdmin: true, adminPasscode: 'short12' }));
  });

  // ---- A4: messages ----
  test('A4: a message needs server time and only known fields', async () => {
    const tagId = 'TB-RRRR-0005';
    await seed(async (db) => {
      await setDoc(doc(db, 'tags', tagId), { tagId, status: 'claimed' });
      await setDoc(doc(db, 'chats', 'chat-r2'), { tagId, finderSessionToken: 'token-abc' });
    });
    const finder = testEnv.unauthenticatedContext().firestore();
    const base = { sender: 'finder', text: 'hello', finderSessionToken: 'token-abc' };
    await assertSucceeds(addDoc(collection(finder, 'chats', 'chat-r2', 'messages'), { ...base, timestamp: serverTimestamp() }));
    await assertFails(addDoc(collection(finder, 'chats', 'chat-r2', 'messages'), base));
    await assertFails(
      addDoc(collection(finder, 'chats', 'chat-r2', 'messages'), { ...base, timestamp: new Date('2099-01-01') })
    );
    await assertFails(
      addDoc(collection(finder, 'chats', 'chat-r2', 'messages'), { ...base, timestamp: serverTimestamp(), junk: 'x' })
    );
  });

  // ---- B7 (reverted): passcode admins do NOT need a verified email ----
  test('B7 reverted: a passcode admin is admin with or without a verified email', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'users', 'doc-admin-2'), { isAdmin: true });
      await setDoc(doc(db, 'tagAdmin', 'TB-RRRR-0006'), { flagReason: 'x' });
    });
    const unverified = testEnv.authenticatedContext('doc-admin-2').firestore();
    await assertSucceeds(getDoc(doc(unverified, 'tagAdmin', 'TB-RRRR-0006')));
    const verified = testEnv.authenticatedContext('doc-admin-2', { email_verified: true }).firestore();
    await assertSucceeds(getDoc(doc(verified, 'tagAdmin', 'TB-RRRR-0006')));
  });
});

// SYSTEM_AUDIT_ROUND2.md A0 — every earlier test used owners WITHOUT a
// users/{uid} profile, which hid that a real profile (no `disabled` field)
// made isDisabledOwner() error and deny every owner action.
describe('real user profiles (A0)', () => {
  async function seedProfile(uid, extra = {}) {
    await seed((db) => setDoc(doc(db, 'users', uid), { uid, email: `${uid}@example.com`, isAdmin: false, ...extra }));
  }

  test('an owner with a normal profile can claim a tag', async () => {
    const tagId = 'TB-ZZZZ-0001';
    await seedProfile('real-1');
    await seed((db) => setDoc(doc(db, 'tags', tagId), { tagId, status: 'registered' }));
    const db = testEnv.authenticatedContext('real-1').firestore();
    await assertSucceeds(
      runTransaction(db, async (tx) => {
        tx.set(doc(db, 'itemOwners', tagId), { ownerUid: 'real-1' });
        tx.set(doc(db, 'items', tagId), { tagId, itemName: 'Bag', isLostMode: false, lostMessage: '', rewardAmount: 0 });
        tx.update(doc(db, 'tags', tagId), { status: 'claimed' });
      })
    );
  });

  test('an owner with a normal profile can edit their item', async () => {
    const tagId = 'TB-ZZZZ-0002';
    await seedProfile('real-2');
    await seed(async (db) => {
      await setDoc(doc(db, 'itemOwners', tagId), { ownerUid: 'real-2' });
      await setDoc(doc(db, 'items', tagId), { tagId, itemName: 'Bag', isLostMode: false });
    });
    const db = testEnv.authenticatedContext('real-2').firestore();
    await assertSucceeds(updateDoc(doc(db, 'items', tagId), { isLostMode: true }));
  });

  test('a disabled owner cannot edit their item', async () => {
    const tagId = 'TB-ZZZZ-0003';
    await seedProfile('real-3', { disabled: true });
    await seed(async (db) => {
      await setDoc(doc(db, 'itemOwners', tagId), { ownerUid: 'real-3' });
      await setDoc(doc(db, 'items', tagId), { tagId, itemName: 'Bag', isLostMode: false });
    });
    const db = testEnv.authenticatedContext('real-3').firestore();
    await assertFails(updateDoc(doc(db, 'items', tagId), { isLostMode: true }));
  });
});
