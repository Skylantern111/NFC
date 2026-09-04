import { Outlet } from 'react-router-dom';
import AmbientBackground from '../../components/AmbientBackground';
import DashboardSidebar from '../../components/nav/DashboardSidebar';

export default function DashboardLayout() {
  return (
    <>
      <AmbientBackground />
      <DashboardSidebar />
      <div className="ml-56 min-h-screen px-6 py-8 sm:px-8">
        <Outlet />
      </div>
    </>
  );
}
