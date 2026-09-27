// Sets (or clears) the self-serve admin signup passcode — the value
// firestore.rules#validAdminPasscode compares against when admin/AdminRegister.jsx
// creates a user with isAdmin: true (SYSTEM_AUDIT_PLAN.md A1). Admins can
// also do this in the app (admin/Owners.jsx → "Admin signup passcode"); this
// script is for bootstrapping when no admin can sign in yet.
//
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
//     node scripts/setAdminSignupPasscode.js <passcode>     # set (8+ chars)
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
//     node scripts/setAdminSignupPasscode.js --off          # turn off
//
// Requires a Firebase service-account key (see scripts/setAdmin.js's header
// for how to get one). NEVER commit that file.

const arg = process.argv[2];

if (!arg) {
  console.error('Usage: node scripts/setAdminSignupPasscode.js <passcode> | --off');
  process.exit(1);
}
if (arg !== '--off' && arg.length < 8) {
  console.error('The passcode must be at least 8 characters (firestore.rules rejects shorter ones).');
  process.exit(1);
}

// Loaded after the argument checks so a usage error doesn't need credentials.
const { db, FieldValue } = await import('./_firebaseAdmin.js');

async function main() {
  const ref = db.collection('meta').doc('adminSignup');
  if (arg === '--off') {
    await ref.delete();
    console.log('Self-serve admin signup turned off (meta/adminSignup deleted).');
    return;
  }
  await ref.set({ passcode: arg, updatedAt: FieldValue.serverTimestamp(), updatedBy: 'script' });
  console.log('Admin signup passcode set.');
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
