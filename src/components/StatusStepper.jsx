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

// Label under each number, so all four fit a 320 px phone without
// truncating ("Fo…", "Tal…" before).
export default function StatusStepper({ step, className = '' }) {
  return (
    <ol className={cn('grid grid-cols-4 text-xs', className)} aria-label="Recovery progress">
      {STEPS.map((label, i) => {
        const done = i < step;
        const current = i === step;
        return (
          <li key={label} className="relative flex flex-col items-center gap-1" aria-current={current ? 'step' : undefined}>
            {i > 0 && (
              <span
                className={cn(
                  'absolute right-1/2 top-2.5 mr-3 h-0.5 w-[calc(100%-1.5rem)]',
                  i <= step ? 'bg-foreground' : 'bg-foreground/20'
                )}
                aria-hidden="true"
              />
            )}
            <span
              className={cn(
                'relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-foreground text-[0.7rem] font-bold',
                done && 'bg-success text-success-foreground',
                current && 'bg-primary text-primary-foreground',
                !done && !current && 'bg-muted text-muted-foreground'
              )}
            >
              {done ? <Check className="h-3 w-3" aria-hidden="true" /> : i + 1}
            </span>
            <span
              className={cn(
                'text-center leading-tight',
                current ? 'font-bold text-foreground' : 'text-muted-foreground'
              )}
            >
              {label}
              {done && <span className="sr-only"> (done)</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
