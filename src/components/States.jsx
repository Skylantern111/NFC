import { AlertTriangle, CheckCircle2, Info, Loader2, RefreshCw, Tag } from 'lucide-react';
import { Button } from './ui/button';
import { Skeleton } from './ui/skeleton';
import { cn } from '../lib/utils';

// Shared loading / empty / error / notice blocks (UI_UX_IMPROVEMENT_PLAN.md
// DS5, B.9), so every screen says these things the same way.

const SURFACE = 'rounded-lg border-2 border-foreground bg-card shadow-brut';

// `page`: a branded full-screen splash (auth checks, lazy routes, a tag
// page loading). `section`/`inline`: a spinner line inside a page.
export function LoadingState({ variant = 'section', label = 'Loading…', className = '' }) {
  if (variant === 'page') {
    return (
      <div
        role="status"
        className={cn('flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-base px-6', className)}
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-md border-2 border-foreground bg-primary shadow-brut">
          <Tag className="h-6 w-6 text-primary-foreground" aria-hidden="true" />
        </span>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {label}
        </p>
      </div>
    );
  }
  return (
    <p
      role="status"
      className={cn(
        'flex items-center justify-center gap-2 text-sm text-muted-foreground',
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
        <Skeleton key={i} className={cn('rounded-lg border-2 border-foreground', className)} />
      ))}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action, className = '', ...props }) {
  return (
    <div className={cn(SURFACE, 'flex flex-col items-center gap-3 px-6 py-10 text-center', className)} {...props}>
      {Icon && (
        <span className="flex h-12 w-12 items-center justify-center rounded-md border-2 border-foreground bg-muted">
          <Icon className="h-6 w-6 text-foreground" aria-hidden="true" />
        </span>
      )}
      <div className="max-w-sm">
        <p className="font-display font-bold text-foreground">{title}</p>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

// A list that failed to load (UI_UX_IMPROVEMENT_ROUND2.md B1). Says which
// of offline / no access / failed it was — never an empty state, which
// would claim there is nothing when we simply couldn't look.
export function LoadErrorState({ what = 'this', error, onRetry, className = '' }) {
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const code = error?.code;
  let title;
  let description;
  if (offline || code === 'unavailable') {
    title = "You're offline";
    description = `Reconnect to the internet, then try again to load ${what}.`;
  } else if (code === 'permission-denied') {
    title = "You don't have access to this";
    description =
      'Sign out and sign in again. If it keeps happening, your account may have been disabled — contact TagBack.';
  } else {
    title = `We couldn't load ${what}`;
    description = 'Something went wrong while loading. Check your connection and try again.';
  }
  return <ErrorState title={title} description={description} onRetry={onRetry} className={className} />;
}

export function ErrorState({ title = 'Something went wrong', description, onRetry, action, className = '' }) {
  return (
    <div role="alert" className={cn(SURFACE, 'flex flex-col items-center gap-3 px-6 py-10 text-center', className)}>
      <span className="flex h-12 w-12 items-center justify-center rounded-md border-2 border-foreground bg-warning-soft">
        <AlertTriangle className="h-6 w-6 text-foreground" aria-hidden="true" />
      </span>
      <div className="max-w-sm">
        <p className="font-display font-bold text-foreground">{title}</p>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
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

// Brutalist notice blocks: a tinted fill, a 2px black frame, black text and a
// black icon. Hue distinguishes the tone; the icon shape carries the meaning
// too (never color alone).
const ALERT_TONES = {
  info: { box: 'bg-info-soft', icon: Info },
  success: { box: 'bg-success-soft', icon: CheckCircle2 },
  warning: { box: 'bg-warning-soft', icon: AlertTriangle },
  danger: { box: 'bg-destructive-soft', icon: AlertTriangle },
};

// A notice inside a page. `role` defaults to "status" (polite); pass
// role="alert" for errors the user must hear right away.
export function InlineAlert({ tone = 'info', title, children, action, role = 'status', icon, className = '' }) {
  const t = ALERT_TONES[tone];
  const Icon = icon || t.icon;
  return (
    <div role={role} className={cn('flex gap-3 rounded-md border-2 border-foreground px-4 py-3 text-sm text-foreground', t.box, className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-foreground" aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-1">
        {title && <p className="font-bold">{title}</p>}
        {children && <div className="text-foreground/80">{children}</div>}
        {action && <div className="pt-1">{action}</div>}
      </div>
    </div>
  );
}
