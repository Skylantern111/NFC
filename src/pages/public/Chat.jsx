import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  collection,
  addDoc,
  doc,
  getDoc,
  updateDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { Ban, CheckCircle2, MapPin, Navigation, Send } from 'lucide-react';
import { db, firebaseReady } from '../../firebase/config';
import { getFinderToken } from '../../lib/finderSession';
import { markChatRead, notifyOwner, touchChatActivity } from '../../lib/ownerItems';
import { useAuth } from '../../context/AuthContext';
import AmbientBackground from '../../components/AmbientBackground';
import BackButton from '../../components/BackButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

// Shared frosted-glass treatment applied over the ported ui/ primitives so
// this page keeps the app's existing dark glassmorphism language.
const GLASS = 'rounded-2xl border border-white/15 bg-white/[0.06] backdrop-blur-2xl shadow-2xl';

// Canned strings only — purely a UX convenience that inserts text into the
// real message input. Not a separate system, nothing fake is implied.
const QUICK_REPLIES = ['I am here now', 'Thank you so much!', 'Left at reception desk', 'Heading over now'];

// Anonymous two-way chat. The owner is identified by Firebase Auth; the finder
// by their localStorage session token. Neither party sees the other's PII.
export default function Chat() {
  const { chatId } = useParams();
  const { user } = useAuth();
  const role = user ? 'owner' : 'finder';
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [chatMeta, setChatMeta] = useState(null); // { tagId, reportId } from chats/{chatId}
  const [report, setReport] = useState(null); // { location, status } from reports/{reportId}
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [blockReason, setBlockReason] = useState('');
  const [blocking, setBlocking] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    if (!firebaseReady) {
      setMessages([
        { id: '1', sender: 'finder', text: 'Hi! I found your backpack at the airport.' },
        { id: '2', sender: 'owner', text: 'Thank you so much! Can you leave it at info desk?' },
      ]);
      setChatMeta({ tagId: 'preview-tag', reportId: null });
      setReport({ location: { lat: 40.7527, lng: -73.9772, accuracy: 12 }, status: 'open' });
      return;
    }
    const q = query(collection(db, 'chats', chatId, 'messages'), orderBy('timestamp', 'asc'));
    return onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, [chatId]);

  // The chat doc itself only carries routing fields (tagId, reportId,
  // finderSessionToken) — it never holds PII, so it's world-readable by
  // rule. The report (which has the shared location) is owner-only to read,
  // so this quietly no-ops for the finder rather than throwing.
  useEffect(() => {
    if (!firebaseReady) return;
    let live = true;
    (async () => {
      try {
        const chatSnap = await getDoc(doc(db, 'chats', chatId));
        if (!live || !chatSnap.exists()) return;
        const meta = chatSnap.data();
        setChatMeta(meta);
        if (meta.reportId) {
          const reportSnap = await getDoc(doc(db, 'reports', meta.reportId));
          if (live && reportSnap.exists()) {
            setReport(reportSnap.data());
          }
        }
      } catch {
        // Not authorized to read the report (e.g. finder role) — location
        // card just stays hidden, nothing to recover from.
      }
    })();
    return () => {
      live = false;
    };
  }, [chatId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Opening the thread counts as reading it — clears the unread marker for
  // whichever side is viewing (drives the dot in dashboard/Messages.jsx).
  useEffect(() => {
    if (!firebaseReady || !chatId) return;
    markChatRead(chatId, role).catch(() => {});
  }, [chatId, role]);

  async function send(e) {
    e.preventDefault();
    if (!text.trim()) return;
    const body = text.trim();
    setText('');
    if (!firebaseReady) {
      setMessages((m) => [...m, { id: String(Date.now()), sender: role, text: body }]);
      return;
    }
    await addDoc(collection(db, 'chats', chatId, 'messages'), {
      sender: role,
      text: body,
      // Finder auth is by token; owner by uid. Rules validate on write.
      finderSessionToken: role === 'finder' ? getFinderToken() : null,
      timestamp: serverTimestamp(),
    });
    touchChatActivity(chatId, { sender: role, text: body }).catch(() => {});
    // Only notify the owner about a finder's message — an owner doesn't
    // need to be told about a message they just sent themselves.
    if (role === 'finder' && chatMeta?.tagId) {
      notifyOwner({ type: 'message', tagId: chatMeta.tagId, chatId }).catch(() => {});
    }
  }

  // Real, state-changing action: clears the item's Lost Mode and closes the
  // report. Owner-only, gated by the rules (ownsTag) on both writes.
  async function confirmRecovered() {
    setResolving(true);
    if (!firebaseReady) {
      setReport((r) => ({ ...(r || {}), status: 'resolved' }));
      setResolving(false);
      setConfirmOpen(false);
      return;
    }
    try {
      if (chatMeta?.tagId) {
        await updateDoc(doc(db, 'items', chatMeta.tagId), { isLostMode: false, lostSince: null });
      }
      if (chatMeta?.reportId) {
        await updateDoc(doc(db, 'reports', chatMeta.reportId), { status: 'resolved' });
      }
      setReport((r) => ({ ...(r || {}), status: 'resolved' }));
      setConfirmOpen(false);
    } catch (err) {
      alert('Could not update recovery status: ' + err.message);
    } finally {
      setResolving(false);
    }
  }

  // Owner-only "Report / Block" affordance (§4.4/§4.13): flags this chat for
  // the admin Moderation queue. Doesn't block the finder by itself — that
  // only happens once an admin actually bans the finder's session token
  // (see admin/Moderation.jsx, firestore.rules#isBlockedToken) — this just
  // gets it in front of a human.
  async function confirmBlock(e) {
    e.preventDefault();
    setBlocking(true);
    if (!firebaseReady) {
      setChatMeta((m) => ({ ...(m || {}), blocked: true, blockedReason: blockReason.trim() || null }));
      setBlocking(false);
      setBlockOpen(false);
      return;
    }
    try {
      await updateDoc(doc(db, 'chats', chatId), {
        blocked: true,
        blockedReason: blockReason.trim() || null,
        blockedAt: serverTimestamp(),
      });
      setChatMeta((m) => ({ ...(m || {}), blocked: true, blockedReason: blockReason.trim() || null }));
      setBlockOpen(false);
    } catch (err) {
      alert('Could not report this chat: ' + err.message);
    } finally {
      setBlocking(false);
    }
  }

  const location = report?.location;
  const resolved = report?.status === 'resolved';

  return (
    <div className="relative flex h-[100dvh] flex-col">
      <AmbientBackground />
      <header className={cn(GLASS, 'mx-3 mt-3 flex items-center justify-between gap-3 px-4 py-3')}>
        <div className="flex items-center gap-3">
          <BackButton fallback={role === 'owner' ? '/dashboard' : '/'} />
          <div>
            <h1 className="font-bold text-white">Anonymous chat</h1>
            <p className="text-xs text-slate-400">You are the {role}. Contact details stay hidden.</p>
          </div>
        </div>
        {role === 'owner' && (
          <div className="flex shrink-0 items-center gap-2">
            {chatMeta?.blocked ? (
              <span className="flex items-center gap-1.5 rounded-full border border-red-400/30 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-300">
                <Ban className="h-3.5 w-3.5" /> Reported
              </span>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setBlockOpen(true)}
                className="gap-1.5 border-white/15 bg-transparent text-slate-300 hover:bg-white/10 hover:text-white"
              >
                <Ban className="h-3.5 w-3.5" /> Report
              </Button>
            )}
            {resolved ? (
              <span className="flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" /> Recovered
              </span>
            ) : (
              <Button
                type="button"
                size="sm"
                onClick={() => setConfirmOpen(true)}
                className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-500"
              >
                <CheckCircle2 className="h-4 w-4" /> Mark as recovered
              </Button>
            )}
          </div>
        )}
      </header>

      {location && (
        <Card className={cn(GLASS, 'mx-3 mt-3 py-3')}>
          <CardContent className="flex items-center justify-between gap-3 px-4 text-white">
            <div className="flex min-w-0 items-center gap-2.5">
              <MapPin className="h-4 w-4 shrink-0 text-purple-300" />
              <div className="min-w-0">
                <p className="text-xs font-semibold">Shared location</p>
                <p className="truncate text-xs text-slate-400">
                  {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
                  {location.accuracy ? ` · ±${Math.round(location.accuracy)}m` : ''}
                </p>
              </div>
            </div>
            <a
              href={`https://maps.google.com/?q=${location.lat},${location.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex shrink-0 items-center gap-1 rounded-full bg-gradient-to-r from-purple-600 to-pink-600 px-3 py-1.5 text-xs font-semibold text-white hover:from-purple-500 hover:to-pink-500"
            >
              <Navigation className="h-3.5 w-3.5" /> Directions
            </a>
          </CardContent>
        </Card>
      )}

      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {messages.map((m) => {
          const mine = m.sender === role;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm ${
                  m.sender === 'owner' ? 'bg-purple-600/80 text-white' : 'bg-white/15 text-slate-100'
                }`}
              >
                {m.text}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <div className="mx-3 mb-2 flex gap-2 overflow-x-auto pb-1">
        {QUICK_REPLIES.map((reply) => (
          <button
            key={reply}
            type="button"
            onClick={() => setText(reply)}
            className="shrink-0 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
          >
            {reply}
          </button>
        ))}
      </div>

      <form onSubmit={send} className={cn(GLASS, 'm-3 mt-0 flex gap-2 p-2')}>
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message…"
          className="flex-1 border-white/10 bg-white/10 text-white placeholder:text-slate-400"
        />
        <Button type="submit" className="gap-1.5 rounded-full bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-500 hover:to-pink-500">
          <Send className="h-4 w-4" /> Send
        </Button>
      </form>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="border-white/15 bg-[#130e26] text-white">
          <DialogHeader>
            <DialogTitle>Mark this item as recovered?</DialogTitle>
            <DialogDescription className="text-slate-400">
              This turns off Lost Mode on the item and closes this report. The chat stays open so
              you can keep coordinating the handoff.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              className="border-white/15 bg-transparent text-white hover:bg-white/10 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={confirmRecovered}
              disabled={resolving}
              className="bg-emerald-600 text-white hover:bg-emerald-500"
            >
              {resolving ? 'Saving…' : 'Confirm recovered'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={blockOpen} onOpenChange={setBlockOpen}>
        <DialogContent className="border-white/15 bg-[#130e26] text-white">
          <DialogHeader>
            <DialogTitle>Report this conversation?</DialogTitle>
            <DialogDescription className="text-slate-400">
              Flags this chat for admin review — it may lead to this finder's session being
              blocked from filing further reports or messages. The chat stays open for now.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={confirmBlock} className="flex flex-col gap-4">
            <Textarea
              rows={3}
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value)}
              placeholder="What's wrong? e.g. spam links, harassment…"
              className="border-white/10 bg-white/10 text-white placeholder:text-slate-400"
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setBlockOpen(false)}
                className="border-white/15 bg-transparent text-white hover:bg-white/10 hover:text-white"
              >
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={blocking}>
                {blocking ? 'Reporting…' : 'Report chat'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
