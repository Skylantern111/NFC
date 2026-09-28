import { useState } from 'react';
import { Link, NavLink, matchPath, useLocation } from 'react-router-dom';
import { LogOut, Menu, Tag } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../ui/sheet';

// Shared shell for DashboardSidebar/AdminSidebar (design system §14): same
// brand block, nav list, and logout footer for both consoles, so a rebrand
// or nav-style change only happens in one place. Desktop keeps the fixed
// w-56 rail; below `md` that rail is replaced by a top bar + slide-in Sheet.
//
// UI_UX_IMPROVEMENT_PLAN.md NAV1/NAV6: the mobile top bar names the current
// section, and the menu button carries a dot whenever something in the menu
// needs attention. A skip link jumps past the nav (A11Y6).
function Badge({ badge, dot }) {
  if (badge > 0) {
    return (
      <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-purple-600 to-pink-600 px-1 text-xs font-bold text-white">
        {badge > 9 ? '9+' : badge}
        <span className="sr-only"> unread</span>
      </span>
    );
  }
  if (dot) {
    return (
      <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-purple-500">
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
            `flex min-h-11 items-center gap-3 rounded-xl border-l-2 px-3 py-2.5 text-sm font-medium transition-all ${
              isActive
                ? admin
                  ? 'border-amber-500 bg-base text-purple-700 dark:text-purple-300 shadow-neu-pressed-sm'
                  : 'border-transparent bg-base text-purple-700 dark:text-purple-300 shadow-neu-pressed-sm'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100'
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
      <p className="truncate px-3 py-2 text-xs text-slate-600 dark:text-slate-400" title={userLabel}>
        {userLabel}
      </p>
      <button
        type="button"
        onClick={onLogout}
        className="mt-1 flex min-h-11 w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 transition-colors hover:text-red-600"
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
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 shadow-neu-flat-sm">
        <Tag className="h-5 w-5 text-white" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-base font-extrabold leading-tight text-slate-800 dark:text-slate-100">TagBack</p>
        {admin ? (
          <span className="mt-0.5 inline-block truncate rounded-full bg-amber-100 dark:bg-amber-500/15 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">
            {subtitle}
          </span>
        ) : (
          <p className="truncate text-xs text-slate-600 dark:text-slate-400">{subtitle}</p>
        )}
      </div>
    </Link>
  );
}

// `admin` gives the shell a small, deliberate identity distinct from the
// owner dashboard it's structurally copied from: an amber subtitle pill and
// an amber left-border on the active nav item.
export default function SidebarShell({ subtitle, homeTo, navItems, userLabel, onLogout, admin }) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const current = navItems.find((n) => matchPath({ path: n.to, end: !!n.end }, pathname));
  const needsAttention = navItems.some((n) => n.badge > 0 || n.dot);

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-xl focus:bg-base focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:shadow-neu-flat"
      >
        Skip to content
      </a>

      {/* Desktop rail */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-56 shrink-0 flex-col bg-base shadow-neu-flat md:flex">
        <Brand to={homeTo} subtitle={subtitle} admin={admin} />
        <NavList navItems={navItems} admin={admin} />
        <Footer userLabel={userLabel} onLogout={onLogout} />
      </aside>

      {/* Mobile top bar + drawer */}
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 bg-base px-4 py-2 shadow-neu-flat-sm md:hidden">
        <Link to={homeTo} className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 shadow-neu-flat-sm">
            <Tag className="h-4 w-4 text-white" aria-hidden="true" />
          </span>
          <span className="truncate text-base font-extrabold text-slate-800 dark:text-slate-100">
            {current ? current.label : 'TagBack'}
          </span>
          {admin && (
            <span className="shrink-0 rounded-full bg-amber-100 dark:bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
              Admin
            </span>
          )}
        </Link>
        <Sheet open={open} onOpenChange={setOpen}>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={needsAttention ? 'Open menu (new activity)' : 'Open menu'}
            className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-base text-slate-700 dark:text-slate-300 shadow-neu-flat-sm"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
            {needsAttention && <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-pink-600" aria-hidden="true" />}
          </button>
          <SheetContent side="left" className="flex w-64 flex-col gap-0 bg-base p-0">
            <SheetHeader className="p-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <Brand to={homeTo} subtitle={subtitle} admin={admin} />
            </SheetHeader>
            <NavList navItems={navItems} onNavigate={() => setOpen(false)} admin={admin} />
            <Footer userLabel={userLabel} onLogout={onLogout} />
          </SheetContent>
        </Sheet>
      </header>
    </>
  );
}
