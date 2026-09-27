// One-off admin de-escalation script (MAIN_FUNCTIONS_IMPROVEMENT_PLAN.md
// §R2.4). Firestore's own rules block a user from ever un-setting their own
// isAdmin flag (see firestore.rules#users), and another admin CAN flip it
// via a direct Firestore write, but there was no documented/scripted path
// for doing that — this is it. Sets users/{uid}.isAdmin to false via the
// Admin SDK (bypasses firestore.rules entirely, same as setAdmin.js).
//
// This does NOT touch a real Firebase Auth custom claim (scripts/setAdmin.js's
// grant) — it only affects the self-serve isAdmin flag set at signup via
// admin/AdminRegister.jsx's passcode field. If the account you're revoking also
// has a real custom claim, that needs a separate
// getAuth().setCustomUserClaims(uid, { admin: false }) call — this
// script does not do that for you, to avoid silently touching a grant that
// may have been made through the secure path on purpose.
//
// Run standalone with Node:
//
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
//     node scripts/revokeSelfServeAdmin.js <uid-or-email>
//
// Requires a Firebase service-account key (see scripts/setAdmin.js's header
// for how to get one). NEVER commit that file.

const identifier = process.argv[2];

if (!identifier) {
  console.error('Usage: node scripts/revokeSelfServeAdmin.js <uid-or-email>');
  process.exit(1);
}

// Loaded after the argument checks so a usage error doesn't need credentials.
const { db, resolveUid } = await import('./_firebaseAdmin.js');

async function main() {
  const uid = await resolveUid(identifier);

  const userRef = db.collection('users').doc(uid);
  const snap = await userRef.get();

  if (!snap.exists) {
    console.error(`No users/${uid} document found — nothing to revoke.`);
    process.exit(1);
  }
  if (!snap.data().isAdmin) {
    console.log(`users/${uid}.isAdmin is already falsy — nothing to do.`);
    return;
  }

  await userRef.update({ isAdmin: false });
  console.log(`Success: users/${uid}.isAdmin set to false.`);
  console.log(
    'The affected user must sign out and back in (or otherwise refresh their session) ' +
      'for admin/AdminLayout.jsx to stop treating them as an admin.'
  );
}

main().catch((err) => {
  console.error('Failed to revoke self-serve admin:', err);
  process.exit(1);
});
