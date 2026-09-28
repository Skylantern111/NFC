import { Check } from 'lucide-react';
import { cn } from '../lib/utils';

// The recovery flow as one visible path (UI_UX_IMPROVEMENT_PLAN.md REC1):
// Lost → Found → Talking → Recovered. Derived from existing data, no new
// fields — see recoveryStep().
const STEPS = ['Lost', 'Found', 'Talking', 'Recovered'];

// 0 lost, 1 a finder reported it, 2 either side has messaged, 3 recovered.
export function recoveryStep({ chat, hasReport }) {
  if (chat?.resolved) return 3;
  if (chat?.lastMessageAt && chat?.createdAt && chat.lastMessageAt.toMillis?.() > chat.createdAt.toMillis?.()) return 2;
  if (hasReport || chat) return 1;
  return 0;
}

export default function StatusStepper({ step, className = '' }) {
  return (
    <ol className={cn('flex items-center gap-1 text-xs', className)} aria-label="Recovery progress">
      {STEPS.map((label, i) => {
        const done = i < step;
        const current = i === step;
        return (
          <li key={label} className="flex min-w-0 flex-1 items-center gap-1" aria-current={current ? 'step' : undefined}>
            <span
              className={cn(
                'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.7rem] font-bold',
                done && 'bg-success text-success-foreground',
                current && 'bg-primary text-primary-foreground',
                !done && !current && 'bg-slate-200 text-slate-600 dark:bg-white/10 dark:text-slate-300'
              )}
            >
              {done ? <Check className="h-3 w-3" aria-hidden="true" /> : i + 1}
            </span>
            <span
              className={cn(
                'truncate',
                current ? 'font-semibold text-slate-800 dark:text-slate-100' : 'text-slate-600 dark:text-slate-400'
              )}
            >
              {label}
              {done && <span className="sr-only"> (done)</span>}
            </span>
            {i < STEPS.length - 1 && (
              <span
                className={cn('mx-1 h-px min-w-2 flex-1', done ? 'bg-success' : 'bg-slate-300 dark:bg-white/10')}
                aria-hidden="true"
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
