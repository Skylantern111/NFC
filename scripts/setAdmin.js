// One-off admin provisioning script. NOT part of the Vite app bundle — run
// standalone with Node:
//
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
//     node scripts/setAdmin.js you@example.com
//
// (or pass a UID directly instead of an email)
//
// Requires a Firebase service-account key downloaded from the Firebase
// console (Project settings -> Service accounts -> Generate new private
// key). NEVER commit that file. GOOGLE_APPLICATION_CREDENTIALS is the
// standard firebase-admin/Google Cloud convention for pointing at it.

import admin from 'firebase-admin';

const identifier = process.argv[2];

if (!identifier) {
  console.error('Usage: node scripts/setAdmin.js <uid-or-email>');
  process.exit(1);
}

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error(
    'GOOGLE_APPLICATION_CREDENTIALS is not set. Point it at your service-account JSON key, e.g.\n' +
      '  GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json node scripts/setAdmin.js you@example.com'
  );
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

async function main() {
  const uid = identifier.includes('@')
    ? (await admin.auth().getUserByEmail(identifier)).uid
    : identifier;

  await admin.auth().setCustomUserClaims(uid, { admin: true });

  console.log(`Success: uid ${uid} now has the admin custom claim.`);
  console.log(
    'The user must sign out and back in (or otherwise refresh their ID token) ' +
      'before the new claim takes effect in the app.'
  );
}

main().catch((err) => {
  console.error('Failed to set admin claim:', err);
  process.exit(1);
});
