import { Outlet } from 'react-router-dom';
import AmbientBackground from '../../components/AmbientBackground';
import DashboardSidebar from '../../components/nav/DashboardSidebar';
import { OwnerNotificationsProvider } from '../../context/OwnerNotificationsContext';

export default function DashboardLayout() {
  return (
    <OwnerNotificationsProvider>
      <AmbientBackground />
      <DashboardSidebar />
      <div className="min-h-screen px-4 py-6 sm:px-8 sm:py-8 md:ml-56">
        <Outlet />
      </div>
    </OwnerNotificationsProvider>
  );
}
