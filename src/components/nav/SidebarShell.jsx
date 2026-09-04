import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { LogOut, Menu, Tag } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../ui/sheet';

// Shared shell for DashboardSidebar/AdminSidebar (design system §14): same
// brand block, nav list, and logout footer for both consoles, so a rebrand
// or nav-style change only happens in one place. Desktop keeps the fixed
// w-56 rail; below `md` that rail is replaced by a top bar + slide-in Sheet,
// since neither console previously had any mobile/tablet layout at all.
function NavList({ navItems, onNavigate }) {
  return (
    <nav className="flex-1 space-y-1.5 px-3">
      {navItems.map(({ to, label, icon: Icon, end, badge }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
              isActive ? 'bg-base text-purple-600 shadow-neu-pressed-sm' : 'text-slate-500 hover:text-slate-800'
            }`
          }
        >
          <Icon className="h-4 w-4 shrink-0" />
          <span className="flex-1">{label}</span>
          {badge > 0 && (
            <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-purple-500 to-pink-500 px-1 text-[11px] font-bold text-white">
              {badge > 9 ? '9+' : badge}
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

function Footer({ userLabel, settingsHref, onLogout }) {
  return (
    <div className="px-3 py-4">
      {settingsHref ? (
        <Link
          to={settingsHref}
          className="block truncate rounded-xl px-3 py-2 text-xs text-slate-500 transition-colors hover:text-slate-800"
          title="Account settings"
        >
          {userLabel}
        </Link>
      ) : (
        <p className="truncate rounded-xl px-3 py-2 text-xs text-slate-500">{userLabel}</p>
      )}
      <button
        type="button"
        onClick={onLogout}
        className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-500 transition-colors hover:text-red-500"
      >
        <LogOut className="h-4 w-4" />
        Logout
      </button>
    </div>
  );
}

function Brand({ to, subtitle }) {
  return (
    <Link to={to} className="flex items-center gap-2.5 px-5 py-6">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 shadow-neu-flat-sm">
        <Tag className="h-5 w-5 text-white" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-base font-extrabold leading-tight text-slate-800">TagBack</p>
        <p className="truncate text-xs text-slate-500">{subtitle}</p>
      </div>
    </Link>
  );
}

export default function SidebarShell({ subtitle, homeTo, navItems, userLabel, settingsHref, onLogout }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Desktop rail */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-56 shrink-0 flex-col bg-base shadow-neu-flat md:flex">
        <Brand to={homeTo} subtitle={subtitle} />
        <NavList navItems={navItems} />
        <Footer userLabel={userLabel} settingsHref={settingsHref} onLogout={onLogout} />
      </aside>

      {/* Mobile top bar + drawer */}
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 bg-base px-4 py-3 shadow-neu-flat-sm md:hidden">
        <Link to={homeTo} className="flex items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 shadow-neu-flat-sm">
            <Tag className="h-4 w-4 text-white" />
          </span>
          <span className="text-base font-extrabold text-slate-800">TagBack</span>
        </Link>
        <Sheet open={open} onOpenChange={setOpen}>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-base text-slate-600 shadow-neu-flat-sm"
          >
            <Menu className="h-5 w-5" />
          </button>
          <SheetContent side="left" className="flex w-64 flex-col gap-0 bg-base p-0">
            <SheetHeader className="p-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <Brand to={homeTo} subtitle={subtitle} />
            </SheetHeader>
            <NavList navItems={navItems} onNavigate={() => setOpen(false)} />
            <Footer userLabel={userLabel} settingsHref={settingsHref} onLogout={onLogout} />
          </SheetContent>
        </Sheet>
      </header>
    </>
  );
}
