import { Children, cloneElement, isValidElement } from 'react';
import { AlertCircle } from 'lucide-react';
import { Label } from './ui/label';

// Label + control + hint + error, wired for screen readers
// (UI_UX_IMPROVEMENT_PLAN.md DS6): the control gets aria-invalid and
// aria-describedby, and the error is announced where it happens.
// Fields are required unless marked `optional` (B.8).
export default function FormField({ id, label, hint, error, optional = false, counter, children }) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  const control = Children.only(children);
  const wired = isValidElement(control)
    ? cloneElement(control, {
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': [control.props['aria-describedby'], describedBy].filter(Boolean).join(' ') || undefined,
      })
    : control;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id} className="text-sm font-medium text-slate-700 dark:text-slate-200">
          {label}
          {optional && <span className="font-normal text-slate-600 dark:text-slate-400"> (optional)</span>}
        </Label>
        {counter && <span className="text-xs text-slate-600 dark:text-slate-400">{counter}</span>}
      </div>
      {wired}
      {hint && (
        <p id={hintId} className="text-xs text-slate-600 dark:text-slate-400">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="flex items-start gap-1.5 text-sm text-red-700 dark:text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}

// A form-level error (e.g. wrong email or password) — same look as a field
// error, announced right away.
export function FormError({ children }) {
  if (!children) return null;
  return (
    <p role="alert" className="flex items-start gap-1.5 text-sm text-red-700 dark:text-red-300">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      {children}
    </p>
  );
}
