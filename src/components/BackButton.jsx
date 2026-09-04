import { ArrowLeft } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

// Goes to the actual previous page when there is app history to go back to
// (location.key === 'default' means this is the first entry in the session —
// e.g. a tag was scanned directly, or the tab was opened fresh on this URL),
// otherwise falls back to a sane default route.
export default function BackButton({ fallback = '/', label = 'Back', className = '' }) {
  const nav = useNavigate();
  const location = useLocation();

  function onBack() {
    if (location.key !== 'default') nav(-1);
    else nav(fallback);
  }

  return (
    <button
      type="button"
      onClick={onBack}
      className={`inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900 ${className}`}
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
    </button>
  );
}
