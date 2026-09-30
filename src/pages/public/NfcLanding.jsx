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
import { isInAppBrowser } from '../../lib/inAppBrowser';
import { chatForTag, forgetChatForTag, getFinderToken, rememberChatForTag } from '../../lib/finderSession';
import { notifyOwner, recordTagScan } from '../../lib/ownerItems';
import { hasVisibleLinks, isAdminManaged, resolveLanding } from '../../lib/tagContent';
import { LinkPills, ProfileCard } from '../../components/TagContent';
import AmbientBackground from '../../components/AmbientBackground';
import TopNav from '../../components/nav/TopNav';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn, formatReward, friendlyFirestoreError } from '@/lib/utils';
import StatusBadge from '@/components/StatusBadge';
import { LoadingState } from '@/components/States';

// Shared frosted-glass treatment applied over the ported ui/Card primitive so
// public pages keep the app's light glassmorphism language.
const GLASS = 'rounded-lg border-2 border-foreground bg-card shadow-card';

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
      <CardContent className="text-foreground">
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
  const [locReason, setLocReason] = useState(null); // why it failed: denied | timeout | unavailable | unsupported
  const [busy, setBusy] = useState(false);
  const [noteError, setNoteError] = useState('');
  // The optional "where is it" block starts folded, so the message and the
  // send button are on screen right away on a phone.
  const [showWhere, setShowWhere] = useState(false);
  // B2: a chat this browser already started from this tag.
  const [savedChatId, setSavedChatId] = useState(null);

  useEffect(() => {
    const id = chatForTag(tagId);
    if (!id) {
      setSavedChatId(null);
      return;
    }
    if (!firebaseReady) {
      setSavedChatId(id);
      return;
    }
    // Only offer it if the chat still exists (released tags delete theirs).
    let live = true;
    getDoc(doc(db, 'chats', id))
      .then((snap) => {
        if (!live) return;
        if (snap.exists()) setSavedChatId(id);
        else {
          forgetChatForTag(tagId);
          setSavedChatId(null);
        }
      })
      .catch(() => live && setSavedChatId(id));
    return () => {
      live = false;
    };
  }, [tagId]);

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
  // resolves { location: null, reason } on failure rather than throwing).
  //
  // The coordinates go only on the report (report.location), which the
  // owner alone can read and markRecovered() clears. They used to be copied
  // into the "Describe the place" field, and from there into the first chat
  // message — which is permanent and readable by anyone with the chat link
  // (SYSTEM_DOCUMENTATION.md §26 G-P1).
  async function handleAttachLocation() {
    setLocStatus('loading');
    setLocReason(null);
    const { location: loc, reason } = await captureLocation();
    if (loc) {
      setLocation(loc);
      setLocStatus('done');
    } else {
      setLocStatus('unavailable');
      setLocReason(reason);
    }
  }

  function removeLocation() {
    setLocation(null);
    setLocStatus('idle');
    setLocReason(null);
  }

  async function submitReport(e) {
    e.preventDefault();
    if (!note.trim()) {
      setNoteError('Write a short message to the owner first, e.g. where you found it.');
      document.getElementById('finder-message')?.focus();
      return;
    }
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
      // The finder's message also opens the thread (UI_UX_IMPROVEMENT_PLAN.md
      // BUG3): it used to live only on the report, so both sides landed on
      // an empty chat and the finder's words seemed lost. Same exact-field
      // shape firestore.rules' messages#create checks for a finder.
      const where = locationNote.trim();
      await addDoc(collection(db, 'chats', chat.id, 'messages'), {
        sender: 'finder',
        text: where ? `${note.trim()}\n\nWhere: ${where}` : note.trim(),
        timestamp: serverTimestamp(),
        finderSessionToken,
      }).catch((err) => console.warn('first chat message failed:', err));
      // Best-effort: the report itself already succeeded above, so a failure
      // here shouldn't block the finder's flow — just surfaced for debugging
      // rather than silently swallowed.
      notifyOwner({ type: 'report', tagId, chatId: chat.id, reportId: report.id }).catch((err) =>
        console.warn('notifyOwner failed:', err)
      );
      rememberChatForTag(tagId, chat.id);
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

  // FIND5: a stranger's first impression after a tap — branded, not a bare spinner.
  if (state === 'loading') {
    return <LoadingState variant="page" label="Opening this TagBack tag…" />;
  }

  if (state === 'notfound') {
    return (
      <>
        <AmbientBackground />
        <div className="relative flex min-h-screen flex-col">
          <TopNav fallback="/" historyOnly />
          <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 text-center">
            <Card className={GLASS}>
              <CardContent className="flex flex-col items-center gap-3 text-foreground">
                <h1 className="text-2xl font-bold">Tag not recognized</h1>
                <p className="text-muted-foreground">
                  This tag isn't registered yet, or the link is incomplete. Try tapping the sticker again, holding
                  your phone still for a second.
                </p>
                {/* FIND6: never a dead end. */}
                <Button asChild variant="secondary">
                  <Link to="/">What is TagBack?</Link>
                </Button>
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
          <TopNav fallback="/" historyOnly />
          <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 text-center">
            <Card className={GLASS}>
              <CardContent className="flex flex-col items-center gap-3 text-foreground">
                <TagIcon className="h-6 w-6 text-primary" />
                <h1 className="text-2xl font-bold">This tag isn't claimed yet</h1>
                <p className="text-sm text-muted-foreground">
                  {user
                    ? 'Claim it now to link it to your account.'
                    : 'Sign in to claim this tag and link it to your account.'}
                </p>
                {user ? (
                  <Button
                    variant="primary"
                    className="mt-1 w-full gap-2"
                    onClick={() => nav(claimPath)}
                  >
                    Claim this tag <ArrowRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button asChild variant="primary" className="mt-1 w-full">
                    <Link
                      to="/login"
                      state={{ from: { pathname: '/dashboard/items/claim', search: `?tagId=${encodeURIComponent(tagId)}` } }}
                    >
                      Sign in to claim <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                )}
                {!user && (
                  <p className="text-sm text-muted-foreground">
                    No account?{' '}
                    <Link to="/register" className="font-semibold text-primary hover:underline">
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
      <div className="flex h-screen flex-col items-center justify-center gap-3 px-5 text-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <p className="text-sm">Opening link…</p>
        <a
          href={tagProfile?.redirectUrl}
          className="inline-flex items-center gap-1 break-all text-xs font-semibold text-primary hover:text-primary"
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
          <TopNav fallback="/" historyOnly />
          <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 text-center">
            <Card className={GLASS}>
              <CardContent className="flex flex-col items-center gap-3 text-foreground">
                <ExternalLink className="h-6 w-6 text-primary" />
                <h1 className="text-xl font-bold">You're leaving TagBack</h1>
                <p className="text-sm text-muted-foreground">
                  This tag's owner links to <span className="font-semibold text-foreground">{host}</span>.
                  Only continue if you trust it.
                </p>
                <p className="break-all text-xs text-muted-foreground">{tagProfile?.redirectUrl}</p>
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
          <TopNav fallback="/" historyOnly />
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
          <TopNav fallback="/" historyOnly />
          <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 text-center">
            <Card className={GLASS}>
              <CardContent className="flex flex-col items-center gap-2 text-foreground">
                <ShieldAlert className="h-6 w-6 text-foreground" />
                <h1 className="text-2xl font-bold">This tag is no longer active</h1>
                <p className="text-sm text-muted-foreground">
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
  const reportingOff = tagProfile?.lostFoundEnabled === false;
  const whereOpen = showWhere || locStatus !== 'idle' || !!locationNote;

  const locationStatusText =
    locStatus === 'done'
      ? `Location added, accurate to about ${Math.round(location?.accuracy ?? 0)} m.`
      : locStatus === 'unavailable'
        ? locReason === 'denied'
          ? isInAppBrowser()
            ? "Location is blocked in this app's browser. Describe the place instead, or open this page in Chrome."
            : 'Location permission is off. Describe the place instead.'
          : locReason === 'timeout'
            ? "Couldn't get a location fix in time (common indoors). Try again, or describe the place."
            : locReason === 'unsupported'
              ? "This browser can't share location. Describe the place instead."
              : "Couldn't get your location. Check that location is on, or describe the place."
        : 'Only the owner sees it, rounded to about 10 m. It is removed from the report when the item is marked returned.';

  return (
    <>
      <AmbientBackground />
      <div className="relative flex min-h-screen flex-col">
        <TopNav fallback="/" historyOnly />
        <main className="relative mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-5 sm:justify-center sm:px-6 sm:py-6">
        {/* Found item → understand → contact owner → optionally share location. */}
        <Card
          className={cn(
            GLASS,
            lost && 'border-2 border-foreground bg-destructive-soft'
          )}
        >
          <CardContent className="text-foreground">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-primary">
              <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
              You found a TagBack item
            </p>
            <h1 className="mt-1 break-words font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {item.itemName}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {lost ? <StatusBadge state="lost" label="Reported lost by its owner" /> : <StatusBadge state="safe" label="Belongs to a TagBack user" />}
              {lost && item.rewardAmount > 0 && (
                <StatusBadge state="review" label={`Reward ${formatReward(item.rewardAmount)}`} />
              )}
            </div>

            {lost && item.lostMessage && (
              <div className="mt-4 rounded-lg border border-foreground bg-destructive-soft p-4">
                <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                  Message from the owner
                </p>
                <p className="whitespace-pre-wrap break-words text-foreground">{item.lostMessage}</p>
              </div>
            )}

            {!reportingOff && (
              <p className="mt-4 text-sm text-foreground">
                Send the owner a message below. You don't need an app or an account.
              </p>
            )}
          </CardContent>
        </Card>

        {savedChatId && (
          <Card className={cn(GLASS, 'border border-foreground')}>
            <CardContent className="flex flex-col gap-3 text-foreground">
              <div>
                <p className="font-semibold">You already messaged this owner</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Your conversation is saved in this browser. On another browser or device, open the chat link you
                  saved instead.
                </p>
              </div>
              <Button asChild variant="primary" size="lg" className="w-full gap-2">
                <Link to={`/chat/${savedChatId}`}>
                  <MessageSquare className="h-4 w-4" /> Continue your conversation
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {reportingOff ? (
          <Card className={GLASS}>
            <CardContent className="text-center text-sm text-muted-foreground">
              The owner has turned off found-item messages for this tag.
              {hasVisibleLinks(tagProfile) && ' You can use one of their links below instead.'}
            </CardContent>
          </Card>
        ) : (
        <Card className={GLASS}>
          <CardContent className="text-foreground">
            <form onSubmit={submitReport} noValidate className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="finder-message" className="text-base font-semibold text-foreground">
                    {savedChatId ? 'Or send a new message' : 'Message the owner'}
                  </Label>
                  <span className="text-xs text-muted-foreground" aria-hidden="true">{note.length}/500</span>
                </div>
                <Textarea
                  id="finder-message"
                  value={note}
                  maxLength={500}
                  onChange={(e) => {
                    setNote(e.target.value);
                    if (noteError) setNoteError('');
                  }}
                  rows={3}
                  placeholder="e.g. I found it on a bench at the park. I can leave it at the guard house."
                  aria-describedby={noteError ? 'finder-message-error finder-message-hint' : 'finder-message-hint'}
                  aria-invalid={noteError ? true : undefined}
                />
                {noteError && (
                  <p id="finder-message-error" role="alert" className="text-sm text-foreground">
                    {noteError}
                  </p>
                )}
                <p id="finder-message-hint" className="text-xs text-muted-foreground">
                  This starts a private chat with the owner. You'll see their reply on the next page.
                </p>
              </div>

              {!whereOpen ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowWhere(true)}
                  className="justify-start gap-2"
                  aria-expanded="false"
                >
                  <MapPin className="h-4 w-4" /> Add where it is (optional)
                </Button>
              ) : (
                <fieldset className="flex flex-col gap-3 rounded-lg border-2 border-foreground bg-muted p-4">
                  <legend className="sr-only">Where the item is (optional)</legend>
                  <p className="flex items-center justify-between text-sm font-semibold text-foreground">
                    <span className="flex items-center gap-1.5">
                      <MapPin className="h-4 w-4" aria-hidden="true" /> Where is it now?
                    </span>
                    <span className="text-xs font-normal text-muted-foreground">Optional</span>
                  </p>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="location-note" className="text-xs font-medium text-muted-foreground">
                      Describe the place
                    </Label>
                    <Input
                      id="location-note"
                      value={locationNote}
                      maxLength={200}
                      onChange={(e) => setLocationNote(e.target.value)}
                      placeholder="e.g. Guard house at the main gate"
                      aria-describedby="location-note-hint"
                    />
                    <p id="location-note-hint" className="text-xs text-muted-foreground">
                      Sent to the owner as part of your message.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleAttachLocation}
                      loading={locStatus === 'loading'}
                      className="justify-start gap-2"
                    >
                      {locStatus !== 'loading' && <LocateFixed className="h-4 w-4" />}
                      {locStatus === 'done'
                        ? 'Update my location'
                        : locStatus === 'loading'
                          ? 'Getting your location…'
                          : 'Share my current location'}
                    </Button>
                    {locStatus === 'done' && (
                      <Button type="button" variant="ghost" size="sm" className="min-h-11" onClick={removeLocation}>
                        Remove location
                      </Button>
                    )}
                  </div>
                  <p
                    className={cn('text-xs', locStatus === 'done' ? 'text-foreground' : 'text-muted-foreground')}
                    aria-live="polite"
                  >
                    {locStatus === 'loading' ? 'This can take up to 25 seconds.' : locationStatusText}
                  </p>
                </fieldset>
              )}

              <Button
                type="submit"
                loading={busy}
                variant={savedChatId ? 'secondary' : lost ? 'destructive' : 'primary'}
                size="lg"
                className="w-full gap-2"
              >
                {busy ? (
                  'Sending…'
                ) : (
                  <>
                    Send message to owner <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
        )}

        {tagProfile && <LinkPillsCard profile={tagProfile} />}

        {/* Privacy, in plain words — only what the system really does. */}
        <section aria-labelledby="finder-privacy" className="px-2 text-sm">
          <h2 id="finder-privacy" className="mb-2 flex items-center gap-1.5 font-semibold text-foreground">
            <ShieldCheck className="h-4 w-4 text-foreground" aria-hidden="true" /> Your privacy
          </h2>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>No app or account needed.</li>
            <li>You message the owner through TagBack. Neither of you sees the other's phone number or email.</li>
            <li>Sharing your location is optional.</li>
            <li>Don't put your phone number, address or other personal details in messages unless you want the owner to have them.</li>
          </ul>
          <p className="mt-2 text-xs">
            <Link to="/privacy" className="inline-flex min-h-11 items-center font-medium text-primary underline-offset-2 hover:underline">
              What TagBack stores
            </Link>
          </p>
        </section>

        </main>
      </div>
    </>
  );
}
