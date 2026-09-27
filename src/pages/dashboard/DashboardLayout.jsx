import { Outlet } from 'react-router-dom';
import AmbientBackground from '../../components/AmbientBackground';
import DashboardSidebar from '../../components/nav/DashboardSidebar';
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
        <div className="min-h-screen px-4 py-6 sm:px-8 sm:py-8 md:ml-56">
          <Outlet />
        </div>
      </OwnerNotificationsProvider>
    </OwnerTagIdsProvider>
  );
}
