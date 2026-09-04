import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  MessageSquare,
  Nfc,
  ShieldCheck,
  ShieldOff,
  Smartphone,
} from 'lucide-react';
import AmbientBackground from '../components/AmbientBackground';
import GlassCard from '../components/GlassCard';
import TopNav from '../components/nav/TopNav';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';

// Real, implemented functions only (README.md "Core (implemented)") — no
// planned/unbuilt functionality gets a step here.
const HOW_IT_WORKS = [
  {
    icon: Nfc,
    title: 'Tag your item',
    detail: 'Generate an NFC ID and write its link to a physical tag, right from your browser.',
  },
  {
    icon: ShieldCheck,
    title: 'Claim & protect',
    detail: 'Create an account and claim the tag so only you can manage that item.',
  },
  {
    icon: AlertTriangle,
    title: 'Arm Lost Mode',
    detail: "If it goes missing, flip on Lost Mode with a message to whoever finds it — and an optional reward.",
  },
  {
    icon: MessageSquare,
    title: 'Tap, report, reconnect',
    detail: 'A finder taps the tag, files a report, and you message each other anonymously to get it back.',
  },
];

const HIGHLIGHTS = [
  {
    icon: Smartphone,
    title: 'No app required',
    detail: 'Tapping a tag opens a normal web page — nothing to install for the finder.',
  },
  {
    icon: MessageSquare,
    title: 'Anonymous chat',
    detail: 'Owner and finder message each other without ever exchanging phone numbers or emails.',
  },
  {
    icon: ShieldOff,
    title: 'Privacy by design',
    detail: "Identity is kept in a separate database record from item data — not just hidden in the UI.",
  },
];

export default function Landing() {
  return (
    <>
      <AmbientBackground />
      <div className="relative flex min-h-screen flex-col">
        <TopNav variant="landing" />
        <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-5 py-12 text-center">
          <span className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-base px-3.5 py-1.5 text-xs font-semibold text-slate-600 shadow-neu-flat-sm">
            <Nfc className="h-3.5 w-3.5 text-purple-600" />
            NFC-powered Lost &amp; Found
          </span>
          <h1 className="mb-4 text-4xl font-extrabold text-slate-800 sm:text-5xl">
            Tap a tag.
            <br />
            <span className="bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              Bring it back.
            </span>
          </h1>
          <p className="mb-8 max-w-md text-slate-600">
            Stick a tag on anything worth keeping. If it's lost, whoever finds it taps
            their phone and reaches you — no app, no exposed contact info.
          </p>
          <GlassCard className="w-full max-w-sm">
            <div className="flex flex-col gap-3">
              <Link to="/login">
                <Button className="w-full">Owner sign in</Button>
              </Link>
              <Link to="/register">
                <Button variant="ghost" className="w-full">
                  Create account
                </Button>
              </Link>
            </div>
          </GlassCard>
          <p className="mt-6 text-xs text-slate-500">
            Found something? Just tap the tag with your phone.
          </p>
        </main>

        {/* What is TagBack — real README/App copy, no invented functionality. */}
        <section className="mx-auto w-full max-w-4xl px-5 py-10">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-extrabold text-slate-800 sm:text-3xl">What is TagBack?</h2>
            <p className="mx-auto mt-3 max-w-2xl text-slate-600">
              Physical-to-digital lost property recovery. Owners stick an NFC tag on a
              belonging; if it's lost, whoever finds it taps the tag with their phone and
              lands on a privacy-shielded web page — no app install — where they can message
              the owner and share a location, without either party ever seeing the other's
              name, phone, email, or address.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {HIGHLIGHTS.map(({ icon: Icon, title, detail }) => (
              <Card key={title} className="rounded-2xl bg-white/80 p-5 shadow-lg">
                <CardContent className="space-y-3 p-0 text-left">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-100 text-purple-600">
                    <Icon className="h-4.5 w-4.5" />
                  </span>
                  <div>
                    <p className="font-bold text-slate-800">{title}</p>
                    <p className="mt-1 text-sm text-slate-500">{detail}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Mini tutorial — same numbered-step visual language as
            dashboard/NfcSetup.jsx's "How to write & test" card. */}
        <section className="mx-auto w-full max-w-4xl px-5 pb-14">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-extrabold text-slate-800 sm:text-3xl">How it works</h2>
            <p className="mx-auto mt-3 max-w-2xl text-slate-600">
              From sticking on a tag to getting your item back.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {HOW_IT_WORKS.map(({ icon: Icon, title, detail }, i) => (
              <div key={title} className="flex gap-3 rounded-2xl bg-white/80 p-5 shadow-lg text-left">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-base text-sm font-bold text-purple-600 shadow-neu-flat-sm">
                  {i + 1}
                </span>
                <div>
                  <p className="flex items-center gap-1.5 font-bold text-slate-800">
                    <Icon className="h-4 w-4 text-purple-600" />
                    {title}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">{detail}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <footer className="mx-auto w-full max-w-4xl px-5 pb-8 text-center">
          <Link to="/admin" className="text-xs text-slate-400 hover:text-slate-600">
            Admin console →
          </Link>
        </footer>
      </div>
    </>
  );
}
