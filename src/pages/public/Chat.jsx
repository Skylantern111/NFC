import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertCircle, ArrowDown, Ban, Check, CheckCircle2, Clock, Copy, Eye, Link2, Lock, MapPin, MessagesSquare, RefreshCw, Send, ShieldCheck } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { toast } from 'sonner';
import {
  useChat,
  useChatMessages,
  getPublicItem,
  markChatRead,
  markRecovered,
  reportChat,
  reportChatAsFinder,
  sendChatMessage,
  useOwnerTagIds,
} from '../../lib/ownerItems';
import { hasReportFrom } from '../../lib/moderation';
import { getFinderToken } from '../../lib/finderSession';
import { checkIsAdmin } from '../../lib/adminAuth';
import { isInAppBrowser } from '../../lib/inAppBrowser';
import { db, firebaseReady } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import AmbientBackground from '../../components/AmbientBackground';
import BackButton from '../../components/BackButton';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn, friendlyFirestoreError, relativeTimeFromMs, returnFocusTo, toMillis } from '@/lib/utils';
import { LoadingState } from '@/components/States';
import StatusStepper, { recoveryStep } from '@/components/StatusStepper';
import { setPageTitle } from '@/lib/pageTitle';

// Leaflet is heavy and only the owner's report card needs it — keep it out
// of this eagerly-loaded public page's bundle.
const ReportLocationMap = lazy(() => import('../../components/ReportLocationMap'));

// Shared frosted-glass treatment applied over the ported ui/ primitives so
// this page keeps the app's light glassmorphism language.
const GLASS = 'rounded-lg border-2 border-foreground bg-card shadow-card';

// Canned strings only — purely a UX convenience that inserts text into the
// real message input. Different for each side (UI_UX_IMPROVEMENT_PLAN.md CHAT5).
const QUICK_REPLIES = {
  owner: ['Thank you so much!', 'Where can I pick it up?', "I'm on my way", 'Can you leave it at a guard house?'],
  finder: ['I have your item', 'I left it at the front desk', "I'm here now", 'When can you pick it up?'],
};

// "Today" / "Yesterday" / a date — separators between days (CHAT4).
function dayLabel(ms) {
  const d = new Date(ms);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}
function timeLabel(ms) {
  return new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
const scrollBehavior = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

function readTabRole(key) {
  try {
    const value = sessionStorage.getItem(key);
    return value === 'owner' || value === 'finder' ? value : null;
  } catch {
    return null;
  }
}
function writeTabRole(key, role) {
  try {
    sessionStorage.setItem(key, role);
  } catch {
    // Storage blocked: the tab falls back to owner-first.
  }
}

// Anonymous two-way chat. The owner is identified by Firebase Auth; the finder
// by their localStorage session token. Neither party sees the other's PII.
// Preview-mode placeholder when no real Firebase project is configured —
// NfcLanding.jsx routes here as `/chat/preview-:tagId` in that case, since
// there's no Firestore chat doc to read.
function previewItem(tagId) {
  return { tagId, itemName: 'Preview item', isLostMode: true, lostMessage: '', rewardAmount: 0 };
}

export default function Chat() {
  const { chatId } = useParams();
  const { user, loading: authLoading } = useAuth();

  // An admin clicking "View chat" from Moderation.jsx lands here signed in
  // but not owning the tag — without this check they'd fall into the
  // 'owner' branch below (mislabeled bubbles, a composer/Report/Mark-
  // recovered UI that only fails silently via firestore.rules#ownsTag).
  // Same two-path admin check as admin/AdminLayout.jsx's AdminGate.
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [adminChecked, setAdminChecked] = useState(false);
  useEffect(() => {
    if (!firebaseReady || !user) {
      setIsAdminUser(false);
      setAdminChecked(true);
      return;
    }
    let cancelled = false;
    setAdminChecked(false);
    checkIsAdmin(user).then((result) => {
      if (cancelled) return;
      setIsAdminUser(result);
      setAdminChecked(true);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const previewTagId = !firebaseReady && chatId?.startsWith('preview-') ? chatId.slice(8) : null;

  const { chat: liveChat, loading: chatLoading, error: chatError, retry: retryChat } = useChat(firebaseReady ? chatId : null);
  // SYSTEM_AUDIT_PLAN.md B1: signed in != owner. A TagBack user who finds
  // someone ELSE's item is the finder in that chat; treating every signed-in
  // viewer as the owner showed them owner buttons and got their messages
  // rejected by firestore.rules. Owner = this chat's tag is one of theirs.
  const { tagIds: ownTagIds, loaded: ownTagsLoaded } = useOwnerTagIds(user);
  const {
    messages: liveMessages,
    error: messagesError,
    retry: retryMessages,
  } = useChatMessages(firebaseReady ? chatId : null);
  const [mockChat, setMockChat] = useState(() => (previewTagId ? { id: chatId, tagId: previewTagId } : null));
  const [mockMessages, setMockMessages] = useState([]);
  const [item, setItem] = useState(previewTagId ? previewItem(previewTagId) : null);
  const [text, setText] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [blockReason, setBlockReason] = useState('');
  const [blocking, setBlocking] = useState(false);
  // Sends that the server rejected, shown as "Not sent — Retry" (CHAT2).
  const [failed, setFailed] = useState([]);
  const [report, setReport] = useState(null);
  // tags/{tagId}.status (public) — a blacklisted tag refuses finder messages
  // in the rules, so say so instead of letting every send fail.
  const [tagStatus, setTagStatus] = useState(null);
  const composerRef = useRef(null);
  const endRef = useRef(null);
  const scrollRef = useRef(null);
  const [atBottom, setAtBottom] = useState(true);
  const atBottomRef = useRef(true);

  const chat = firebaseReady ? liveChat : mockChat;
  const messages = firebaseReady ? liveMessages : mockMessages;
  const loading = firebaseReady ? chatLoading : false;

  const ownsChat = !!user && !!chat?.tagId && ownTagIds.includes(chat.tagId);
  // UI_UX_IMPROVEMENT_PLAN.md BUG4: the finder is whoever holds this chat's
  // token, which lives in the browser that filed the report. Anyone else —
  // the finder on another browser (e.g. Messenger's in-app one), or a
  // signed-out owner — is a read-only 'viewer' instead of a "finder" whose
  // every send the rules reject.
  const holdsFinderToken = !firebaseReady || (!!chat?.finderSessionToken && chat.finderSessionToken === getFinderToken());
  // One browser can hold both sides of a chat: the finder token from filing
  // the report, and a sign-in as the tag's owner. The sign-in is shared by
  // every tab, so the owner signing in (to reply from the dashboard) turned
  // the finder's open tab into the owner's view: the finder's own messages
  // moved to the left and new ones were sent as the owner. Each tab keeps
  // the side it was opened as instead (sessionStorage is per tab); a new
  // tab with both still opens as the owner.
  const roleKey = `tagback_chat_role_${chatId}`;
  const pinnedRole = ownsChat && holdsFinderToken ? readTabRole(roleKey) : null;
  const role =
    isAdminUser && !ownsChat
      ? 'admin'
      : pinnedRole || (ownsChat ? 'owner' : holdsFinderToken ? 'finder' : 'viewer');
  const finderBlocked = role === 'finder' && tagStatus === 'blacklisted';
  const canWrite = role === 'owner' || (role === 'finder' && !finderBlocked);
  // Until the chat and the admin/owner checks load, `role` may still flip —
  // don't act on it (e.g. mark the wrong side read) before then.
  const roleReady = !firebaseReady || (!!chat && !authLoading && (!user || (adminChecked && ownTagsLoaded)));
  useEffect(() => {
    if (firebaseReady && roleReady && (role === 'owner' || role === 'finder')) writeTabRole(roleKey, role);
  }, [roleKey, role, roleReady]);
  const listenerError = chatError || messagesError;

  const finderTipKey = `tagback_finder_tip_hidden_${chatId}`;
  const [finderTipHidden, setFinderTipHidden] = useState(() => {
    try {
      return localStorage.getItem(finderTipKey) === '1';
    } catch {
      return false;
    }
  });
  function hideFinderTip() {
    setFinderTipHidden(true);
    try {
      localStorage.setItem(finderTipKey, '1');
    } catch {
      // Storage blocked: hidden for this visit only.
    }
  }
  async function copyChatLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success('Link copied.');
    } catch {
      toast.error('Could not copy. Copy the address from the browser bar instead.');
    }
  }
  function retryListeners() {
    retryChat();
    retryMessages();
  }

  useEffect(() => {
    if (!firebaseReady || !chat?.tagId) return;
    let live = true;
    getPublicItem(chat.tagId).then((data) => {
      if (live) setItem(data);
    });
    return () => {
      live = false;
    };
  }, [chat?.tagId]);

  useEffect(() => {
    if (!firebaseReady || !chat?.tagId) return;
    let live = true;
    getDoc(doc(db, 'tags', chat.tagId))
      .then((snap) => live && setTagStatus(snap.exists() ? snap.data().status : null))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [chat?.tagId]);

  useEffect(() => {
    setPageTitle(item?.itemName ? `Chat · ${item.itemName}` : 'Chat');
    return () => setPageTitle('');
  }, [item?.itemName]);

  // CHAT6: the owner sees the finder's report (where, when, map) pinned at
  // the top. Only the owner may read reports (firestore.rules).
  useEffect(() => {
    if (!firebaseReady || role !== 'owner' || !chat?.reportId) return;
    let live = true;
    getDoc(doc(db, 'reports', chat.reportId))
      .then((snap) => {
        if (live && snap.exists()) setReport(snap.data());
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [role, chat?.reportId]);

  useEffect(() => {
    atBottomRef.current = atBottom;
  }, [atBottom]);

  // Only auto-scroll to a new message if the reader was already at the
  // bottom — otherwise it yanks someone away from history they're reading.
  useEffect(() => {
    if (atBottomRef.current) endRef.current?.scrollIntoView({ behavior: scrollBehavior() });
  }, [messages, failed]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  }

  function scrollToBottom() {
    endRef.current?.scrollIntoView({ behavior: scrollBehavior() });
    setAtBottom(true);
  }

  // Opening the thread counts as reading it — clears the unread marker for
  // whichever side is viewing (drives the dot in dashboard/Messages.jsx).
  useEffect(() => {
    if (!chatId || !firebaseReady || !roleReady || !canWrite) return;
    markChatRead(chatId, role).catch(() => {});
  }, [chatId, role, roleReady]);

  // CHAT2: the input clears at once and the message shows as "Sending…"
  // from Firestore's local copy until the server confirms it. Offline, it
  // waits and sends on reconnect. If the server refuses it (e.g. a banned
  // finder token), it comes back as a "Not sent — Retry" bubble instead of
  // vanishing.
  function deliver(body) {
    sendChatMessage(chatId, role, body, role === 'finder' ? getFinderToken() : undefined, chat).catch((err) => {
      const reason =
        err.code === 'permission-denied'
          ? "This device can't send messages in this chat."
          : friendlyFirestoreError(err, 'Could not send.');
      setFailed((f) => [...f, { id: `failed_${Date.now()}`, text: body, reason }]);
    });
  }

  function send(e) {
    e.preventDefault();
    if (!text.trim() || !roleReady || !canWrite) return;
    const body = text.trim();
    setText('');
    if (composerRef.current) composerRef.current.style.height = '';
    setAtBottom(true);
    atBottomRef.current = true;
    if (firebaseReady) {
      deliver(body);
    } else {
      setMockMessages((m) => [...m, { id: `mock_${Date.now()}`, sender: role, text: body }]);
    }
  }

  function retryFailed(f) {
    setFailed((list) => list.filter((x) => x.id !== f.id));
    deliver(f.text);
  }

  // CHAT8: grow with the text up to ~4 lines; Enter sends on a keyboard,
  // but makes a new line on a phone.
  function onComposerChange(e) {
    setText(e.target.value);
    const el = e.target;
    el.style.height = '';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }
  function onComposerKeyDown(e) {
    const hasKeyboard = window.matchMedia?.('(pointer: fine)').matches;
    if (e.key === 'Enter' && !e.shiftKey && hasKeyboard && !e.nativeEvent.isComposing) send(e);
  }

  // Real, state-changing action: clears the item's Lost Mode. Owner-only.
  async function confirmRecovered() {
    if (!chat) return;
    setResolving(true);
    try {
      if (firebaseReady) {
        await markRecovered(chat.tagId, chatId, chat.reportId);
      } else {
        setItem((it) => ({ ...it, isLostMode: false }));
        setMockChat((c) => ({ ...c, resolved: true }));
      }
      setConfirmOpen(false);
      toast.success('Marked as recovered. Lost Mode is off.');
    } catch (err) {
      toast.error(friendlyFirestoreError(err, 'Could not update recovery status. Try again.'));
    } finally {
      setResolving(false);
    }
  }

  // Report/Block affordance, either direction: flags this chat for the admin
  // moderation queue. Doesn't block the other party by itself — for an
  // owner reporting a finder, that only happens once an admin actually bans
  // the finder's session token; for a finder reporting an owner, admin
  // review means looking up and possibly disabling the owner's account via
  // admin/Owners.jsx (see admin/Moderation.jsx's blockedBy handling) — this
  // just gets it in front of a human either way.
  async function confirmBlock(e) {
    e.preventDefault();
    setBlocking(true);
    try {
      if (firebaseReady) {
        if (role === 'finder') {
          await reportChatAsFinder(chatId, blockReason.trim());
        } else {
          await reportChat(chatId, blockReason.trim());
        }
      } else {
        setMockChat((c) => ({
          ...c,
          blocked: true,
          [role === 'finder' ? 'reportedByFinder' : 'reportedByOwner']: { reason: blockReason.trim(), at: null },
        }));
      }
      setBlockOpen(false);
      toast.success('Chat reported for review.');
    } catch (err) {
      toast.error(friendlyFirestoreError(err, 'Could not report this chat. Try again.'));
    } finally {
      setBlocking(false);
    }
  }

  const resolved = !!chat?.resolved;
  // Messages + failed sends, with a day separator whenever the day changes
  // and a sender label at the start of each run (CHAT3/CHAT4).
  const thread = useMemo(() => {
    const out = [];
    let lastDay = null;
    let lastSender = null;
    const all = [...messages, ...failed.map((f) => ({ ...f, sender: role, failed: true }))];
    for (const m of all) {
      const ms = toMillis(m.timestamp) || (m.failed ? Date.now() : null);
      const day = ms ? new Date(ms).toDateString() : lastDay;
      if (day && day !== lastDay) {
        out.push({ kind: 'day', key: `day_${day}`, label: dayLabel(ms) });
        lastDay = day;
        lastSender = null;
      }
      out.push({ kind: 'message', message: m, ms, firstInRun: m.sender !== lastSender });
      lastSender = m.sender;
    }
    return out;
  }, [messages, failed, role]);

  // Before the role is known, show the composer disabled ("Connecting…")
  // rather than letting a Send do nothing (UI_UX_IMPROVEMENT_PLAN.md BUG5).
  const showComposer = roleReady ? canWrite : true;
  const inAppBrowser = isInAppBrowser();
  // Why there's no message box, said where the box would be.
  const readOnlyReason =
    !roleReady || canWrite
      ? null
      : role === 'admin'
        ? 'Admins can read reported chats but not reply.'
        : finderBlocked
          ? 'TagBack deactivated this tag, so new messages can’t be sent.'
          : 'Replies only work for the item’s owner, or in the browser the report was sent from.';
  const lastMessage = messages[messages.length - 1];
  const waitingForReply =
    roleReady && canWrite && failed.length === 0 && lastMessage?.sender === role && !lastMessage.pending;

  // A chat link that points nowhere (mistyped, or deleted on release).
  if (firebaseReady && !loading && !chat && !listenerError) {
    return (
      <div className="relative flex h-[100dvh] flex-col items-center justify-center gap-3 px-6 text-center">
        <AmbientBackground />
        <MessagesSquare className="h-8 w-8 text-muted-foreground" />
        <h1 className="text-lg font-bold text-foreground">This conversation isn't available</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          The link may be incomplete, or the item's owner released the tag.
        </p>
        <Button asChild variant="secondary">
          <Link to={user ? '/dashboard/messages' : '/'}>{user ? 'Go to Messages' : 'Go to TagBack'}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="relative flex h-[100dvh] flex-col">
      <AmbientBackground />
      {/* UI_UX_IMPROVEMENT_PLAN.md BUG7: one compact row that fits a 320 px
          phone — back, item, status, and an icon-only Report. "Mark as
          recovered" moved to the bar above the composer. */}
      <header className={cn(GLASS, 'mx-3 mt-3 flex items-center gap-2 px-2 py-2')}>
        <BackButton
          fallback={role === 'owner' ? '/dashboard/messages' : '/'}
          label=""
          className="h-11 w-11 shrink-0 justify-center"
        />
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-bold text-foreground">{item?.itemName || 'Anonymous chat'}</h1>
          <p className="truncate text-xs text-muted-foreground">
            {role === 'admin'
              ? 'Admin view · read-only'
              : role === 'owner'
                ? 'Chat with the finder · contact details hidden'
                : role === 'finder'
                  ? 'Chat with the owner · contact details hidden'
                  : 'Read-only conversation'}
          </p>
        </div>
        {resolved && (
          <span className="flex shrink-0 items-center gap-1 rounded-full border border-foreground bg-success-soft px-2.5 py-1 text-xs font-semibold text-foreground">
            <CheckCircle2 className="h-3.5 w-3.5" /> Recovered
          </span>
        )}
        {role === 'finder' && finderTipHidden && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={copyChatLink}
            aria-label="Copy this chat's link"
            title="Copy this chat's link"
            className="h-11 w-11 shrink-0"
          >
            <Link2 className="h-4 w-4" />
          </Button>
        )}
        {role === 'admin' && (
          <span className="flex shrink-0 items-center gap-1 rounded-full border border-foreground bg-base px-2.5 py-1 text-xs font-semibold text-muted-foreground">
            <Eye className="h-3.5 w-3.5" /> Admin
          </span>
        )}
        {/* Either side can report the chat (MAIN_FUNCTIONS_IMPROVEMENT_PLAN.md
            §5.1); "Mark as recovered" stays owner-only. */}
        {canWrite &&
          (hasReportFrom(chat, role) ? (
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center text-foreground"
              title="You reported this chat"
            >
              <Ban className="h-4 w-4" />
              <span className="sr-only">You reported this chat</span>
            </span>
          ) : (
            <Button
              id="chat-report-button"
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setBlockOpen(true)}
              aria-label={role === 'finder' ? 'Report the owner' : 'Report this finder'}
              title={role === 'finder' ? 'Report the owner' : 'Report this finder'}
              className="h-11 w-11 shrink-0"
            >
              <Ban className="h-4 w-4" />
            </Button>
          ))}
      </header>

      {listenerError && (
        <div
          role="alert"
          className="mx-3 mt-2 flex items-center justify-between gap-3 rounded-lg border border-foreground bg-warning-soft px-4 py-2.5 text-sm text-foreground"
        >
          <span>Connection problem — new messages may not show.</span>
          <Button type="button" size="sm" variant="outline" onClick={retryListeners} className="shrink-0 gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </Button>
        </div>
      )}

      <div className="relative flex-1 overflow-hidden">
        <div ref={scrollRef} onScroll={handleScroll} className="h-full space-y-2 overflow-y-auto px-4 py-4">
          {loading && <LoadingState variant="inline" label="Loading conversation…" className="py-6" />}

          {/* Notices scroll with the thread, so on a short (landscape) screen
              they don't squeeze the messages out of view. */}
          {roleReady && role === 'viewer' && (
            <div
              role="status"
              className="mx-auto mb-2 max-w-xl space-y-2 rounded-lg border border-foreground bg-info-soft px-4 py-3 text-sm text-foreground"
            >
              <p className="font-semibold">You can read this chat, but not reply from here.</p>
              <p>
                {user
                  ? 'This chat belongs to a different account or device.'
                  : "Replies only work in the browser you used to report the item. If you're the owner, sign in."}
                {inAppBrowser && ' You opened this link inside another app — open it in Chrome instead (⋯ menu → Open in browser).'}
              </p>
              {!user && (
                <Button asChild size="sm" variant="primary">
                  <Link to="/login" state={{ from: { pathname: `/chat/${chatId}` } }}>
                    Sign in as owner
                  </Link>
                </Button>
              )}
            </div>
          )}

          {/* FIND7 / BUG4: a finder has no account — this link, in this browser,
              is the only way back to the owner's replies. */}
          {roleReady && role === 'finder' && !finderTipHidden && (
            <div
              role="status"
              className="mx-auto mb-2 max-w-xl space-y-2 rounded-lg border border-foreground bg-success-soft px-4 py-3 text-sm text-foreground"
            >
              <p>
                <span className="font-semibold">The owner has been notified.</span> Their reply shows up on this page.
              </p>
              <p>
                <span className="font-semibold">Keep this link to come back.</span> Bookmark it or copy it, and open it{' '}
                <span className="font-semibold">in this same browser</span> to reply. From another browser or device, or
                after clearing this browser's data, you can read the chat but not reply. Anyone with the link can read it,
                so don't share it.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={copyChatLink} className="gap-1.5">
                  <Copy className="h-3.5 w-3.5" /> Copy link
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={hideFinderTip}>
                  Got it
                </Button>
              </div>
            </div>
          )}

          {resolved && canWrite && (
            <p className="mx-auto mb-2 max-w-xl rounded-lg border border-foreground bg-success-soft px-4 py-2.5 text-sm text-foreground">
              Marked as recovered. You can still message here to finish the handoff.
            </p>
          )}


          {role === 'owner' && report && (
            <div className="mx-auto mb-2 max-w-md space-y-3 rounded-lg border-2 border-foreground bg-card p-4 text-sm shadow-card">
              <p className="font-semibold text-foreground">
                Finder's report · {relativeTimeFromMs(toMillis(report.timestamp)) || 'just now'}
              </p>
              <StatusStepper step={recoveryStep({ chat, hasReport: true })} />
              {report.locationNote && (
                <p className="flex items-start gap-1.5 text-foreground">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {report.locationNote}
                </p>
              )}
              {report.location && (
                <Suspense fallback={<LoadingState variant="inline" label="Loading map…" />}>
                  <ReportLocationMap location={report.location} />
                </Suspense>
              )}
            </div>
          )}

          {!loading && messages.length === 0 && failed.length === 0 && (
            <div className="flex min-h-32 flex-col items-center justify-center gap-2 py-6 text-center text-muted-foreground">
              <MessagesSquare className="h-6 w-6" aria-hidden="true" />
              <p className="text-sm">No messages yet. Say hello to get started.</p>
            </div>
          )}

          <ol className="space-y-1.5" aria-label="Messages" aria-live="polite" aria-relevant="additions">
            {thread.map((entry) => {
              if (entry.kind === 'day') {
                return (
                  <li key={entry.key} className="py-2 text-center text-xs font-semibold text-muted-foreground">
                    {entry.label}
                  </li>
                );
              }
              const m = entry.message;
              // CHAT3: "mine" on the right in brand color, the other side on
              // the left — whichever role you are.
              const mine = m.sender === role;
              const who = m.sender === 'owner' ? 'Owner' : 'Finder';
              return (
                <li key={m.id} className={cn('flex flex-col', mine ? 'items-end' : 'items-start', entry.firstInRun && 'pt-2')}>
                  {entry.firstInRun && !mine && (
                    <span className="mb-0.5 px-1 text-xs font-semibold text-muted-foreground">{who}</span>
                  )}
                  <div
                    className={cn(
                      'max-w-[80%] whitespace-pre-wrap break-words rounded-lg border-2 border-foreground px-4 py-2.5 text-sm shadow-brut-sm',
                      mine
                        ? 'rounded-br-md bg-primary text-primary-foreground'
                        : 'rounded-bl-md bg-card text-foreground',
                      m.failed && 'bg-destructive-soft text-foreground'
                    )}
                  >
                    <span className="sr-only">{mine ? 'You' : who}: </span>
                    {m.text}
                  </div>
                  <span className="mt-0.5 flex items-center gap-1 px-1 text-xs text-muted-foreground">
                    {m.failed ? (
                      <>
                        <AlertCircle className="h-3.5 w-3.5 text-foreground" aria-hidden="true" />
                        <span className="text-foreground">Not sent. {m.reason}</span>
                        <button
                          type="button"
                          onClick={() => retryFailed(m)}
                          className="min-h-8 px-1 font-semibold text-primary underline-offset-2 hover:underline"
                        >
                          Retry
                        </button>
                      </>
                    ) : m.pending ? (
                      <>
                        <Clock className="h-3.5 w-3.5" aria-hidden="true" /> Sending…
                      </>
                    ) : (
                      <>
                        {entry.ms ? timeLabel(entry.ms) : ''}
                        {mine && (
                          <>
                            <Check className="h-3.5 w-3.5" aria-hidden="true" />
                            <span className="sr-only">Sent</span>
                          </>
                        )}
                      </>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
          {waitingForReply && (
            <p className="pt-2 text-center text-xs text-muted-foreground">
              {role === 'finder' ? 'Waiting for the owner to reply.' : 'Waiting for the finder to reply.'}
            </p>
          )}
          <div ref={endRef} />
        </div>
        {!atBottom && (
          <button
            type="button"
            onClick={scrollToBottom}
            aria-label="Scroll to latest message"
            className="absolute bottom-3 right-3 flex h-10 w-10 items-center justify-center rounded-full border-2 border-foreground bg-card text-foreground shadow-brut-sm transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-brut active:translate-x-0 active:translate-y-0 active:shadow-none"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
        )}
      </div>

      {readOnlyReason && (
        <div
          role="status"
          className={cn(GLASS, 'mx-3 mb-[max(0.75rem,env(safe-area-inset-bottom))] flex items-start gap-2.5 px-4 py-3 text-sm')}
        >
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <p className="text-foreground">
            <span className="font-semibold">This conversation is read-only.</span> {readOnlyReason}
          </p>
        </div>
      )}

      {showComposer && (
        <>
          {role === 'owner' && !resolved && (
            <div className="mx-3 mb-2 flex items-center justify-between gap-3 rounded-lg border-2 border-foreground bg-card px-4 py-2 text-sm [@media(max-height:500px)]:py-1 text-foreground">
              <span>Got your item back?</span>
              <Button
                type="button"
                size="sm"
                variant="success"
                onClick={() => setConfirmOpen(true)}
                className="shrink-0 gap-1.5"
              >
                <CheckCircle2 className="h-4 w-4" /> Mark as recovered
              </Button>
            </div>
          )}
          <div className="relative mx-3 mb-2 [@media(max-height:500px)]:hidden">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {(QUICK_REPLIES[role] || QUICK_REPLIES.finder).map((reply) => (
                <button
                  key={reply}
                  type="button"
                  onClick={() => setText(reply)}
                  disabled={!roleReady}
                  className="min-h-11 shrink-0 rounded-md border-2 border-foreground bg-card px-3.5 text-sm font-bold text-foreground shadow-brut-sm transition-all hover:bg-muted active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-50"
                >
                  {reply}
                </button>
              ))}
            </div>
            {/* Fade hint that the row scrolls horizontally past the visible edge. */}
            <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent" />
          </div>

          <p className="mx-4 mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground [@media(max-height:500px)]:hidden">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-foreground" aria-hidden="true" />
            Contact details stay hidden. Only share personal details if you want to.
          </p>
          <form
            onSubmit={send}
            className={cn(GLASS, 'mx-3 mb-[max(0.75rem,env(safe-area-inset-bottom))] flex items-end gap-2 p-2')}
          >
            <label htmlFor="chat-composer" className="sr-only">
              Message
            </label>
            <textarea
              id="chat-composer"
              ref={composerRef}
              rows={1}
              value={text}
              maxLength={1000}
              onChange={onComposerChange}
              onKeyDown={onComposerKeyDown}
              enterKeyHint="send"
              placeholder={roleReady ? 'Type a message…' : 'Connecting…'}
              disabled={!roleReady}
              className="max-h-[120px] min-h-11 flex-1 resize-none rounded-md bg-card px-3.5 py-2.5 text-base text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 md:text-sm"
            />
            <Button
              type="submit"
              variant="primary"
              size="icon"
              className="shrink-0"
              disabled={!roleReady || !text.trim()}
              aria-label="Send message"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark this item as recovered?</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 text-left text-sm text-muted-foreground">
                <p>This will:</p>
                <ul className="list-disc space-y-0.5 pl-5">
                  <li>turn off Lost Mode on the item,</li>
                  <li>close the finder's report, and</li>
                  <li>remove the location the finder shared from the report.</li>
                </ul>
                <p>The chat stays open so you can finish the handoff.</p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" autoFocus onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={confirmRecovered} loading={resolving} variant="success">
              {resolving ? 'Saving…' : 'Confirm recovered'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={blockOpen} onOpenChange={setBlockOpen}>
        <DialogContent onCloseAutoFocus={returnFocusTo('chat-report-button')}>
          <DialogHeader>
            <DialogTitle>Report this conversation?</DialogTitle>
            <DialogDescription>
              {role === 'finder'
                ? "Flags this chat for admin review of the item's owner. The chat stays open for now."
                : "Flags this chat for admin review — it may lead to this finder's session being blocked from filing further reports or messages. The chat stays open for now."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={confirmBlock} className="flex flex-col gap-4">
            <label htmlFor="report-reason" className="text-sm font-medium text-foreground">
              What's wrong? <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <Textarea
              id="report-reason"
              rows={3}
              maxLength={500}
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value)}
              placeholder="e.g. spam links, harassment…"
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setBlockOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="destructive" loading={blocking}>
                {blocking ? 'Reporting…' : 'Report conversation'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
