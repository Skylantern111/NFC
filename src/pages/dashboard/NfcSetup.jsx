import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Nfc,
  Copy,
  Check,
  ExternalLink,
  ShoppingBag,
  ClipboardCopy,
  Smartphone,
  PlayCircle,
  Loader2,
  TriangleAlert,
} from 'lucide-react';
import { generateTagId, tagUrl } from '../../lib/tags';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';

const glass = 'bg-white/70 backdrop-blur-xl rounded-3xl';

// Web NFC (NDEFReader) is Chrome-on-Android + HTTPS only — no Safari/iOS,
// no desktop. Feature-detect once; every other browser falls back to the
// "free NFC-writer app" step, same as taptag.shop's guide.
const webNfcSupported = typeof window !== 'undefined' && 'NDEFReader' in window;

const STEPS = [
  {
    icon: ShoppingBag,
    title: '1. Buy a blank NFC sticker',
    detail: 'Any NTAG213-compatible sticker or card works — widely available online.',
  },
  {
    icon: ClipboardCopy,
    title: '2. Copy the generated URL',
    detail: 'Generate an ID below, then copy its tap URL.',
  },
  {
    icon: Nfc,
    title: '3. Write the URL to the tag',
    detail: webNfcSupported
      ? 'Tap "Write to NFC tag" below on this page, or use any free NFC-writer app.'
      : 'Your browser can\'t write tags directly — use any free NFC-writer app on your phone.',
  },
  {
    icon: Smartphone,
    title: '4. Tap to test',
    detail: 'Tap the written tag with your phone to confirm it opens the right page.',
  },
];

const TROUBLESHOOTING = [
  {
    problem: 'Write fails or shows an error',
    fix: 'Move the tag away from metal or a phone case, hold it still against the back of the phone, and try again.',
  },
  {
    problem: 'Phone doesn\'t detect the tag at all',
    fix: 'Make sure NFC is turned on in your phone settings, then try slightly different positions on the back of the phone.',
  },
  {
    problem: 'iPhone or desktop browser',
    fix: 'Web NFC only works in Chrome on Android. On iPhone or desktop, use a free NFC-writer app instead — the URL is the same either way.',
  },
];

// REDESIGN_PLAN §4.6. "Generate NFC ID" is client-side only — nothing is
// written to Firestore until an owner actually claims the tag, so this page
// can't create orphaned inventory rows and doesn't need any rules change.
export default function NfcSetup() {
  const nav = useNavigate();
  const [tagId, setTagId] = useState('');
  const [copied, setCopied] = useState(false);
  // idle | scanning | success | error
  const [writeStatus, setWriteStatus] = useState('idle');
  const [writeError, setWriteError] = useState('');

  const url = tagId ? tagUrl(tagId) : '';

  function onGenerate() {
    setTagId(generateTagId());
    setCopied(false);
    setWriteStatus('idle');
    setWriteError('');
  }

  // Writes the tap URL straight to a physical tag from the browser via Web
  // NFC — no separate app needed on supported devices (Chrome on Android).
  async function onWriteTag() {
    if (!webNfcSupported || !tagId) return;
    setWriteStatus('scanning');
    setWriteError('');
    try {
      const ndef = new window.NDEFReader();
      await ndef.write({ records: [{ recordType: 'url', data: url }] });
      setWriteStatus('success');
    } catch (err) {
      setWriteStatus('error');
      setWriteError(err?.message || 'Could not write to the tag.');
    }
  }

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can fail (permissions/insecure context) — ignore silently.
    }
  }

  function onTest() {
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  // Distinct from "Test": stands in for an actual physical tap when no NFC
  // hardware is on hand, navigating in the current tab rather than opening
  // a preview tab.
  function onSimulateTap() {
    nav(`/nfc/${tagId}`);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-800">NFC Setup</h1>
        <p className="mt-1 text-sm text-slate-500">
          Generate a unique NFC ID, write its URL to a sticker, and test it.
        </p>
      </div>

      <Card className={glass}>
        <CardContent className="space-y-4 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 shadow-neu-flat-sm">
                <Nfc className="h-5 w-5 text-white" />
              </span>
              <div>
                <p className="font-bold text-slate-800">Generate a new NFC tag</p>
                <p className="text-xs text-slate-500">Creates a unique ID and a ready-to-write URL.</p>
              </div>
            </div>
            <Button onClick={onGenerate}>+ Generate NFC ID</Button>
          </div>

          {tagId && (
            <div className="flex flex-col gap-3 rounded-xl bg-base p-4 shadow-neu-pressed-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate font-mono text-sm font-bold text-slate-800">{tagId}</p>
                <p className="mt-0.5 truncate font-mono text-xs text-slate-500">{url}</p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={onCopy} className="gap-1.5">
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copied' : 'Copy URL'}
                </Button>
                {webNfcSupported && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={onWriteTag}
                    disabled={writeStatus === 'scanning'}
                    className="gap-1.5"
                  >
                    {writeStatus === 'scanning' ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Nfc className="h-3.5 w-3.5" />
                    )}
                    {writeStatus === 'scanning' ? 'Hold tag near phone…' : 'Write to NFC tag'}
                  </Button>
                )}
                <Button type="button" variant="outline" size="sm" onClick={onTest} className="gap-1.5">
                  <ExternalLink className="h-3.5 w-3.5" />
                  Test
                </Button>
              </div>
            </div>
          )}

          {writeStatus === 'success' && (
            <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-600">
              <Check className="h-4 w-4" /> Tag written. Tap it with your phone to confirm.
            </p>
          )}
          {writeStatus === 'error' && (
            <p className="flex items-center gap-1.5 text-sm font-medium text-red-500">
              <TriangleAlert className="h-4 w-4" /> {writeError}
            </p>
          )}
          {!webNfcSupported && tagId && (
            <p className="text-xs text-slate-500">
              This browser can't write NFC tags directly — use a free NFC-writer app on your phone
              instead (see step 3 below).
            </p>
          )}
        </CardContent>
      </Card>

      <Card className={glass}>
        <CardContent className="p-6">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-600">
            How to write &amp; test
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {STEPS.map(({ icon: Icon, title, detail }) => (
              <div key={title} className="flex gap-3 rounded-xl bg-base p-4 shadow-neu-flat-sm">
                <Icon className="h-5 w-5 shrink-0 text-purple-600" />
                <div>
                  <p className="text-sm font-semibold text-slate-800">{title}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{detail}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className={glass}>
        <CardContent className="p-6">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-600">
            Troubleshooting
          </h2>
          <div className="space-y-3">
            {TROUBLESHOOTING.map(({ problem, fix }) => (
              <div key={problem} className="flex gap-3 rounded-xl bg-base p-4 shadow-neu-flat-sm">
                <TriangleAlert className="h-5 w-5 shrink-0 text-amber-500" />
                <div>
                  <p className="text-sm font-semibold text-slate-800">{problem}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{fix}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-3xl border border-emerald-200 bg-emerald-50/80 p-6 shadow-lg">
        <CardContent className="flex flex-col gap-4 p-0 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-bold text-emerald-700">Ready to claim?</p>
            <p className="mt-1 text-sm text-emerald-600">
              After writing &amp; testing, log in and tap the NFC to connect it to your account, then
              add your item.
            </p>
          </div>
          <Button
            type="button"
            disabled={!tagId}
            onClick={onSimulateTap}
            className="shrink-0 gap-1.5 rounded-full bg-emerald-600 text-white shadow-neu-flat-sm hover:bg-emerald-500 disabled:opacity-50"
          >
            <PlayCircle className="h-4 w-4" />
            Simulate Tap
          </Button>
        </CardContent>
      </Card>

      <p className="text-xs text-slate-500">
        Self-serve claiming for a freshly generated ID isn't wired up yet — claiming today still
        requires a tag that's already in the admin-provisioned inventory.{' '}
        <Link to="/dashboard/items/claim" className="text-purple-600 hover:text-pink-600">
          Claim an existing tag →
        </Link>
      </p>
    </div>
  );
}
