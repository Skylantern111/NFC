import { useEffect } from 'react';
import { CheckCircle2, Keyboard, Nfc, RotateCcw, Smartphone, XCircle } from 'lucide-react';
import { Button } from './ui/button';
import { cn } from '../lib/utils';

export const SCAN_TIMEOUT_MS = 30 * 1000;

// Shared Web NFC scan states for the owner's claim page and the admin's
// register page (UI_UX_IMPROVEMENT_PLAN.md NFC1–NFC4, ADM6). The page owns
// the NDEFReader; this panel owns what the person sees:
//   idle ("Ready to scan") → scanning ("Looking for NFC tag…", Cancel,
//   30 s timeout) → detected | error | unreadable | denied | timeout.
// `onTimeout` must stop the page's reader. `onManual` (optional) adds an
// "Enter Tag ID manually" way out on every state, so nobody is stuck on a
// phone that won't read the tag.
const FAILURES = {
  error: {
    title: 'NFC scan failed',
    tips: [
      'No tag was detected.',
      'Check that NFC is on in your phone settings.',
      'Hold the sticker flat against the back of your phone for 2 seconds. A thick case can block it.',
    ],
  },
  timeout: {
    title: 'Stopped looking for a tag',
    tips: ['Nothing was tapped for 30 seconds.', 'Try again, and hold the sticker against the back of your phone.'],
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

// Phone with the tag held to its back — shows where the tag goes.
function PhoneAndTag({ scanning }) {
  return (
    <span className="relative flex h-20 w-20 items-center justify-center" aria-hidden="true">
      {scanning && <span className="absolute inset-0 rounded-full bg-purple-400/30 motion-safe:animate-ping" />}
      <span className={cn('absolute inset-2 rounded-full', scanning ? 'bg-purple-400/20' : 'bg-purple-100 dark:bg-purple-500/15')} />
      <Smartphone className="relative h-10 w-10 text-purple-700 dark:text-purple-300" />
      <span className="absolute bottom-3 right-2 flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-purple-500 to-pink-500 shadow-neu-flat-sm">
        <Nfc className="h-3.5 w-3.5 text-white" />
      </span>
    </span>
  );
}

export default function NfcScanPanel({
  status,
  onStart,
  onCancel,
  onTimeout,
  onManual,
  manualLabel = 'Enter Tag ID manually',
  idleTitle = 'Ready to scan',
  idleHint = 'Tap Start scanning, then hold the back of your phone against the NFC tag.',
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
  const manual = onManual && (
    <Button type="button" variant="ghost" size="sm" onClick={onManual} className="min-h-11 gap-1.5">
      <Keyboard className="h-4 w-4" aria-hidden="true" /> {manualLabel}
    </Button>
  );

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
          <PhoneAndTag />
          <div>
            <p className="font-semibold text-slate-800 dark:text-slate-100">{idleTitle}</p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{idleHint}</p>
          </div>
          <Button type="button" variant="primary" onClick={onStart} className="gap-2">
            <Nfc className="h-4 w-4" /> {startLabel}
          </Button>
          {manual}
        </>
      )}

      {status === 'scanning' && (
        <>
          <PhoneAndTag scanning />
          <div role="status">
            <p className="font-semibold text-slate-800 dark:text-slate-100">Looking for NFC tag…</p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Hold the tag against the back of your phone until it vibrates or this changes.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel scan
            </Button>
            {manual}
          </div>
        </>
      )}

      {status === 'detected' && (
        <>
          <CheckCircle2 className="h-10 w-10 text-success motion-safe:animate-in motion-safe:zoom-in-50" aria-hidden="true" />
          <div>
            <p className="font-semibold text-slate-800 dark:text-slate-100">{detectedTitle}</p>
            {detectedDetail && <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{detectedDetail}</p>}
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onStart} className="min-h-11 gap-1.5">
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
              {fallbackHint && !onManual && <li>{fallbackHint}</li>}
            </ul>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button type="button" variant="secondary" onClick={onStart} className="gap-1.5">
              <RotateCcw className="h-4 w-4" /> Try again
            </Button>
            {manual}
          </div>
        </>
      )}
    </div>
  );
}
