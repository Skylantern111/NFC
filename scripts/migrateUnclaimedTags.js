// One-off data migration for the NFC hardware-identity rearchitecture
// (see NFC_REARCHITECTURE_PLAN.md). firestore.rules now checks
// tags/{tagId}.status == 'registered' where it used to check 'unclaimed' —
// any tag doc still holding the old value won't match the claim-path rules
// clause until migrated. This script flips status: 'unclaimed' -> 'registered'
// on every such doc, and drops the now-dead `batchNumber` field left over
// from the old batch-provisioning workflow (harmless if absent).
//
// NOT part of the Vite app bundle — run standalone with Node:
//
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
//     node scripts/migrateUnclaimedTags.js [--dry-run]
//
// Requires a Firebase service-account key downloaded from the Firebase
// console (Project settings -> Service accounts -> Generate new private
// key). NEVER commit that file. Uses the Admin SDK, so it bypasses
// firestore.rules entirely — this is the same credential setup as
// scripts/setAdmin.js.

const dryRun = process.argv.includes('--dry-run');

// Loaded after the argument checks so a usage error doesn't need credentials.
const { db, FieldValue } = await import('./_firebaseAdmin.js');

// Firestore batched writes cap at 500 ops — chunk rather than assume every
// project's `tags` collection is small enough for one batch.
const BATCH_SIZE = 500;

async function main() {
  const snap = await db.collection('tags').where('status', '==', 'unclaimed').get();

  if (snap.empty) {
    console.log('No tags with status "unclaimed" found. Nothing to migrate.');
    return;
  }

  console.log(`Found ${snap.size} tag(s) with status "unclaimed".`);

  if (dryRun) {
    for (const doc of snap.docs) {
      console.log(`  [dry-run] would migrate ${doc.id}`);
    }
    console.log('Dry run only — no writes made. Re-run without --dry-run to apply.');
    return;
  }

  const docs = snap.docs;
  let migrated = 0;

  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const chunk = docs.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const doc of chunk) {
      batch.update(doc.ref, {
        status: 'registered',
        batchNumber: FieldValue.delete(),
      });
    }
    await batch.commit();
    migrated += chunk.length;
    console.log(`Migrated ${migrated}/${docs.length}...`);
  }

  console.log(`Success: migrated ${migrated} tag(s) from "unclaimed" to "registered".`);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
