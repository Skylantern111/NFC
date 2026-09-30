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
    <header className="relative z-10 mx-auto flex w-full max-w-5xl items-center justify-between border-b-2 border-foreground bg-card px-4 py-4 sm:px-6">
      <Link to="/" className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-md border-2 border-foreground bg-primary shadow-brut-sm">
          <Tag className="h-4 w-4 text-primary-foreground" />
        </span>
        <span className="font-display text-lg font-bold text-foreground">TagBack</span>
      </Link>

      {variant === 'landing' ? (
        <nav className="flex items-center gap-3">
          <Link to="/login" className="flex min-h-11 items-center px-2 text-sm font-bold text-foreground hover:underline underline-offset-4">
            Sign in
          </Link>
          <Link
            to="/register"
            className="flex min-h-11 items-center rounded-md border-2 border-foreground bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-brut-sm transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-brut active:translate-x-0 active:translate-y-0 active:shadow-brut-sm"
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
