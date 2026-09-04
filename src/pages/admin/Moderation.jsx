import { Ban, ShieldCheck } from 'lucide-react';
import { useModerationQueue, banToken, unbanToken } from '../../lib/moderation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

function relativeTime(timestamp) {
  const ms = timestamp?.toMillis ? timestamp.toMillis() : null;
  if (!ms) return '';
  const diffMin = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.round(diffHr / 24)}d ago`;
}

// §4.13/§5.4. Real live data: chats an owner reported (chats.blocked, set
// from public/Chat.jsx) joined against items for a display name. Listed
// entries are a review log, not a to-do list — banning/unbanning the token
// doesn't remove a row, since the report itself already happened.
export default function Moderation() {
  const { chats, items, bannedTokens, loading, toggleMockBan } = useModerationQueue();

  async function onToggleBan(chat) {
    const token = chat.finderSessionToken;
    const banned = bannedTokens.has(token);
    try {
      if (banned) {
        await unbanToken(token);
      } else {
        await banToken(token, { tagId: chat.tagId, reason: chat.blockedReason });
      }
      toggleMockBan(token);
    } catch (err) {
      alert('Could not update ban status: ' + err.message);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-800">Moderation</h1>
        <p className="mt-1 text-sm text-slate-500">
          Conversations owners have reported. Banning a finder's session token blocks it from
          filing new reports or sending new messages anywhere in the app.
        </p>
      </div>

      {loading && <p className="text-sm text-slate-500">Loading reported conversations…</p>}

      {!loading && chats.length === 0 && (
        <Card className="rounded-3xl bg-white/80 shadow-lg">
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <ShieldCheck className="h-6 w-6 text-slate-500" />
            <p className="font-bold text-slate-800">Nothing reported.</p>
            <p className="text-sm text-slate-500">Chats an owner reports as abusive show up here.</p>
          </CardContent>
        </Card>
      )}

      {chats.length > 0 && (
        <div className="overflow-x-auto rounded-2xl bg-white/80 shadow-lg">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-200 hover:bg-transparent">
                <TableHead>Item</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Finder token</TableHead>
                <TableHead>Reported</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {chats.map((chat) => {
                const banned = bannedTokens.has(chat.finderSessionToken);
                return (
                  <TableRow key={chat.id} className="border-slate-200/60">
                    <TableCell className="text-slate-700">{items[chat.tagId]?.itemName || 'Unknown item'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="border-amber-200 bg-amber-50/80 text-amber-600">
                        {chat.blockedReason || 'No reason given'}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-slate-500">
                      {chat.finderSessionToken}
                    </TableCell>
                    <TableCell className="text-xs text-slate-400">
                      {relativeTime(chat.blockedAt)}
                    </TableCell>
                    <TableCell>
                      {banned ? (
                        <Badge variant="destructive">Banned</Badge>
                      ) : (
                        <Badge variant="outline">Active</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        size="sm"
                        variant={banned ? 'outline' : 'destructive'}
                        className="gap-1.5"
                        onClick={() => onToggleBan(chat)}
                      >
                        <Ban className="h-3.5 w-3.5" />
                        {banned ? 'Unban' : 'Ban token'}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
