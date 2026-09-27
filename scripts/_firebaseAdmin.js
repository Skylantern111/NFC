// Shared Admin SDK setup for scripts/*.js. firebase-admin 14 removed the old
// namespaced API (admin.auth(), admin.firestore(), admin.credential.*), so
// the scripts use the modular entry points from here.
//
// Needs GOOGLE_APPLICATION_CREDENTIALS pointing at a service-account JSON key
// (Firebase console → Project settings → Service accounts → Generate new
// private key). NEVER commit that file.

import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

export { DocumentReference, FieldValue, Timestamp } from 'firebase-admin/firestore';

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error(
    'GOOGLE_APPLICATION_CREDENTIALS is not set. Point it at your service-account JSON key, e.g.\n' +
      '  GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json node scripts/<script>.js ...'
  );
  process.exit(1);
}

initializeApp({ credential: applicationDefault() });

export const db = getFirestore();
export const auth = getAuth();

// Accepts a uid or an email address.
export async function resolveUid(identifier) {
  return identifier.includes('@') ? (await auth.getUserByEmail(identifier)).uid : identifier;
}
