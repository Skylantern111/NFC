// Lists every users/{uid} doc with isAdmin: true (SYSTEM_AUDIT_PLAN.md A1).
// Before the rules fix, any signed-in user could delete and re-create their
// own users doc with isAdmin: true — run this once after deploying the fix
// and revoke anyone who shouldn't be there with
// scripts/revokeSelfServeAdmin.js.
//
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
//     node scripts/listSelfServeAdmins.js
//
// Read-only. Requires a Firebase service-account key (see
// scripts/setAdmin.js's header). NEVER commit that file.

import admin from 'firebase-admin';

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('GOOGLE_APPLICATION_CREDENTIALS is not set. Point it at your service-account JSON key.');
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.applicationDefault() });

async function main() {
  const snap = await admin.firestore().collection('users').where('isAdmin', '==', true).get();
  if (snap.empty) {
    console.log('No self-serve admins (users with isAdmin: true).');
    return;
  }
  console.log(`${snap.size} self-serve admin(s):`);
  for (const d of snap.docs) {
    const data = d.data();
    const created = data.createdAt?.toDate?.().toISOString() || 'unknown';
    console.log(`  ${d.id}  ${data.email || '(no email)'}  created ${created}`);
  }
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
