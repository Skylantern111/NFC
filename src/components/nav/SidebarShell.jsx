import { useState } from 'react';
import { Link, NavLink, matchPath, useLocation } from 'react-router-dom';
import { LogOut, Menu, Tag } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../ui/sheet';

// Shared shell for DashboardSidebar/AdminSidebar (design system §14): same
// brand block, nav list, and logout footer for both consoles, so a nav-style
// change happens in one place. Desktop keeps the fixed w-56 rail; below `md`
// that rail is replaced by a top bar + slide-in Sheet.
//
// Brutalist chrome: solid surfaces framed in black, the active nav item is a
// filled color block (cobalt for owner, yellow for admin) so the two consoles
// stay visually distinct.
function Badge({ badge, dot }) {
  if (badge > 0) {
    return (
      <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-md border-2 border-foreground bg-destructive px-1 text-xs font-bold text-destructive-foreground">
        {badge > 9 ? '9+' : badge}
        <span className="sr-only"> unread</span>
      </span>
    );
  }
  if (dot) {
    return (
      <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-foreground bg-destructive">
        <span className="sr-only">New</span>
      </span>
    );
  }
  return null;
}

function NavList({ navItems, onNavigate, admin }) {
  return (
    <nav className="flex-1 space-y-1.5 px-3" aria-label="Main">
      {navItems.map(({ to, label, icon: Icon, end, badge, dot }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex min-h-11 items-center gap-3 rounded-md border-2 px-3 py-2.5 text-sm font-bold transition-all ${
              isActive
                ? admin
                  ? 'border-foreground bg-accent text-accent-foreground shadow-brut-sm'
                  : 'border-foreground bg-primary text-primary-foreground shadow-brut-sm'
                : 'border-transparent text-muted-foreground hover:border-foreground hover:bg-muted hover:text-foreground'
            }`
          }
        >
          <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">{label}</span>
          <Badge badge={badge} dot={dot} />
        </NavLink>
      ))}
    </nav>
  );
}

function Footer({ userLabel, onLogout }) {
  return (
    <div className="px-3 py-4">
      <p className="truncate px-3 py-2 font-mono text-xs text-muted-foreground" title={userLabel}>
        {userLabel}
      </p>
      <button
        type="button"
        onClick={onLogout}
        className="mt-1 flex min-h-11 w-full items-center gap-2 rounded-md border-2 border-transparent px-3 py-2 text-sm font-bold text-muted-foreground transition-colors hover:border-foreground hover:bg-destructive-soft hover:text-foreground"
      >
        <LogOut className="h-4 w-4" aria-hidden="true" />
        Log out
      </button>
    </div>
  );
}

function Brand({ to, subtitle, admin }) {
  return (
    <Link to={to} className="flex items-center gap-2.5 px-5 py-6">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border-2 border-foreground bg-primary shadow-brut-sm">
        <Tag className="h-5 w-5 text-primary-foreground" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="truncate font-display text-base font-bold leading-tight text-foreground">TagBack</p>
        {admin ? (
          <span className="mt-0.5 inline-block truncate rounded-md border-2 border-foreground bg-accent px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-accent-foreground">
            {subtitle}
          </span>
        ) : (
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
    </Link>
  );
}

// `admin` gives the shell a distinct identity from the owner dashboard: a
// yellow subtitle pill and yellow active nav blocks (owner uses cobalt).
// `tourId` marks both the desktop rail and the phone top bar for the guided
// tour; whichever is on screen gets highlighted.
export default function SidebarShell({ subtitle, homeTo, navItems, drawerItems, userLabel, onLogout, admin, tourId }) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const menuItems = drawerItems || navItems;
  const current = [...navItems, ...menuItems].find((n) => matchPath({ path: n.to, end: !!n.end }, pathname));
  // The dot only counts what is inside the drawer; tab-bar badges show themselves.
  const needsAttention = menuItems.some((n) => n.badge > 0 || n.dot);

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:border-2 focus:border-foreground focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-accent-foreground focus:shadow-brut"
      >
        Skip to content
      </a>

      {/* Desktop rail */}
      <aside data-tour={tourId} className="fixed inset-y-0 left-0 z-20 hidden w-56 shrink-0 flex-col border-r-2 border-foreground bg-card md:flex">
        <Brand to={homeTo} subtitle={subtitle} admin={admin} />
        <NavList navItems={navItems} admin={admin} />
        <Footer userLabel={userLabel} onLogout={onLogout} />
      </aside>

      {/* Mobile top bar + drawer */}
      <header data-tour={tourId} className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b-2 border-foreground bg-card px-4 py-2 md:hidden">
        <Link to={homeTo} className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border-2 border-foreground bg-primary">
            <Tag className="h-4 w-4 text-primary-foreground" aria-hidden="true" />
          </span>
          <span className="truncate font-display text-base font-bold text-foreground">
            {current ? current.label : 'TagBack'}
          </span>
          {admin && (
            <span className="shrink-0 rounded-md border-2 border-foreground bg-accent px-2 py-0.5 text-xs font-bold text-accent-foreground">
              Admin
            </span>
          )}
        </Link>
        <Sheet open={open} onOpenChange={setOpen}>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={needsAttention ? 'Open menu (new activity)' : 'Open menu'}
            className="relative flex h-11 w-11 items-center justify-center rounded-md border-2 border-foreground bg-card text-foreground shadow-brut-sm active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
            {needsAttention && <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full border border-foreground bg-destructive" aria-hidden="true" />}
          </button>
          <SheetContent side="left" className="flex w-64 flex-col gap-0 bg-card p-0">
            <SheetHeader className="p-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <Brand to={homeTo} subtitle={subtitle} admin={admin} />
            </SheetHeader>
            <NavList navItems={menuItems} onNavigate={() => setOpen(false)} admin={admin} />
            <Footer userLabel={userLabel} onLogout={onLogout} />
          </SheetContent>
        </Sheet>
      </header>
    </>
  );
}
