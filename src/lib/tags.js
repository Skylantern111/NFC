import { nanoid } from 'nanoid';

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
