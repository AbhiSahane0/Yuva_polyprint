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
       * Gated like everything else now.
       *
       * These two used to be open to anyone signed in, on the reasoning that
       * what is due and when is the floor's question as much as the office's.
       * That was our call to make and it is no longer ours: the owner decides
       * who sees what, and a section with no tick box is a section they cannot
       * decide about. Tick it for the floor and nothing changes for them.
       */
      { to: '/orders', label: 'Orders', icon: ClipboardCheck, module: 'orders' },
      { to: '/dispatch', label: 'Dispatch', icon: PackageCheck, module: 'dispatch' },
    ],
  },
  {
    group: 'Materials',
    items: [
      { to: '/inventory', label: 'Inventory', icon: Package, module: 'inventory' },
      { to: '/purchase', label: 'Purchase', icon: Truck, module: 'purchase' },
      { to: '/rates', label: 'Rates', icon: IndianRupee, module: 'rates' },
      /* Its own module, not `rates`. This screen holds the wages, the machine
         tariffs and the margin — a different order of secret from the price of
         a film, and the owner should be able to show one without the other. */
      { to: '/costing', label: 'Costing', icon: Calculator, module: 'costing' },
    ],
  },
  {
    group: 'Production',
    items: [
      { to: '/planning', label: 'Planning', icon: CalendarClock, module: 'planning' },
      { to: '/production', label: 'Production', icon: Factory, module: 'production' },
      /* "Cylinder register" and not "Design & Cylinders", which read as a
         superset of the Designs screen above it and sent the office to the
         wrong one. Both are views of the same design; this is the one about
         the metal — which cylinders exist, where they are and what state they
         are in — and it is what the works calls it. */
      { to: '/cylinders', label: 'Cylinder register', icon: Disc3, module: 'cylinders' },
      { to: '/job-sheets', label: 'Job sheets', icon: ClipboardList, module: 'jobs' },
      /* The same stage as Production, so the same tick. */
      { to: '/quality', label: 'Quality & waste', icon: ShieldAlert, module: 'production' },
    ],
  },
  {
    /* The two things a job is run with, as against the job itself. The
       wireframe groups them this way and so does docs/flow.md. */
    group: 'Resources',
    items: [
      { to: '/machines', label: 'Machines', icon: Cog, module: 'resources' },
      { to: '/employees', label: 'Employees', icon: HardHat, module: 'resources' },
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
