import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Ban, CheckCircle2, Send } from 'lucide-react';
import {
  useChat,
  useChatMessages,
  getPublicItem,
  markChatRead,
  markRecovered,
  reportChat,
  sendChatMessage,
} from '../../lib/ownerItems';
import { firebaseReady } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import AmbientBackground from '../../components/AmbientBackground';
import BackButton from '../../components/BackButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
// this page keeps the app's light glassmorphism language.
const GLASS = 'rounded-2xl bg-white/70 backdrop-blur-2xl shadow-lg';

// Canned strings only — purely a UX convenience that inserts text into the
// real message input. Not a separate system, nothing fake is implied.
const QUICK_REPLIES = ['I am here now', 'Thank you so much!', 'Left at reception desk', 'Heading over now'];

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
  const { user } = useAuth();
  const role = user ? 'owner' : 'finder';
  const previewTagId = !firebaseReady && chatId?.startsWith('preview-') ? chatId.slice(8) : null;

  const { chat: liveChat, loading: chatLoading } = useChat(firebaseReady ? chatId : null);
  const { messages: liveMessages } = useChatMessages(firebaseReady ? chatId : null);
  const [mockChat, setMockChat] = useState(() => (previewTagId ? { id: chatId, tagId: previewTagId } : null));
  const [mockMessages, setMockMessages] = useState([]);
  const [item, setItem] = useState(previewTagId ? previewItem(previewTagId) : null);
  const [text, setText] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [blockReason, setBlockReason] = useState('');
  const [blocking, setBlocking] = useState(false);
  const endRef = useRef(null);

  const chat = firebaseReady ? liveChat : mockChat;
  const messages = firebaseReady ? liveMessages : mockMessages;
  const loading = firebaseReady ? chatLoading : false;

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
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Opening the thread counts as reading it — clears the unread marker for
  // whichever side is viewing (drives the dot in dashboard/Messages.jsx).
  useEffect(() => {
    if (!chatId || !firebaseReady) return;
    markChatRead(chatId, role).catch(() => {});
  }, [chatId, role]);

  async function send(e) {
    e.preventDefault();
    if (!text.trim()) return;
    const body = text.trim();
    setText('');
    if (firebaseReady) {
      await sendChatMessage(chatId, role, body);
    } else {
      setMockMessages((m) => [...m, { id: `mock_${Date.now()}`, sender: role, text: body }]);
    }
  }

  // Real, state-changing action: clears the item's Lost Mode. Owner-only.
  async function confirmRecovered() {
    if (!chat) return;
    setResolving(true);
    try {
      if (firebaseReady) {
        await markRecovered(chat.tagId, chatId);
      } else {
        setItem((it) => ({ ...it, isLostMode: false }));
        setMockChat((c) => ({ ...c, resolved: true }));
      }
      setConfirmOpen(false);
    } catch (err) {
      alert('Could not update recovery status: ' + err.message);
    } finally {
      setResolving(false);
    }
  }

  // Owner-only "Report / Block" affordance: flags this chat for the admin
  // moderation queue. Doesn't block the finder by itself — that only happens
  // once an admin actually bans the finder's session token — this just gets
  // it in front of a human.
  async function confirmBlock(e) {
    e.preventDefault();
    setBlocking(true);
    try {
      if (firebaseReady) {
        await reportChat(chatId, blockReason.trim());
      } else {
        setMockChat((c) => ({ ...c, blocked: true, blockedReason: blockReason.trim() }));
      }
      setBlockOpen(false);
    } catch (err) {
      alert('Could not report this chat: ' + err.message);
    } finally {
      setBlocking(false);
    }
  }

  const resolved = !!chat?.resolved;

  return (
    <div className="relative flex h-[100dvh] flex-col">
      <AmbientBackground />
      <header className={cn(GLASS, 'mx-3 mt-3 flex items-center justify-between gap-3 px-4 py-3')}>
        <div className="flex items-center gap-3">
          <BackButton fallback={role === 'owner' ? '/dashboard' : '/'} />
          <div>
            <h1 className="font-bold text-slate-800">{item?.itemName || 'Anonymous chat'}</h1>
            <p className="text-xs text-slate-500">You are the {role}. Contact details stay hidden.</p>
          </div>
        </div>
        {role === 'owner' && (
          <div className="flex shrink-0 items-center gap-2">
            {chat?.blocked ? (
              <span className="flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50/80 px-3 py-1.5 text-xs font-semibold text-red-600">
                <Ban className="h-3.5 w-3.5" /> Reported
              </span>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setBlockOpen(true)}
                className="gap-1.5"
              >
                <Ban className="h-3.5 w-3.5" /> Report
              </Button>
            )}
            {resolved ? (
              <span className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50/80 px-3 py-1.5 text-xs font-semibold text-emerald-600">
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

      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {loading && <p className="text-center text-sm text-slate-500">Loading conversation…</p>}
        {messages.map((m) => {
          const mine = m.sender === role;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm ${
                  m.sender === 'owner' ? 'bg-purple-600/80 text-white' : 'bg-white/60 text-slate-800'
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
            className="shrink-0 rounded-full bg-base px-3 py-1.5 text-xs text-slate-600 shadow-neu-flat-sm transition-shadow hover:shadow-neu-pressed-sm"
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
          className="flex-1"
        />
        <Button type="submit" className="gap-1.5 rounded-full">
          <Send className="h-4 w-4" /> Send
        </Button>
      </form>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark this item as recovered?</DialogTitle>
            <DialogDescription>
              This turns off Lost Mode on the item. The chat stays open so you can keep
              coordinating the handoff.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={confirmRecovered}
              disabled={resolving}
              className="bg-emerald-600 text-white shadow-neu-flat active:shadow-neu-pressed hover:bg-emerald-500"
            >
              {resolving ? 'Saving…' : 'Confirm recovered'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={blockOpen} onOpenChange={setBlockOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report this conversation?</DialogTitle>
            <DialogDescription>
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
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setBlockOpen(false)}>
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
