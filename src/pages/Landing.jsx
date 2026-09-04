import { Link } from 'react-router-dom';
import { Nfc } from 'lucide-react';
import AmbientBackground from '../components/AmbientBackground';
import GlassCard from '../components/GlassCard';
import TopNav from '../components/nav/TopNav';
import { Button } from '../components/ui';

export default function Landing() {
  return (
    <>
      <AmbientBackground />
      <div className="relative flex min-h-screen flex-col">
        <TopNav variant="landing" />
        <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-5 py-12 text-center">
          <span className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-semibold text-slate-200">
            <Nfc className="h-3.5 w-3.5 text-purple-300" />
            NFC-powered Lost &amp; Found
          </span>
          <h1 className="mb-4 text-4xl font-extrabold drop-shadow-md sm:text-5xl">
            Tap a tag.
            <br />
            <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              Bring it back.
            </span>
          </h1>
          <p className="mb-8 max-w-md text-slate-300 drop-shadow">
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
              <Link to="/admin" className="mt-1 text-sm text-slate-400 hover:text-slate-200">
                Admin console →
              </Link>
            </div>
          </GlassCard>
          <p className="mt-6 text-xs text-slate-500">
            Found something? Just tap the tag with your phone.
          </p>
        </main>
      </div>
    </>
  );
}
