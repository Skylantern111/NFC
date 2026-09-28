import { AlertTriangle, CheckCircle2, Info, Loader2, RefreshCw, Tag } from 'lucide-react';
import { Button } from './ui/button';
import { Skeleton } from './ui/skeleton';
import { cn } from '../lib/utils';

// Shared loading / empty / error / notice blocks (UI_UX_IMPROVEMENT_PLAN.md
// DS5, B.9), so every screen says these things the same way.

const SURFACE = 'rounded-3xl bg-white/70 dark:bg-white/5 backdrop-blur-xl border border-white/60 dark:border-white/10 shadow-card';

// `page`: a branded full-screen splash (auth checks, lazy routes, a tag
// page loading). `section`/`inline`: a spinner line inside a page.
export function LoadingState({ variant = 'section', label = 'Loading…', className = '' }) {
  if (variant === 'page') {
    return (
      <div
        role="status"
        className={cn('flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-base px-6', className)}
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 shadow-neu-flat-sm">
          <Tag className="h-6 w-6 text-white" aria-hidden="true" />
        </span>
        <p className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {label}
        </p>
      </div>
    );
  }
  return (
    <p
      role="status"
      className={cn(
        'flex items-center justify-center gap-2 text-sm text-slate-600 dark:text-slate-300',
        variant === 'section' && 'py-10',
        className
      )}
    >
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {label}
    </p>
  );
}

export function SkeletonList({ count = 3, className = 'h-20' }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className={cn('rounded-3xl', className)} />
      ))}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action, className = '' }) {
  return (
    <div className={cn(SURFACE, 'flex flex-col items-center gap-3 px-6 py-10 text-center', className)}>
      {Icon && (
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-900/5 dark:bg-white/5">
          <Icon className="h-6 w-6 text-slate-600 dark:text-slate-400" aria-hidden="true" />
        </span>
      )}
      <div className="max-w-sm">
        <p className="font-bold text-slate-800 dark:text-slate-100">{title}</p>
        {description && <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({ title = 'Something went wrong', description, onRetry, action, className = '' }) {
  return (
    <div role="alert" className={cn(SURFACE, 'flex flex-col items-center gap-3 px-6 py-10 text-center', className)}>
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-warning-soft">
        <AlertTriangle className="h-6 w-6 text-warning" aria-hidden="true" />
      </span>
      <div className="max-w-sm">
        <p className="font-bold text-slate-800 dark:text-slate-100">{title}</p>
        {description && <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{description}</p>}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {onRetry && (
          <Button variant="secondary" onClick={onRetry} className="gap-1.5">
            <RefreshCw className="h-4 w-4" /> Try again
          </Button>
        )}
        {action}
      </div>
    </div>
  );
}

const ALERT_TONES = {
  info: { box: 'border-info/20 bg-info-soft text-slate-800 dark:text-slate-100', icon: Info, iconClass: 'text-info' },
  success: {
    box: 'border-success/20 bg-success-soft text-slate-800 dark:text-slate-100',
    icon: CheckCircle2,
    iconClass: 'text-success',
  },
  warning: {
    box: 'border-warning/20 bg-warning-soft text-slate-800 dark:text-slate-100',
    icon: AlertTriangle,
    iconClass: 'text-warning',
  },
  danger: {
    box: 'border-red-200 dark:border-red-500/30 bg-destructive-soft text-slate-800 dark:text-slate-100',
    icon: AlertTriangle,
    iconClass: 'text-red-700 dark:text-red-300',
  },
};

// A notice inside a page. `role` defaults to "status" (polite); pass
// role="alert" for errors the user must hear right away.
export function InlineAlert({ tone = 'info', title, children, action, role = 'status', icon, className = '' }) {
  const t = ALERT_TONES[tone];
  const Icon = icon || t.icon;
  return (
    <div role={role} className={cn('flex gap-3 rounded-2xl border px-4 py-3 text-sm', t.box, className)}>
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', t.iconClass)} aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-slate-700 dark:text-slate-200">{children}</div>}
        {action && <div className="pt-1">{action}</div>}
      </div>
    </div>
  );
}
