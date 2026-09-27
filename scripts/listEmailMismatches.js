// Lists users whose stored users/{uid}.email doesn't match their Firebase
// Auth email (SYSTEM_AUDIT_ROUND4.md B1). Before the rules fix, anyone could
// store any email on their own profile, and the admin console displays that
// field. Run once after deploying the fix; correct or investigate what it
// finds.
//
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
//     node scripts/listEmailMismatches.js
//
// Read-only.

const { db, auth } = await import('./_firebaseAdmin.js');

async function main() {
  const snap = await db.collection('users').get();
  let mismatches = 0;
  for (const d of snap.docs) {
    const stored = d.data().email;
    let real = null;
    try {
      real = (await auth.getUser(d.id)).email || null;
    } catch {
      real = '(no Auth user)';
    }
    if (stored && stored.toLowerCase() !== (real || '').toLowerCase()) {
      mismatches += 1;
      console.log(`  ${d.id}  stored: ${stored}  auth: ${real}`);
    }
  }
  console.log(`${snap.size} profiles checked, ${mismatches} mismatch(es).`);
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
