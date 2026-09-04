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
} from 'lucide-react';
import { generateTagId, tagUrl } from '../../lib/tags';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';

const glass = 'border-white/10 bg-white/5 backdrop-blur-xl';

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
    detail: 'Use any free NFC-writer app on your phone to write the URL as a link record.',
  },
  {
    icon: Smartphone,
    title: '4. Tap to test',
    detail: 'Tap the written tag with your phone to confirm it opens the right page.',
  },
];

// REDESIGN_PLAN §4.6. "Generate NFC ID" is client-side only — nothing is
// written to Firestore until an owner actually claims the tag, so this page
// can't create orphaned inventory rows and doesn't need any rules change.
export default function NfcSetup() {
  const nav = useNavigate();
  const [tagId, setTagId] = useState('');
  const [copied, setCopied] = useState(false);

  const url = tagId ? tagUrl(tagId) : '';

  function onGenerate() {
    setTagId(generateTagId());
    setCopied(false);
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
        <h1 className="text-2xl font-extrabold drop-shadow-md">NFC Setup</h1>
        <p className="mt-1 text-sm text-slate-400">
          Generate a unique NFC ID, write its URL to a sticker, and test it.
        </p>
      </div>

      <Card className={glass}>
        <CardContent className="space-y-4 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-pink-500">
                <Nfc className="h-5 w-5 text-white" />
              </span>
              <div>
                <p className="font-bold text-white">Generate a new NFC tag</p>
                <p className="text-xs text-slate-400">Creates a unique ID and a ready-to-write URL.</p>
              </div>
            </div>
            <Button onClick={onGenerate}>+ Generate NFC ID</Button>
          </div>

          {tagId && (
            <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/5 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate font-mono text-sm font-bold text-white">{tagId}</p>
                <p className="mt-0.5 truncate font-mono text-xs text-slate-400">{url}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button type="button" variant="outline" size="sm" onClick={onCopy} className="gap-1.5">
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copied' : 'Copy URL'}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={onTest} className="gap-1.5">
                  <ExternalLink className="h-3.5 w-3.5" />
                  Test
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className={glass}>
        <CardContent className="p-6">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-300">
            How to write &amp; test
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {STEPS.map(({ icon: Icon, title, detail }) => (
              <div key={title} className="flex gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
                <Icon className="h-5 w-5 shrink-0 text-purple-300" />
                <div>
                  <p className="text-sm font-semibold text-white">{title}</p>
                  <p className="mt-0.5 text-xs text-slate-400">{detail}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-emerald-500/30 bg-emerald-950/20 p-6">
        <CardContent className="flex flex-col gap-4 p-0 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-bold text-emerald-200">Ready to claim?</p>
            <p className="mt-1 text-sm text-emerald-300/80">
              After writing &amp; testing, log in and tap the NFC to connect it to your account, then
              add your item.
            </p>
          </div>
          <Button
            type="button"
            disabled={!tagId}
            onClick={onSimulateTap}
            className="shrink-0 gap-1.5 rounded-full bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            <PlayCircle className="h-4 w-4" />
            Simulate Tap
          </Button>
        </CardContent>
      </Card>

      <p className="text-xs text-slate-500">
        Self-serve claiming for a freshly generated ID isn't wired up yet — claiming today still
        requires a tag that's already in the admin-provisioned inventory.{' '}
        <Link to="/dashboard/items/claim" className="text-purple-300 hover:text-pink-300">
          Claim an existing tag →
        </Link>
      </p>
    </div>
  );
}
