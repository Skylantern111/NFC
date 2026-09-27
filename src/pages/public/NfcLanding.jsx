import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  doc,
  getDoc,
  collection,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import {
  ArrowRight,
  ExternalLink,
  Loader2,
  LocateFixed,
  MapPin,
  MessageSquare,
  ShieldAlert,
  ShieldCheck,
  Tag as TagIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { db, firebaseReady } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { captureLocation } from '../../lib/geolocation';
import { getFinderToken } from '../../lib/finderSession';
import { notifyOwner, recordTagScan } from '../../lib/ownerItems';
import { hasVisibleLinks, isAdminManaged, resolveLanding } from '../../lib/tagContent';
import { LinkPills, ProfileCard } from '../../components/TagContent';
import AmbientBackground from '../../components/AmbientBackground';
import TopNav from '../../components/nav/TopNav';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn, friendlyFirestoreError } from '@/lib/utils';

// Shared frosted-glass treatment applied over the ported ui/Card primitive so
// public pages keep the app's light glassmorphism language.
const GLASS = 'rounded-3xl bg-white/70 dark:bg-white/5 backdrop-blur-xl shadow-lg';

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

// Social/contact pills (shared with the profile card and the editors'
// live preview) — the card only renders when there's something to show.
function LinkPillsCard({ profile }) {
  if (!hasVisibleLinks(profile)) return null;
  return (
    <Card className={GLASS}>
      <CardContent className="text-slate-800 dark:text-slate-100">
        <LinkPills profile={profile} interactive />
      </CardContent>
    </Card>
  );
}

export default function NfcLanding() {
  const { tagId } = useParams();
  const nav = useNavigate();
  // Editors' "Preview"/"Open" links add ?preview=1 so an owner or admin
  // checking the page doesn't inflate the tap count (SYSTEM_AUDIT_PLAN.md C2).
  const [searchParams] = useSearchParams();
  const isPreview = searchParams.get('preview') === '1';
  const { user } = useAuth();
  const [item, setItem] = useState(null);
  const [tagProfile, setTagProfile] = useState(null);
  // loading | ready (lost & found) | profile | redirecting | notfound | blacklisted | unclaimed
  const [state, setState] = useState('loading');
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
        // Tag status first — a blacklisted tag (admin/Inventory.jsx) skips
        // the item read entirely; firestore.rules also blocks the
        // report/chat/message writes below, this just avoids showing the
        // form at all instead of only failing once submitted.
        const tagSnap = await getDoc(doc(db, 'tags', tagId));
        if (!live) return;
        if (tagSnap.exists() && tagSnap.data().status === 'blacklisted') {
          setState('blacklisted');
          return;
        }
        // Public read: security rules expose only whitelisted fields. The
        // item read is wasted on an unclaimed tag (no items doc yet), but
        // running both in parallel keeps the common claimed-tag path fast.
        const [snap, profileSnap] = await Promise.all([
          getDoc(doc(db, 'items', tagId)),
          getDoc(doc(db, 'tagProfiles', tagId)),
        ]);
        if (!live) return;
        const profile = profileSnap.exists() ? profileSnap.data() : null;
        setTagProfile(profile);

        // The sticker only carries this URL; tagProfiles decides what the
        // tap shows (NFC_WRITE_DATA_ADMIN_PLAN.md).
        function show(landing) {
          // Best-effort tap counter — never blocks or fails the page render.
          if (!isPreview) recordTagScan(tagId, landing);
          if (landing === 'redirect') {
            // SYSTEM_AUDIT_PLAN.md C1: an owner-set redirect goes through a
            // "leaving TagBack" page, so a trusted TagBack link can't silently
            // bounce people to a phishing site. It needs a click — it used to
            // auto-continue after 5 s (SYSTEM_AUDIT_ROUND2.md B10). Admin-set
            // redirects (editorRole is rules-checked) stay instant.
            if (profile.editorRole === 'admin') {
              setState('redirecting');
              window.location.replace(profile.redirectUrl);
            } else {
              setState('leaving');
            }
          } else {
            setState(landing === 'profile' ? 'profile' : 'ready');
          }
        }

        // Registered but not yet claimed: no items/itemOwners doc exists yet
        // (only created at claim time — see ClaimTag.jsx). An admin may have
        // given it profile/redirect content (company stock) — show that.
        // Otherwise tapping it should offer to claim it, not a dead end.
        if (tagSnap.exists() && tagSnap.data().status === 'registered') {
          const landing = isAdminManaged(profile) ? resolveLanding(profile, null) : 'lostfound';
          // No item to show a lost & found page for — fall back to the claim offer.
          if (landing === 'lostfound') setState('unclaimed');
          else show(landing);
          return;
        }
        if (snap.exists()) {
          const nextItem = { tagId, ...snap.data() };
          setItem(nextItem);
          show(resolveLanding(profile, nextItem));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tagId]);


  // Browser tab title: the profile's display name or the item's name once
  // loaded. Link-preview bots don't run this (see index.html), so shared
  // previews stay generic — this only affects the open page.
  useEffect(() => {
    const base = document.title;
    const name =
      state === 'profile' ? tagProfile?.displayName?.trim() : state === 'ready' ? item?.itemName?.trim() : '';
    if (name) document.title = `${name} · TagBack`;
    return () => {
      document.title = base;
    };
  }, [state, tagProfile, item]);

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
        setLocationNote(`${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`);
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
          : friendlyFirestoreError(err, 'Could not send report. Please try again.');
      toast.error(message);
      setBusy(false);
    }
  }

  if (state === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center gap-2 text-slate-500 dark:text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
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
              <CardContent className="text-slate-800 dark:text-slate-100">
                <h1 className="text-2xl font-bold">Tag not recognized</h1>
                <p className="mt-2 text-slate-500 dark:text-slate-400">
                  This tag isn't registered yet, or the link is incorrect.
                </p>
              </CardContent>
            </Card>
          </main>
        </div>
      </>
    );
  }

  if (state === 'unclaimed') {
    const claimPath = `/dashboard/items/claim?tagId=${encodeURIComponent(tagId)}`;
    return (
      <>
        <AmbientBackground />
        <div className="relative flex min-h-screen flex-col">
          <TopNav fallback="/" />
          <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 text-center">
            <Card className={GLASS}>
              <CardContent className="flex flex-col items-center gap-3 text-slate-800 dark:text-slate-100">
                <TagIcon className="h-6 w-6 text-purple-600" />
                <h1 className="text-2xl font-bold">This tag isn't claimed yet</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {user
                    ? 'Claim it now to link it to your account.'
                    : 'Sign in to claim this tag and link it to your account.'}
                </p>
                {user ? (
                  <Button
                    className="mt-1 w-full gap-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-500 hover:to-pink-500"
                    onClick={() => nav(claimPath)}
                  >
                    Claim this tag <ArrowRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <Link
                    to="/login"
                    state={{ from: { pathname: '/dashboard/items/claim', search: `?tagId=${encodeURIComponent(tagId)}` } }}
                    className="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-purple-600 to-pink-600 px-4 py-2.5 text-sm font-semibold text-white hover:from-purple-500 hover:to-pink-500"
                  >
                    Sign in to claim <ArrowRight className="h-4 w-4" />
                  </Link>
                )}
                {!user && (
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    No account?{' '}
                    <Link to="/register" className="font-semibold text-purple-600 hover:text-pink-600">
                      Create one
                    </Link>
                  </p>
                )}
              </CardContent>
            </Card>
          </main>
        </div>
      </>
    );
  }

  if (state === 'redirecting') {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 px-5 text-center text-slate-500 dark:text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin" />
        <p className="text-sm">Opening link…</p>
        <a
          href={tagProfile?.redirectUrl}
          className="inline-flex items-center gap-1 break-all text-xs font-semibold text-purple-600 hover:text-pink-600"
        >
          <ExternalLink className="h-3.5 w-3.5 shrink-0" /> {tagProfile?.redirectUrl}
        </a>
      </div>
    );
  }

  if (state === 'leaving') {
    let host = tagProfile?.redirectUrl;
    try {
      host = new URL(tagProfile.redirectUrl).hostname;
    } catch {
      // Keep the raw URL.
    }
    return (
      <>
        <AmbientBackground />
        <div className="relative flex min-h-screen flex-col">
          <TopNav fallback="/" />
          <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 text-center">
            <Card className={GLASS}>
              <CardContent className="flex flex-col items-center gap-3 text-slate-800 dark:text-slate-100">
                <ExternalLink className="h-6 w-6 text-purple-600" />
                <h1 className="text-xl font-bold">You're leaving TagBack</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  This tag's owner links to <span className="font-semibold text-slate-700 dark:text-slate-200">{host}</span>.
                  Only continue if you trust it.
                </p>
                <p className="break-all text-xs text-slate-400 dark:text-slate-500">{tagProfile?.redirectUrl}</p>
                <Button
                  className="mt-1 w-full gap-2"
                  onClick={() => window.location.replace(tagProfile.redirectUrl)}
                >
                  Continue to {host} <ArrowRight className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          </main>
        </div>
      </>
    );
  }

  if (state === 'profile') {
    // The report link only makes sense when there's an owner to notify
    // (claimed tag → item exists) and reporting isn't switched off.
    const canReport = !!item && tagProfile?.lostFoundEnabled !== false;
    return (
      <>
        <AmbientBackground />
        <div className="relative flex min-h-screen flex-col">
          <TopNav fallback="/" />
          <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5">
            <Card className={GLASS}>
              <CardContent className="py-8">
                <ProfileCard profile={tagProfile} onReport={canReport ? () => setState('ready') : undefined} />
              </CardContent>
            </Card>
          </main>
        </div>
      </>
    );
  }

  if (state === 'blacklisted') {
    return (
      <>
        <AmbientBackground />
        <div className="relative flex min-h-screen flex-col">
          <TopNav fallback="/" />
          <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 text-center">
            <Card className={GLASS}>
              <CardContent className="flex flex-col items-center gap-2 text-slate-800 dark:text-slate-100">
                <ShieldAlert className="h-6 w-6 text-rose-600" />
                <h1 className="text-2xl font-bold">This tag is no longer active</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  It's been flagged and can't accept new reports or messages. If you found this
                  item, there's no way to reach its owner through this tag right now.
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
              'border-2 border-red-400 dark:border-red-500/50 bg-red-50/60 dark:bg-red-500/10 shadow-[0_0_24px_rgba(239,68,68,0.25)] animate-pulseGlow'
          )}
        >
          <CardContent className="text-slate-800 dark:text-slate-100">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge variant={lost ? 'destructive' : 'secondary'}>
                {lost ? 'Reported lost' : 'Found item'}
              </Badge>
              {lost && item.rewardAmount > 0 && (
                <Badge variant="outline" className="border-amber-200 dark:border-amber-500/30 bg-amber-50/80 dark:bg-amber-500/10 text-amber-600 dark:text-amber-300">
                  ${item.rewardAmount} reward
                </Badge>
              )}
            </div>
            <h1 className="text-2xl font-extrabold text-slate-800 dark:text-slate-100 sm:text-3xl">
              You found {item.itemName}
            </h1>

            {lost && item.lostMessage && (
              <div className="mt-4 rounded-2xl border border-red-200 dark:border-red-500/30 bg-red-50/70 dark:bg-red-500/10 p-4">
                <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-red-600 dark:text-red-300">
                  <MessageSquare className="h-3.5 w-3.5" />
                  Message from the owner
                </p>
                <p className="text-red-700 dark:text-red-200">{item.lostMessage}</p>
              </div>
            )}

            <div className="mt-4 flex items-center gap-2.5 rounded-xl bg-base px-3.5 py-2.5 text-xs text-slate-600 dark:text-slate-300 shadow-neu-pressed-sm">
              <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
              <span>
                Your identity stays private — no app, no account, and no contact info is ever
                exposed to the owner.
              </span>
            </div>
          </CardContent>
        </Card>

        {tagProfile && (
          <LinkPillsCard profile={tagProfile} />
        )}

        {tagProfile?.lostFoundEnabled === false ? (
          <Card className={GLASS}>
            <CardContent className="text-center text-sm text-slate-500 dark:text-slate-400">
              The owner hasn't enabled found-item reporting for this tag.
            </CardContent>
          </Card>
        ) : (
        <Card className={GLASS}>
          <CardContent className="text-slate-800 dark:text-slate-100">
            <form onSubmit={submitReport} className="flex flex-col gap-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Current location</span>
                    <span className="text-xs text-slate-400 dark:text-slate-500">
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

                  <Label htmlFor="location-note" className="mt-1 text-sm font-medium text-slate-600 dark:text-slate-300">
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
                    <Label htmlFor="finder-message" className="text-sm font-medium text-slate-600 dark:text-slate-300">
                      Message to the owner
                    </Label>
                    <span className="text-xs text-slate-400 dark:text-slate-500">Required</span>
                  </div>
                  <Textarea
                    id="finder-message"
                    value={note}
                    maxLength={500}
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
        )}

        <p className="text-center text-xs text-slate-500 dark:text-slate-400">
          Your identity stays private. No app or account needed.
        </p>
        </main>
      </div>
    </>
  );
}
