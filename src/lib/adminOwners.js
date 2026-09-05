import { collection, doc, getDoc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { db, firebaseReady } from '../firebase/config';

// Admin-only owner lookup (§ Round 6 item 8 — admin/Owners.jsx). Backed by
// firestore.rules' admin-read allowance on itemOwners/users; nothing here is
// writable except users/{uid}.disabled, gated the same way.
//
// No Cloud Functions/Admin SDK in this project, so "disable an account" is a
// soft disable: it can't revoke Firebase Auth sign-in itself, but
// firestore.rules folds it into ownsTag(), so a disabled owner loses every
// owner-gated read/write (their items, chats, new claims) the moment it's set.
export async function findOwnerByTag(tagId) {
  if (!firebaseReady) return { error: 'preview-mode' };
  const ownerSnap = await getDoc(doc(db, 'itemOwners', tagId));
  if (!ownerSnap.exists()) return { owner: null, ownerUid: null };
  const ownerUid = ownerSnap.data().ownerUid;
  const userSnap = await getDoc(doc(db, 'users', ownerUid));
  return {
    ownerUid,
    owner: userSnap.exists() ? { uid: ownerUid, ...userSnap.data() } : { uid: ownerUid },
  };
}

export async function listOwnerTags(ownerUid) {
  if (!firebaseReady || !ownerUid) return [];
  const q = query(collection(db, 'itemOwners'), where('ownerUid', '==', ownerUid));
  const snap = await getDocs(q);
  const tagIds = snap.docs.map((d) => d.id);
  // Best-effort item/tag detail per tagId — small per-owner set (a person's
  // own tags), same order of magnitude as the 30-tag `in`-query cap
  // elsewhere in the app, so plain parallel gets are fine here.
  const details = await Promise.all(
    tagIds.map(async (tagId) => {
      const [itemSnap, tagSnap] = await Promise.all([
        getDoc(doc(db, 'items', tagId)),
        getDoc(doc(db, 'tags', tagId)),
      ]);
      return {
        tagId,
        itemName: itemSnap.exists() ? itemSnap.data().itemName : null,
        status: tagSnap.exists() ? tagSnap.data().status : null,
      };
    })
  );
  return details;
}

export async function setOwnerDisabled(ownerUid, disabled) {
  if (!firebaseReady) return;
  await updateDoc(doc(db, 'users', ownerUid), { disabled });
}
