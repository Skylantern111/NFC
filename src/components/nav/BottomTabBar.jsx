import { NavLink } from 'react-router-dom';
import { useOwnerNavItems } from './DashboardSidebar';

// Owner tab bar on phones (UI_UX_IMPROVEMENT_PLAN.md NAV1): the unread
// badge is visible right on the tab so a phone owner sees when a finder has
// written. Settings and logout stay in the menu. Brutalist: solid bar with a
// thick top border; the active tab's icon sits in a filled color block.
export default function BottomTabBar() {
  const items = useOwnerNavItems().filter((i) => i.to !== '/dashboard/settings');

  return (
    <nav
      aria-label="Main"
      data-tour-bottom-bar=""
      className="fixed inset-x-0 bottom-0 z-20 flex border-t-2 border-foreground bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {items.map(({ to, label, icon: Icon, end, badge, dot }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-bold ${
              isActive ? 'text-foreground' : 'text-muted-foreground'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <span
                className={`relative flex h-8 w-12 items-center justify-center rounded-md border-2 ${
                  isActive
                    ? 'border-foreground bg-accent text-accent-foreground'
                    : 'border-transparent'
                }`}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                {badge > 0 && (
                  <span className="absolute -right-1 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full border border-foreground bg-destructive px-1 text-[0.7rem] font-bold text-destructive-foreground">
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
                {!badge && dot && <span className="absolute right-1 top-0 h-2.5 w-2.5 rounded-full border border-foreground bg-destructive" />}
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
