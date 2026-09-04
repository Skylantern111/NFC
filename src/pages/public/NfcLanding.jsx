import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  doc,
  getDoc,
  collection,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import {
  ArrowRight,
  Loader2,
  LocateFixed,
  MapPin,
  MessageSquare,
  ShieldCheck,
} from 'lucide-react';
import { db, firebaseReady } from '../../firebase/config';
import { captureLocation } from '../../lib/geolocation';
import { getFinderToken } from '../../lib/finderSession';
import { notifyOwner } from '../../lib/ownerItems';
import AmbientBackground from '../../components/AmbientBackground';
import TopNav from '../../components/nav/TopNav';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

// Shared frosted-glass treatment applied over the ported ui/Card primitive so
// public pages keep the app's light glassmorphism language.
const GLASS = 'rounded-3xl bg-white/70 backdrop-blur-2xl shadow-lg';

// Public preview of an item. Intentionally only the fields a finder may see —
// never ownerUid or any `users` data.
function publicItemMock(tagId) {
  return {
    tagId,
    itemName: 'Black Travel Backpack',
    isLostMode: true,
    lostMessage: 'Lost at the airport — reward for safe return!',
    rewardAmount: 40,
  };
}

export default function NfcLanding() {
  const { tagId } = useParams();
  const nav = useNavigate();
  const [item, setItem] = useState(null);
  const [state, setState] = useState('loading'); // loading | ready | notfound
  const [note, setNote] = useState('');
  const [locationNote, setLocationNote] = useState('');
  const [location, setLocation] = useState(null);
  const [locStatus, setLocStatus] = useState('idle'); // idle | loading | done | unavailable
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      if (!firebaseReady) {
        if (live) {
          setItem(publicItemMock(tagId));
          setState('ready');
        }
        return;
      }
      try {
        // Public read: security rules expose only whitelisted fields.
        const snap = await getDoc(doc(db, 'items', tagId));
        if (!live) return;
        if (snap.exists()) {
          setItem({ tagId, ...snap.data() });
          setState('ready');
        } else {
          setState('notfound');
        }
      } catch {
        if (live) setState('notfound');
      }
    })();
    return () => {
      live = false;
    };
  }, [tagId]);

  // Real, gracefully-degrading browser geolocation (see lib/geolocation.js —
  // resolves null on denial/unsupported/timeout rather than throwing). Not a
  // fake timer: this is an actual GPS read, fired on demand from the toggle.
  // A raw "lat, lng" note is one we auto-filled, not something the finder
  // typed — safe to overwrite on a re-share without losing their own text.
  const isAutoFilledNote = (note) => /^-?\d+\.\d+, -?\d+\.\d+$/.test(note || '');

  async function handleAttachLocation() {
    const wasAutoFilled = !locationNote || isAutoFilledNote(locationNote);
    setLocStatus('loading');
    const loc = await captureLocation();
    if (loc) {
      setLocation(loc);
      setLocStatus('done');
      if (wasAutoFilled) {
        setLocationNote(`${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`);
      }
    } else {
      setLocStatus('unavailable');
    }
  }

  async function submitReport(e) {
    e.preventDefault();
    setBusy(true);
    const finderSessionToken = getFinderToken();

    if (!firebaseReady) {
      // Preview: skip persistence, go straight to a mock chat.
      nav(`/chat/preview-${tagId}`);
      return;
    }
    try {
      const report = await addDoc(collection(db, 'reports'), {
        tagId,
        finderSessionToken,
        initialMessage: note,
        locationNote: locationNote || null,
        location,
        status: 'open',
        timestamp: serverTimestamp(),
      });
      const chat = await addDoc(collection(db, 'chats'), {
        reportId: report.id,
        tagId,
        finderSessionToken,
        createdAt: serverTimestamp(),
        // Seeds the Messages.jsx list row immediately, before any reply is
        // sent in the chat thread itself — unread for the owner from the start.
        lastMessageAt: serverTimestamp(),
        lastMessageText: (note || 'New report filed').slice(0, 140),
        unreadFor: ['owner'],
      });
      // Best-effort: the report itself already succeeded above, so a failure
      // here shouldn't block the finder's flow — just surfaced for debugging
      // rather than silently swallowed.
      notifyOwner({ type: 'report', tagId, chatId: chat.id, reportId: report.id }).catch((err) =>
        console.warn('notifyOwner failed:', err)
      );
      nav(`/chat/${chat.id}`);
    } catch (err) {
      // firestore.rules#isBlockedToken rejects a banned finder's session
      // token with a generic permission-denied — give that case a specific,
      // human message instead of a raw Firestore error string.
      const message =
        err.code === 'permission-denied'
          ? "This device can't file reports right now."
          : 'Could not send report: ' + err.message;
      alert(message);
      setBusy(false);
    }
  }

  if (state === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center text-slate-500">Loading…</div>
    );
  }

  if (state === 'notfound') {
    return (
      <>
        <AmbientBackground />
        <div className="relative flex min-h-screen flex-col">
          <TopNav fallback="/" />
          <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 text-center">
            <Card className={GLASS}>
              <CardContent className="text-slate-800">
                <h1 className="text-2xl font-bold">Tag not recognized</h1>
                <p className="mt-2 text-slate-500">
                  This tag isn't registered yet, or the link is incorrect.
                </p>
              </CardContent>
            </Card>
          </main>
        </div>
      </>
    );
  }

  const lost = item.isLostMode;

  return (
    <>
      <AmbientBackground />
      <div className="relative flex min-h-screen flex-col">
        <TopNav fallback="/" />
        <main className="relative mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-4 px-4 py-6 sm:px-6">
        <Card
          className={cn(
            GLASS,
            lost &&
              'border-2 border-red-400 bg-red-50/60 shadow-[0_0_24px_rgba(239,68,68,0.25)] animate-pulseGlow'
          )}
        >
          <CardContent className="text-slate-800">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge variant={lost ? 'destructive' : 'secondary'}>
                {lost ? 'Reported lost' : 'Found item'}
              </Badge>
              {lost && item.rewardAmount > 0 && (
                <Badge variant="outline" className="border-amber-200 bg-amber-50/80 text-amber-600">
                  ${item.rewardAmount} reward
                </Badge>
              )}
            </div>
            <h1 className="text-2xl font-extrabold text-slate-800 sm:text-3xl">
              You found {item.itemName}
            </h1>

            {lost && item.lostMessage && (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50/70 p-4">
                <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-red-600">
                  <MessageSquare className="h-3.5 w-3.5" />
                  Message from the owner
                </p>
                <p className="text-red-700">{item.lostMessage}</p>
              </div>
            )}

            <div className="mt-4 flex items-center gap-2.5 rounded-xl bg-base px-3.5 py-2.5 text-xs text-slate-600 shadow-neu-pressed-sm">
              <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
              <span>
                Your identity stays private — no app, no account, and no contact info is ever
                exposed to the owner.
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className={GLASS}>
          <CardContent className="text-slate-800">
            <form onSubmit={submitReport} className="flex flex-col gap-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-600">Current location</span>
                    <span className="text-xs text-slate-400">
                      {locStatus === 'done'
                        ? `±${Math.round(location?.accuracy ?? 0)}m accuracy`
                        : locStatus === 'unavailable'
                          ? 'Unavailable'
                          : 'Optional'}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleAttachLocation}
                    disabled={locStatus === 'loading'}
                    className="justify-start gap-2"
                  >
                    {locStatus === 'loading' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <LocateFixed className="h-4 w-4" />
                    )}
                    {locStatus === 'done'
                      ? 'Update my location'
                      : locStatus === 'loading'
                        ? 'Getting your location…'
                        : 'Share my current location'}
                  </Button>

                  <Label htmlFor="location-note" className="mt-1 text-sm font-medium text-slate-600">
                    <MapPin className="h-3.5 w-3.5" />
                    Location note
                  </Label>
                  <Input
                    id="location-note"
                    value={locationNote}
                    onChange={(e) => setLocationNote(e.target.value)}
                    placeholder="e.g. Left with the concierge at Hotel Blue"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="finder-message" className="text-sm font-medium text-slate-600">
                      Message to the owner
                    </Label>
                    <span className="text-xs text-slate-400">Required</span>
                  </div>
                  <Textarea
                    id="finder-message"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                    placeholder="e.g. Left it at the reception desk of Hotel Blue."
                    className="flex-1"
                    required
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={busy}
                className={cn(
                  'gap-2',
                  lost
                    ? 'bg-red-600 text-white hover:bg-red-500'
                    : 'bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-500 hover:to-pink-500'
                )}
              >
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Sending…
                  </>
                ) : (
                  <>
                    Report found item <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-slate-500">
          Your identity stays private. No app or account needed.
        </p>
        </main>
      </div>
    </>
  );
}
