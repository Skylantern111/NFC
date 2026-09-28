import { Link, useLocation } from 'react-router-dom';
import { Tag } from 'lucide-react';
import BackButton from '../BackButton';

// Public/finder top nav (REDESIGN_PLAN §3.1). `variant="landing"` shows the
// account links; every other page gets the simpler back-button variant since
// finders never have an account to link to.
//
// `historyOnly` (UI_UX_IMPROVEMENT_PLAN.md NAV5): a finder who opened a tag
// straight from a tap has nowhere to go "back" to in this app — sending them
// to the owner sign-up page was confusing, so the button is hidden then.
export default function TopNav({ variant = 'simple', fallback = '/', historyOnly = false }) {
  const location = useLocation();
  const hideBack = historyOnly && location.key === 'default';
  return (
    <header className="relative z-10 mx-auto flex w-full max-w-5xl items-center justify-between border-b border-white/50 dark:border-white/10 bg-white/40 dark:bg-white/5 px-4 py-5 backdrop-blur-md sm:px-6">
      <Link to="/" className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 shadow-neu-flat-sm">
          <Tag className="h-4 w-4 text-white" />
        </span>
        <span className="text-lg font-extrabold text-slate-800 dark:text-slate-100">TagBack</span>
      </Link>

      {variant === 'landing' ? (
        <nav className="flex items-center gap-4">
          <Link to="/login" className="flex min-h-11 items-center text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-50">
            Sign in
          </Link>
          <Link
            to="/register"
            className="flex min-h-11 items-center rounded-full bg-gradient-to-r from-purple-600 to-pink-600 px-4 py-2 text-sm font-semibold text-white shadow-neu-flat-sm hover:from-purple-400 hover:to-pink-400"
          >
            Get Started
          </Link>
        </nav>
      ) : hideBack ? null : (
        <BackButton fallback={fallback} className="min-h-11" />
      )}
    </header>
  );
}
