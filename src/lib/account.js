import { EmailAuthProvider, deleteUser, reauthenticateWithCredential } from 'firebase/auth';
import { collection, deleteDoc, doc, getDoc, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { auth, db, firebaseReady } from '../firebase/config';
import { profileRepairPaused } from '../context/AuthContext';
import { clearTagHistory, releaseTag } from './ownerItems';

// "Delete my account" (SYSTEM_AUDIT_ROUND4.md C1 — full deletion). Order
// matters: everything in Firestore has to go while the caller is still
// signed in (the rules check their identity), and the Auth account last.
//   1. re-enter the password — Firebase only deletes a recently signed-in user
//   2. every owned tag: claimed → releaseTag (clears history, back to stock);
//      blacklisted → clear history + delete item/profile/ownership, the tag
//      stays blacklisted (it can't be released)
//   3. delete users/{uid}
//   4. delete the Auth user
// `onProgress(text)` gets a short status line for the UI.
export async function deleteMyAccount(password, onProgress = () => {}) {
  if (!firebaseReady) return;
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in.');

  onProgress('Checking your password…');
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));

  // The profile doc disappears in step 3; don't let AuthContext's
  // "missing profile" repair re-create it before the Auth user is gone.
  profileRepairPaused.current = true;

  const owned = await getDocs(query(collection(db, 'itemOwners'), where('ownerUid', '==', user.uid)));
  let n = 0;
  for (const ownerDoc of owned.docs) {
    const tagId = ownerDoc.id;
    n += 1;
    onProgress(`Removing tag ${n} of ${owned.size}…`);
    const tagSnap = await getDoc(doc(db, 'tags', tagId));
    const status = tagSnap.exists() ? tagSnap.data().status : null;
    if (status === 'claimed') {
      await releaseTag(tagId);
    } else {
      await clearTagHistory(tagId);
      const batch = writeBatch(db);
      batch.delete(doc(db, 'items', tagId));
      batch.delete(doc(db, 'tagProfiles', tagId));
      batch.delete(doc(db, 'itemOwners', tagId));
      await batch.commit();
    }
  }

  onProgress('Deleting your profile…');
  await deleteDoc(doc(db, 'users', user.uid));

  onProgress('Deleting your sign-in…');
  await deleteUser(user);
}
