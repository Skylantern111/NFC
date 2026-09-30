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
import TopNav from '../components/nav/TopNav';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';

// Real, implemented functions only (README.md "Core (implemented)") — no
// planned/unbuilt functionality gets a step here.
const HOW_IT_WORKS = [
  {
    icon: Nfc,
    title: 'Get a registered tag',
    detail: 'Every TagBack sticker is registered from its own physical hardware — never a made-up code — and comes with a unique TagBack ID.',
  },
  {
    icon: ShieldCheck,
    title: 'Claim & protect',
    detail: 'Create an account and enter your TagBack ID (or tap to scan) so only you can manage that item.',
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
          <span className="mb-5 inline-flex items-center gap-1.5 rounded-md border-2 border-foreground bg-accent px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-accent-foreground shadow-brut-sm">
            <Nfc className="h-3.5 w-3.5" />
            NFC-powered Lost &amp; Found
          </span>
          <h1 className="mb-4 font-display text-5xl font-bold uppercase leading-[0.95] tracking-tight text-foreground sm:text-6xl">
            Tap a tag.
            <br />
            <span className="mt-2 inline-block -rotate-1 border-2 border-foreground bg-primary px-3 py-1 text-primary-foreground shadow-brut">
              Bring it back.
            </span>
          </h1>
          <p className="mb-8 mt-6 max-w-md text-base text-muted-foreground">
            Stick a tag on anything worth keeping. If it's lost, whoever finds it taps
            their phone and reaches you — no app, no exposed contact info.
          </p>
          <div className="w-full max-w-sm space-y-3">
            <Button asChild variant="primary" size="lg" className="w-full">
              <Link to="/register">Create a free account</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="w-full">
              <Link to="/login">I have an account — sign in</Link>
            </Button>
          </div>
          {/* A curious finder may land here too (UI_UX_IMPROVEMENT_PLAN.md C.2). */}
          <div className="mt-6 flex max-w-sm items-start gap-3 rounded-lg border-2 border-foreground bg-success-soft px-4 py-3 text-left shadow-brut-sm">
            <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-foreground" aria-hidden="true" />
            <p className="text-sm text-foreground">
              <span className="font-bold">Found something with a TagBack sticker?</span> Hold your phone against
              the sticker. A page opens where you can message the owner — no app or account needed.
            </p>
          </div>
        </main>

        {/* What is TagBack — real README/App copy, no invented functionality. */}
        <section className="mx-auto w-full max-w-4xl px-5 py-10">
          <div className="mb-8 text-center">
            <h2 className="font-display text-3xl font-bold uppercase tracking-tight text-foreground sm:text-4xl">What is TagBack?</h2>
            <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
              Physical-to-digital lost property recovery. Owners stick an NFC tag on a
              belonging; if it's lost, whoever finds it taps the tag with their phone and
              lands on a privacy-shielded web page — no app install — where they can message
              the owner and share a location, without either party ever seeing the other's
              name, phone, email, or address.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {HIGHLIGHTS.map(({ icon: Icon, title, detail }, i) => (
              <Card key={title} className="p-5">
                <CardContent className="space-y-3 p-0 text-left">
                  <span className={`flex h-10 w-10 items-center justify-center rounded-md border-2 border-foreground text-foreground ${['bg-accent', 'bg-primary text-primary-foreground', 'bg-success'][i % 3]}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-display font-bold text-foreground">{title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
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
            <h2 className="font-display text-3xl font-bold uppercase tracking-tight text-foreground sm:text-4xl">How it works</h2>
            <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
              From sticking on a tag to getting your item back.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {HOW_IT_WORKS.map(({ icon: Icon, title, detail }, i) => (
              <div key={title} className="flex gap-3 rounded-lg border-2 border-foreground bg-card p-5 shadow-brut text-left">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border-2 border-foreground bg-accent font-mono text-sm font-bold text-accent-foreground">
                  {i + 1}
                </span>
                <div>
                  <p className="flex items-center gap-1.5 font-display font-bold text-foreground">
                    <Icon className="h-4 w-4" />
                    {title}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <footer className="mx-auto flex w-full max-w-4xl flex-wrap justify-center gap-4 px-5 pb-8 text-center">
          <Link to="/privacy" className="min-h-11 px-2 py-3 text-xs font-bold text-muted-foreground hover:text-foreground hover:underline underline-offset-4">
            Privacy
          </Link>
          {/* NAV7 (decided): a quiet staff link, not an "Admin console" invitation. */}
          <Link to="/admin/login" className="min-h-11 px-2 py-3 text-xs font-bold text-muted-foreground hover:text-foreground hover:underline underline-offset-4">
            Staff sign-in
          </Link>
        </footer>
      </div>
    </>
  );
}
