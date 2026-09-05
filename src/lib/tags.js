import { nanoid } from 'nanoid';

// Shared tag-status badge classes — was defined twice (admin/Inventory.jsx
// and admin/Owners.jsx) and had drifted dark-mode coverage between the two
// (see IMPROVEMENT_PLAN.md Round 7 #2). One source now, contrast-checked
// for both themes the way Round 5 checked the core palette.
export const TAG_STATUS_BADGE = {
  unclaimed: 'border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300',
  claimed: 'border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/80 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
  blacklisted: 'border-rose-200 dark:border-rose-500/30 bg-rose-50/80 dark:bg-rose-500/10 text-rose-600 dark:text-rose-300',
};

// High-entropy public tag id. 21-char nanoid ~= 126 bits, non-sequential and
// non-guessable, so tag URLs cannot be scraped or spoofed by enumeration.
export function generateTagId() {
  return nanoid(21);
}

// Batch of unique tag records for admin provisioning + CSV export.
export function generateBatch(count, batchNumber) {
  const now = Date.now();
  return Array.from({ length: count }, () => ({
    tagId: generateTagId(),
    batchNumber,
    status: 'unclaimed',
    createdAt: now,
  }));
}

export function tagUrl(tagId) {
  const base = import.meta.env.VITE_PUBLIC_BASE_URL || window.location.origin;
  return `${base.replace(/\/$/, '')}/nfc/${tagId}`;
}

export function batchToCsv(tags) {
  const header = 'tagId,batchNumber,status,url\n';
  const rows = tags
    .map((t) => `${t.tagId},${t.batchNumber},${t.status},${tagUrl(t.tagId)}`)
    .join('\n');
  return header + rows + '\n';
}
