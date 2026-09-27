// Free Firestore backup (SYSTEM_AUDIT_ROUND3.md C3). The project is on the
// Spark plan, so there's no point-in-time recovery or managed export
// (`gcloud firestore export` needs a Cloud Storage bucket, i.e. Blaze).
// This dumps every collection — and their subcollections, e.g.
// chats/{id}/messages and tags/{id}/scans — to local JSON files:
//
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
//     node scripts/exportFirestore.js [outDir]
//
// Default outDir: backups/<timestamp>/ (git-ignored). Read-only against
// Firestore. Timestamps are written as ISO strings. Requires a Firebase
// service-account key (see scripts/setAdmin.js's header). NEVER commit
// that file, or the backups — they contain private data.

import fs from 'node:fs';
import path from 'node:path';
import admin from 'firebase-admin';

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('GOOGLE_APPLICATION_CREDENTIALS is not set. Point it at your service-account JSON key.');
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.applicationDefault() });
const db = admin.firestore();

const outDir = process.argv[2] || path.join('backups', new Date().toISOString().replace(/[:.]/g, '-'));

function plain(value) {
  if (value instanceof admin.firestore.Timestamp) return value.toDate().toISOString();
  if (value instanceof admin.firestore.DocumentReference) return value.path;
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plain(v)]));
  }
  return value;
}

let docCount = 0;

// Writes one JSON file per collection path: { docId: { ...fields } }.
async function exportCollection(ref) {
  const snap = await ref.get();
  const out = {};
  for (const d of snap.docs) {
    out[d.id] = plain(d.data());
    docCount += 1;
    for (const sub of await d.ref.listCollections()) await exportCollection(sub);
  }
  const file = path.join(outDir, `${ref.path.replace(/\//g, '__')}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(`  ${ref.path}: ${snap.size} docs`);
}

async function main() {
  console.log(`Exporting to ${outDir}`);
  for (const col of await db.listCollections()) await exportCollection(col);
  console.log(`Done: ${docCount} documents.`);
}

main().catch((err) => {
  console.error('Export failed:', err);
  process.exit(1);
});
