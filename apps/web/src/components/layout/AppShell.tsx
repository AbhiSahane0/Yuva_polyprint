import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import {
  // Activity,
  Boxes,
  FileText,
  IndianRupee,
  LayoutDashboard,
  LogOut,
  Menu,
  ShieldAlert,
  ShieldCheck,
  Cog,
  Disc3,
  Package,
  PackageCheck,
  Truck,
  Users,
  X,
  Calculator,
  ClipboardList,
  ClipboardCheck,
  CalendarClock,
  Factory,
  HardHat,
} from 'lucide-react';
import type { AppModule } from '@yuva/shared';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/ui/Logo';
import { canAccess, useAuthStore } from '@/features/auth/auth-store';
import { useLogout } from '@/features/auth/api/auth-api';

interface NavItem {
  to: string;
  label: string;
  icon: typeof Users;
  /** The permission this item needs. Omitted for admin-only items. */
  module?: AppModule;
  /** Admin-only, regardless of module permissions. */
  adminOnly?: boolean;
  /** Modules that exist in the plan but are not built yet. */
  disabled?: boolean;
}

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: 'Overview',
    items: [{ to: '/overview', label: 'Overview', icon: LayoutDashboard }],
  },
  {
    group: 'Commercial',
    items: [
      { to: '/customers', label: 'Customers', icon: Users, module: 'customers' },
      /* With Customers, not with Production: this screen's question is whose
         artwork this is and what it is made of, and it is gated on the same
         module as the customer it belongs to. */
      { to: '/designs', label: 'Designs', icon: Boxes, module: 'customers' },
      { to: '/quotations', label: 'Quotations', icon: FileText, module: 'quotations' },
      /*
       * No module, on purpose. What is due and when is the floor's question as
       * much as the office's, so anyone signed in can read the orders; raising
       * or changing one needs `quotations`, enforced on that route and on the
       * API rather than by hiding the whole section.
       */
      { to: '/orders', label: 'Orders', icon: ClipboardCheck },
      { to: '/dispatch', label: 'Dispatch', icon: PackageCheck },
    ],
  },
  {
    group: 'Materials',
    items: [
      { to: '/inventory', label: 'Inventory', icon: Package, module: 'inventory' },
      { to: '/purchase', label: 'Purchase', icon: Truck, module: 'purchase' },
      { to: '/rates', label: 'Rates', icon: IndianRupee, module: 'rates' },
      { to: '/costing', label: 'Costing', icon: Calculator, module: 'rates' },
    ],
  },
  {
    group: 'Production',
    items: [
      /* No module: a job card is the floor's own document and the office
         watches it. Writing to it needs `jobs`, enforced on the API. */
      { to: '/planning', label: 'Planning', icon: CalendarClock },
      { to: '/production', label: 'Production', icon: Factory },
      { to: '/cylinders', label: 'Design & Cylinders', icon: Disc3, module: 'cylinders' },
      { to: '/job-sheets', label: 'Job sheets', icon: ClipboardList, module: 'jobs' },
      { to: '/quality', label: 'Quality & waste', icon: ShieldAlert },
    ],
  },
  {
    /* The two things a job is run with, as against the job itself. The
       wireframe groups them this way and so does docs/flow.md. */
    group: 'Resources',
    items: [
      /* No module, for the same reason as Production: the operator dropdown on
         a job card is what this is for, and the floor has to be able to read
         it. Adding somebody needs `jobs`, enforced on the API. */
      { to: '/machines', label: 'Machines', icon: Cog },
      { to: '/employees', label: 'Employees', icon: HardHat },
    ],
  },
  {
    group: 'Administration',
    items: [
      { to: '/users', label: 'Users', icon: ShieldCheck, adminOnly: true },
      // { to: '/monitor', label: 'Sign-in log', icon: Activity, adminOnly: true },
    ],
  },
];

function NavContent({ onNavigate }: { onNavigate?: () => void }) {
  const user = useAuthStore((state) => state.user);

  /*
   * Hiding a section is a courtesy, not the access control — the API refuses
   * these routes independently. It matters anyway: a sidebar full of things
   * that answer "you do not have access" makes the app feel broken rather
   * than tailored.
   */
  const sections = NAV.map((section) => ({
    ...section,
    items: section.items.filter((item) =>
      item.adminOnly ? user?.isAdmin === true : item.module ? canAccess(user, item.module) : true,
    ),
  })).filter((section) => section.items.length > 0);

  return (
    <nav className="flex flex-col gap-6 p-4">
      {sections.map((section) => (
        <div key={section.group}>
          <p className="text-ink-400 px-3 pb-2 text-xs font-semibold tracking-wider uppercase">
            {section.group}
          </p>
          <ul className="flex flex-col gap-0.5">
            {section.items.map((item) => (
              <li key={item.to}>
                {item.disabled ? (
                  <span
                    className="text-ink-300 flex cursor-not-allowed items-center gap-2.5 rounded-[var(--radius-md)] px-3 py-2 text-sm"
                    title="Not built yet"
                  >
                    <item.icon className="size-4" />
                    {item.label}
                  </span>
                ) : (
                  <NavLink
                    to={item.to}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-2.5 rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium',
                        isActive
                          ? 'bg-brand-50 text-brand-700'
                          : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
                      )
                    }
                  >
                    <item.icon className="size-4" />
                    {item.label}
                  </NavLink>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/**
 * Who is signed in, and the way out.
 *
 * **A flex row at the bottom of the column, not an absolutely positioned
 * one.** It used to be `absolute bottom-0`, and that anchors to the bottom of
 * the SCROLLABLE CONTENT rather than the visible panel — so the day the nav
 * grew past the height of the screen, the footer started scrolling with it and
 * sat on top of the last items. Machines could not be reached at all.
 */
function SessionFooter() {
  const user = useAuthStore((state) => state.user);
  const logout = useLogout();

  if (!user) return null;

  return (
    <div className="border-ink-200 shrink-0 border-t bg-white p-3">
      <div className="px-2 pb-2">
        <p className="text-ink-800 truncate text-sm font-medium">{user.displayName}</p>
        <p className="text-ink-400 truncate text-xs">
          {user.isAdmin ? 'Administrator' : user.username}
        </p>
      </div>
      <button
        type="button"
        onClick={() => logout.mutate()}
        className="text-ink-600 hover:bg-ink-100 hover:text-ink-900 flex w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium"
      >
        <LogOut className="size-4" />
        Sign out
      </button>
    </div>
  );
}

/** Office layout: persistent sidebar on desktop, slide-over drawer on mobile. */
export function AppShell({ children }: { children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="bg-ink-50 min-h-dvh">
      {/* Desktop sidebar */}
      {/*
        A column of three: a header that stays, a nav that scrolls, and a
        footer that stays. Only the middle one scrolls, which is what keeps
        the last nav item reachable however long the list grows.

        `min-h-0` on the scrolling child is load-bearing — a flex item will
        not shrink below its content without it, so the nav would push the
        footer off the bottom instead of scrolling.
      */}
      <aside className="border-ink-200 fixed inset-y-0 left-0 hidden w-60 flex-col border-r bg-white lg:flex">
        <div className="border-ink-200 flex h-14 shrink-0 items-center gap-2.5 border-b px-5">
          <Logo className="h-6" />
          <span className="text-ink-900 text-sm font-bold">Polyprint</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <NavContent />
        </div>
        <SessionFooter />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="bg-ink-900/50 absolute inset-0"
            onClick={() => setDrawerOpen(false)}
            aria-hidden
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-white shadow-xl">
            <div className="border-ink-200 flex h-14 shrink-0 items-center justify-between border-b px-4">
              <span className="flex items-center gap-2.5">
                <Logo className="h-6" />
                <span className="text-ink-900 text-sm font-bold">Polyprint</span>
              </span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close menu"
                className="text-ink-500 hover:bg-ink-100 cursor-pointer rounded-full p-1.5"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <NavContent onNavigate={() => setDrawerOpen(false)} />
            </div>
            <SessionFooter />
          </aside>
        </div>
      ) : null}

      <div className="lg:pl-60">
        <header className="border-ink-200 sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-white/95 px-4 backdrop-blur lg:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            className="text-ink-600 hover:bg-ink-100 cursor-pointer rounded-[var(--radius-md)] p-2"
          >
            <Menu className="size-5" />
          </button>
          <Logo className="h-6" />
          <span className="text-ink-900 text-sm font-bold">Polyprint</span>
        </header>

        <main>{children}</main>
      </div>
    </div>
  );
}
