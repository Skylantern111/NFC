import { Suspense, useEffect } from 'react';
import { Link, Outlet, useLocation, useSearchParams } from 'react-router-dom';
import { LoadingState } from '../../components/States';
import AmbientBackground from '../../components/AmbientBackground';
import DashboardSidebar from '../../components/nav/DashboardSidebar';
import BottomTabBar from '../../components/nav/BottomTabBar';
import { OwnerNotificationsProvider } from '../../context/OwnerNotificationsContext';
import { useAuth, useVerificationWatch } from '../../context/AuthContext';
import { InlineAlert } from '../../components/States';
import { Button } from '../../components/ui/button';
import { OwnerTagIdsProvider } from '../../lib/ownerItems';
import TutorialProvider from '../../components/tutorial/TutorialProvider';
import { USER_TOUR } from '../../components/tutorial/userTour';

// Reminder on every owner page until the email is verified, except on the
// verify page itself. Browsing stays open; only claiming needs it.
function VerifyBanner() {
  const { user, firebaseReady } = useAuth();
  const { pathname } = useLocation();
  if (!firebaseReady || !user || user.emailVerified || pathname === '/dashboard/verify-email') return null;
  return (
    <InlineAlert
      tone="warning"
      title="Verify your email to claim tags"
      className="mb-4"
      action={
        <Button asChild size="sm" variant="outline">
          <Link to="/dashboard/verify-email">Verify now</Link>
        </Button>
      }
    >
      We sent a link to <span className="break-all">{user.email}</span>.
    </InlineAlert>
  );
}

// The email's "Continue" link lands on /dashboard?verified=1: re-check
// right away instead of waiting for the next poll.
function useVerifiedReturn() {
  const { refreshUser } = useAuth();
  const [params, setParams] = useSearchParams();
  const returned = params.get('verified') === '1';
  useEffect(() => {
    if (!returned) return;
    refreshUser().catch(() => {});
    const next = new URLSearchParams(params);
    next.delete('verified');
    setParams(next, { replace: true });
  }, [returned, refreshUser, params, setParams]);
}

export default function DashboardLayout() {
  const { user } = useAuth();
  useVerificationWatch();
  useVerifiedReturn();
  // One shared itemOwners listener for every owner page and the
  // notifications badge (SYSTEM_AUDIT_ROUND4.md E4) — outermost, so
  // OwnerNotificationsProvider reads it too.
  return (
    <OwnerTagIdsProvider user={user}>
      <OwnerNotificationsProvider>
        <TutorialProvider tour={USER_TOUR}>
        <AmbientBackground />
        <DashboardSidebar />
        {/* pb-28 on phones keeps content clear of the bottom tab bar. */}
        <main id="main" tabIndex={-1} className="min-h-screen px-4 pb-28 pt-6 outline-none sm:px-8 sm:pt-8 md:ml-56 md:pb-8">
          <div className="mx-auto w-full max-w-5xl">
            <VerifyBanner />
            {/* Page-level Suspense keeps the sidebar on screen while a page's
          code loads (the app-level one would replace the whole screen). */}
          <Suspense fallback={<LoadingState variant="section" />}>
            <Outlet />
          </Suspense>
          </div>
        </main>
        <BottomTabBar />
        </TutorialProvider>
      </OwnerNotificationsProvider>
    </OwnerTagIdsProvider>
  );
}
