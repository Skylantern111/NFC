import { useEffect } from 'react';
import { CheckCircle2, Nfc, RotateCcw, Smartphone, XCircle } from 'lucide-react';
import { Button } from './ui/button';
import { cn } from '../lib/utils';

export const SCAN_TIMEOUT_MS = 30 * 1000;

// Shared Web NFC scan states for the owner's claim page and the admin's
// register page (UI_UX_IMPROVEMENT_PLAN.md NFC1–NFC4, ADM6). The page owns
// the NDEFReader; this panel owns what the person sees:
//   idle → scanning (Cancel, 30 s timeout) → detected | error | unreadable
//   | denied | timeout.
// `onTimeout` must stop the page's reader.
const FAILURES = {
  error: {
    title: 'No tag detected',
    tips: [
      'Check that NFC is on (Settings → Connected devices → NFC).',
      'Hold the sticker flat against the middle-back of your phone for 2 seconds.',
      'Remove a thick phone case if you have one.',
    ],
  },
  timeout: {
    title: 'Stopped looking for a tag',
    tips: [
      'Nothing was tapped for 30 seconds.',
      'Try again, and hold the sticker against the middle-back of your phone.',
    ],
  },
  unreadable: {
    title: "That tag isn't a TagBack tag",
    tips: ['A tag was read, but it has no TagBack ID on it.', 'Check you are tapping the right sticker.'],
  },
  denied: {
    title: 'NFC permission is blocked',
    tips: ['Allow NFC for this site in your browser settings, then try again.'],
  },
};

export default function NfcScanPanel({
  status,
  onStart,
  onCancel,
  onTimeout,
  idleTitle = 'Tap your tag',
  idleHint = 'Hold the TagBack sticker against the back of your phone.',
  startLabel = 'Start scanning',
  detectedTitle = 'Tag detected',
  detectedDetail,
  fallbackHint,
}) {
  useEffect(() => {
    if (status !== 'scanning' || !onTimeout) return;
    const t = setTimeout(onTimeout, SCAN_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [status, onTimeout]);

  const failure = FAILURES[status];

  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3 rounded-2xl p-5 text-center',
        status === 'scanning' ? 'bg-base shadow-neu-pressed-sm' : 'bg-base shadow-neu-flat-sm'
      )}
      aria-live="polite"
    >
      {status === 'idle' && (
        <>
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300">
            <Nfc className="h-7 w-7" aria-hidden="true" />
          </span>
          <div>
            <p className="font-semibold text-slate-800 dark:text-slate-100">{idleTitle}</p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{idleHint}</p>
          </div>
          <Button type="button" variant="primary" onClick={onStart} className="gap-2">
            <Nfc className="h-4 w-4" /> {startLabel}
          </Button>
        </>
      )}

      {status === 'scanning' && (
        <>
          <span className="relative flex h-20 w-20 items-center justify-center" aria-hidden="true">
            <span className="absolute inset-0 animate-ping rounded-full bg-purple-400/30" />
            <span className="absolute inset-2 rounded-full bg-purple-400/20" />
            <Smartphone className="relative h-9 w-9 text-purple-700 dark:text-purple-300" />
          </span>
          <div>
            <p className="font-semibold text-slate-800 dark:text-slate-100">Ready — tap the sticker now</p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Hold it against the middle-back of your phone until it vibrates or this changes.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </>
      )}

      {status === 'detected' && (
        <>
          <CheckCircle2 className="h-10 w-10 text-success" aria-hidden="true" />
          <div>
            <p className="font-semibold text-slate-800 dark:text-slate-100">{detectedTitle}</p>
            {detectedDetail && <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{detectedDetail}</p>}
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onStart} className="gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" /> Scan a different tag
          </Button>
        </>
      )}

      {failure && (
        <>
          <XCircle className="h-10 w-10 text-red-600 dark:text-red-400" aria-hidden="true" />
          <div role="alert">
            <p className="font-semibold text-slate-800 dark:text-slate-100">{failure.title}</p>
            <ul className="mt-1 space-y-0.5 text-sm text-slate-600 dark:text-slate-300">
              {failure.tips.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
              {fallbackHint && <li>{fallbackHint}</li>}
            </ul>
          </div>
          <Button type="button" variant="secondary" onClick={onStart} className="gap-1.5">
            <RotateCcw className="h-4 w-4" /> Try again
          </Button>
        </>
      )}
    </div>
  );
}
