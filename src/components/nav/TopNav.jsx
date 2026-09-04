import { Link } from 'react-router-dom';
import { Tag } from 'lucide-react';
import BackButton from '../BackButton';

// Public/finder top nav (REDESIGN_PLAN §3.1). `variant="landing"` shows the
// account links; every other page gets the simpler back-button variant since
// finders never have an account to link to.
export default function TopNav({ variant = 'simple', fallback = '/' }) {
  return (
    <header className="relative z-10 mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-5 sm:px-6">
      <Link to="/" className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-pink-500">
          <Tag className="h-4 w-4 text-white" />
        </span>
        <span className="text-lg font-extrabold text-white">TagBack</span>
      </Link>

      {variant === 'landing' ? (
        <nav className="flex items-center gap-4">
          <Link to="/login" className="text-sm font-medium text-slate-300 hover:text-white">
            Login
          </Link>
          <Link
            to="/register"
            className="rounded-full bg-gradient-to-r from-purple-500 to-pink-500 px-4 py-2 text-sm font-semibold text-white hover:from-purple-400 hover:to-pink-400"
          >
            Get Started
          </Link>
        </nav>
      ) : (
        <BackButton fallback={fallback} />
      )}
    </header>
  );
}
