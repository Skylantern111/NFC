import { customAlphabet } from 'nanoid';

// Shared tag-status badge classes — was defined twice (admin/Inventory.jsx
// and admin/Owners.jsx) and had drifted dark-mode coverage between the two
// (see IMPROVEMENT_PLAN.md Round 7 #2). One source now, contrast-checked
// for both themes the way Round 5 checked the core palette.
//
// Status set (see NFC_REARCHITECTURE_PLAN.md §2): a tag doc only ever exists
// once an admin has registered a real physical tap — there is no
// "unregistered" Firestore status, since an unregistered tag has no doc.
export const TAG_STATUS_BADGE = {
  registered: 'border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300',
  claimed: 'border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/80 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
  blacklisted: 'border-rose-200 dark:border-rose-500/30 bg-rose-50/80 dark:bg-rose-500/10 text-rose-600 dark:text-rose-300',
};

// Unambiguous alphabet (no 0/O, 1/I/L) — this id is hand-typed by an admin
// off a sticker label and by an owner during claim, so visual confusion
// between characters is a real failure mode, not a theoretical one.
const TAGBACK_ID_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const nextTagbackFragment = customAlphabet(TAGBACK_ID_ALPHABET, 8);

// TagBack ID — the stable application-level identifier for a registered NFC
// asset (see NFC_REARCHITECTURE_PLAN.md §2). This is NOT the physical chip's
// hardware UID; it's minted by TagBack at the moment a real physical tap is
// registered (admin/nfc-register), independent of whether that device's
// browser could also read a hardware serial number. Format: TB-XXXX-XXXX.
export function generateTagbackId() {
  const fragment = nextTagbackFragment();
  return `TB-${fragment.slice(0, 4)}-${fragment.slice(4, 8)}`;
}

// Tolerant of an owner/admin pasting or typing the id without dashes, in
// lowercase, or with stray whitespace — normalizes back to the canonical
// TB-XXXX-XXXX form used as the Firestore doc id.
export function normalizeTagbackId(input) {
  const cleaned = (input || '').trim().toUpperCase().replace(/^TB-?/, '').replace(/[^A-Z0-9]/g, '');
  if (cleaned.length !== 8) return (input || '').trim();
  return `TB-${cleaned.slice(0, 4)}-${cleaned.slice(4, 8)}`;
}

// Normalizes a Web NFC NDEFReadingEvent.serialNumber (colon-separated hex,
// e.g. "04:a2:24:8b:7c:61:80") for storage/comparison. Never invents a
// value — callers must only call this when serialNumber was actually
// present and non-empty (see NFC_REARCHITECTURE_PLAN.md §0/§4.2).
export function normalizePhysicalUid(serialNumber) {
  if (!serialNumber) return null;
  const cleaned = serialNumber.replace(/:/g, '').trim().toUpperCase();
  return cleaned || null;
}

// Pulls a tagId out of a scanned NDEF message — used both when an owner
// scans a tag to claim it (dashboard/ClaimTag.jsx) and when the admin
// registration scan needs to detect "this sticker already carries a
// TagBack URL" (admin/NfcRegister.jsx). Provisioned tags carry a URL record
// pointing at /nfc/:tagId (see tagUrl below); a bare TB-XXXX-XXXX text
// record is also accepted.
//
// Anything else returns null (SYSTEM_AUDIT_PLAN.md B2): this used to fall
// back to the record's raw text, so a sticker holding e.g.
// https://instagram.com/x produced "https://instagram.com/x" as a tag id —
// and doc(db, 'tags', thatText) throws on the slashes, which blocked
// registering or claiming any sticker with a non-TagBack URL on it.
const TAG_PATH_RE = /\/nfc\/([A-Za-z0-9_-]{6,64})(?:[/?#]|$)/;
const TAGBACK_ID_RE = /^TB-?[A-Z0-9]{4}-?[A-Z0-9]{4}$/i;

export function tagIdFromNdefMessage(message) {
  const decoder = new TextDecoder();
  for (const record of message?.records || []) {
    if (record.recordType !== 'url' && record.recordType !== 'text') continue;
    let text;
    try {
      text = decoder.decode(record.data).trim();
    } catch {
      continue;
    }
    const match = text.match(TAG_PATH_RE);
    if (match) return match[1];
    if (TAGBACK_ID_RE.test(text)) return normalizeTagbackId(text);
  }
  return null;
}

export function tagUrl(tagId) {
  const base = import.meta.env.VITE_PUBLIC_BASE_URL || window.location.origin;
  return `${base.replace(/\/$/, '')}/nfc/${tagId}`;
}

// Exports whatever's currently loaded in the admin inventory table — an
// export of already-registered assets, not a provisioning mechanism (no
// code path here ever mints ids for a CSV in bulk).
export function inventoryToCsv(tags) {
  const header = 'tagId,physicalUid,chipType,status,writeStatus,url\n';
  const rows = tags
    .map((t) =>
      [t.tagId, t.physicalUid || '', t.chipType || '', t.status, t.writeStatus || '', tagUrl(t.tagId)].join(',')
    )
    .join('\n');
  return header + rows + '\n';
}
