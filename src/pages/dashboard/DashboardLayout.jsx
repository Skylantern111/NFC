import { Outlet } from 'react-router-dom';
import AmbientBackground from '../../components/AmbientBackground';
import DashboardSidebar from '../../components/nav/DashboardSidebar';
import BottomTabBar from '../../components/nav/BottomTabBar';
import { OwnerNotificationsProvider } from '../../context/OwnerNotificationsContext';
import { useAuth } from '../../context/AuthContext';
import { OwnerTagIdsProvider } from '../../lib/ownerItems';

export default function DashboardLayout() {
  const { user } = useAuth();
  // One shared itemOwners listener for every owner page and the
  // notifications badge (SYSTEM_AUDIT_ROUND4.md E4) — outermost, so
  // OwnerNotificationsProvider reads it too.
  return (
    <OwnerTagIdsProvider user={user}>
      <OwnerNotificationsProvider>
        <AmbientBackground />
        <DashboardSidebar />
        {/* pb-28 on phones keeps content clear of the bottom tab bar. */}
        <main id="main" tabIndex={-1} className="min-h-screen px-4 pb-28 pt-6 outline-none sm:px-8 sm:pt-8 md:ml-56 md:pb-8">
          <div className="mx-auto w-full max-w-5xl">
            <Outlet />
          </div>
        </main>
        <BottomTabBar />
      </OwnerNotificationsProvider>
    </OwnerTagIdsProvider>
  );
}
