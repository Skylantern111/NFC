import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// Accepts either a Firestore Timestamp (.toMillis()) or an ISO string, so
// callers don't need to branch on live-vs-mock data shape.
export function toMillis(ts) {
  if (!ts) return null;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  const ms = new Date(ts).getTime();
  return Number.isNaN(ms) ? null : ms;
}

export function relativeTimeFromMs(ms) {
  if (!ms) return '';
  const diffMin = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.round(diffHr / 24)}d ago`;
}

export function daysSinceMs(ms) {
  if (!ms) return 0;
  return Math.floor((Date.now() - ms) / (24 * 60 * 60 * 1000));
}
