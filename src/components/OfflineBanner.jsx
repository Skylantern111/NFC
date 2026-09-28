import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

// Firestore already queues writes while offline; this only tells the
// person, so a message that hasn't gone yet doesn't look lost
// (UI_UX_IMPROVEMENT_PLAN.md B.9).
export default function OfflineBanner() {
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && navigator.onLine === false);

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  if (!offline) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-2 bg-slate-800 px-4 py-2 text-center text-sm font-medium text-white"
    >
      <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
      You're offline — changes will send when you reconnect.
    </div>
  );
}
