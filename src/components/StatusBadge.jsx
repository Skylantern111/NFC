import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Circle,
  CircleDashed,
  Flag,
  PackageSearch,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { cn } from '../lib/utils';

// One badge for every status in the app (UI_UX_IMPROVEMENT_PLAN.md DS3,
// B.7): same words, color and icon everywhere, and never color alone
// (A11Y3). States are derived from existing data — see itemStatus() below.
const TONES = {
  success: 'bg-success-soft text-success border-success/20',
  danger: 'bg-destructive-soft text-red-700 dark:text-red-300 border-red-200 dark:border-red-500/30',
  info: 'bg-info-soft text-info border-info/20',
  warning: 'bg-warning-soft text-warning border-warning/20',
  rose: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/30',
  neutral: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-white/5 dark:text-slate-300 dark:border-white/10',
};

const STATES = {
  // Owner items
  safe: { label: 'Protected', tone: 'success', icon: ShieldCheck },
  lost: { label: 'Lost', tone: 'danger', icon: AlertTriangle },
  found: { label: 'Found — report open', tone: 'info', icon: PackageSearch },
  recovered: { label: 'Recovered', tone: 'success', icon: CheckCircle2 },
  flagged: { label: 'Flagged by admin', tone: 'rose', icon: ShieldAlert },
  // Chats
  open: { label: 'Open', tone: 'info', icon: Circle },
  review: { label: 'Under review', tone: 'warning', icon: Flag },
  // Admin tag records
  registered: { label: 'Registered', tone: 'neutral', icon: CircleDashed },
  claimed: { label: 'Claimed', tone: 'success', icon: CheckCircle2 },
  blacklisted: { label: 'Blacklisted', tone: 'rose', icon: Ban },
  not_written: { label: 'Not written', tone: 'neutral', icon: CircleDashed },
  written: { label: 'Written', tone: 'success', icon: CheckCircle2 },
  write_failed: { label: 'Write failed', tone: 'danger', icon: XCircle },
  reviewed: { label: 'Reviewed', tone: 'neutral', icon: CheckCircle2 },
  banned: { label: 'Banned', tone: 'rose', icon: Ban },
};

// An owner item's status, from the data that already exists: Lost Mode,
// an open report on the tag, and the admin's blacklist. (A released tag
// isn't the owner's any more, so it has no status here.)
export function itemStatus(item, hasOpenReport) {
  if (item?.tagStatus === 'blacklisted') return 'flagged';
  if (hasOpenReport) return 'found';
  if (item?.isLostMode) return 'lost';
  return 'safe';
}

export default function StatusBadge({ state, label, className = '' }) {
  const meta = STATES[state] || { label: label || state, tone: 'neutral', icon: Circle };
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        'inline-flex w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold',
        TONES[meta.tone],
        className
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label || meta.label}
    </span>
  );
}
