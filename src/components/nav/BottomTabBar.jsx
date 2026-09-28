import { NavLink } from 'react-router-dom';
import { useOwnerNavItems } from './DashboardSidebar';

// Owner tab bar on phones (UI_UX_IMPROVEMENT_PLAN.md NAV1): the unread
// badge used to sit inside the hamburger drawer, so a phone owner couldn't
// see that a finder had written. Settings and logout stay in the menu.
export default function BottomTabBar() {
  const items = useOwnerNavItems().filter((i) => i.to !== '/dashboard/settings');

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 flex border-t border-white/60 dark:border-white/10 bg-base/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      {items.map(({ to, label, icon: Icon, end, badge, dot }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium ${
              isActive ? 'text-purple-700 dark:text-purple-300' : 'text-slate-600 dark:text-slate-400'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <span
                className={`relative flex h-7 w-12 items-center justify-center rounded-full ${
                  isActive ? 'bg-purple-100 dark:bg-purple-500/20' : ''
                }`}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                {badge > 0 && (
                  <span className="absolute -right-0.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-pink-600 px-1 text-[0.7rem] font-bold text-white">
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
                {!badge && dot && <span className="absolute right-1.5 top-0 h-2.5 w-2.5 rounded-full bg-pink-600" />}
              </span>
              {label === 'Notifications' ? 'Alerts' : label}
              {badge > 0 && <span className="sr-only">, {badge} unread</span>}
              {!badge && dot && <span className="sr-only">, new</span>}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
