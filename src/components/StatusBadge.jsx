import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Circle,
  CircleDashed,
  Flag,
  MailCheck,
  MailWarning,
  PackageSearch,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { cn } from '../lib/utils';

// One badge for every status in the app (UI_UX_IMPROVEMENT_PLAN.md DS3,
// B.7): same words, color and icon everywhere, and never color alone
// (A11Y3). States are derived from existing data — see itemStatus() below.
// Brutalist tone blocks: a soft tinted fill with a 2px black frame and black
// text/icon. Hue + icon + label carry the meaning; `rose` uses the solid
// coral fill to mark the strongest admin actions (ban/blacklist) apart from
// the softer "danger" tint.
const TONES = {
  success: 'bg-success-soft text-foreground border-foreground',
  danger: 'bg-destructive-soft text-foreground border-foreground',
  info: 'bg-info-soft text-foreground border-foreground',
  warning: 'bg-warning-soft text-foreground border-foreground',
  rose: 'bg-destructive text-destructive-foreground border-foreground',
  neutral: 'bg-muted text-foreground border-foreground',
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
  // Accounts (admin/Owners.jsx, EMAIL_OWNERSHIP_PLAN.md §4)
  email_verified: { label: 'Verified email', tone: 'success', icon: MailCheck },
  email_unverified: { label: 'Email not verified', tone: 'warning', icon: MailWarning },
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
        'inline-flex w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded-md border-2 px-2 py-0.5 text-xs font-bold',
        TONES[meta.tone],
        className
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label || meta.label}
    </span>
  );
}
