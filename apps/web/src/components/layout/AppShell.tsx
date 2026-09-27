import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import {
  // Activity,
  Boxes,
  FileText,
  IndianRupee,
  LogOut,
  Menu,
  ShieldCheck,
  Disc3,
  Package,
  PackageCheck,
  Tablet,
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
    group: 'Commercial',
    items: [
      { to: '/customers', label: 'Customers', icon: Users, module: 'customers' },
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
      /* Leaves the shell behind — see the route. Here so the office can set a
         tablet up and see what the floor sees. */
      { to: '/floor', label: 'Machine screen', icon: Tablet },
      { to: '/cylinders', label: 'Design & Cylinders', icon: Disc3, module: 'cylinders' },
      { to: '/job-sheets', label: 'Job sheets', icon: ClipboardList, module: 'jobs' },
      /* No module, for the same reason as Production: the operator dropdown on
         a job card is what this is for, and the floor has to be able to read
         it. Adding somebody needs `jobs`, enforced on the API. */
      { to: '/employees', label: 'Employees', icon: HardHat },
      { to: '/jobs', label: 'Jobs', icon: Boxes, module: 'jobs', disabled: true },
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

/** Who is signed in, and the way out. Pinned to the bottom of the sidebar. */
function SessionFooter() {
  const user = useAuthStore((state) => state.user);
  const logout = useLogout();

  if (!user) return null;

  return (
    <div className="border-ink-200 absolute inset-x-0 bottom-0 border-t bg-white p-3">
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
      <aside className="border-ink-200 fixed inset-y-0 left-0 hidden w-60 overflow-y-auto border-r bg-white pb-28 lg:block">
        <div className="border-ink-200 flex h-14 items-center gap-2.5 border-b px-5">
          <Logo className="h-6" />
          <span className="text-ink-900 text-sm font-bold">Polyprint</span>
        </div>
        <NavContent />
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
          <aside className="absolute inset-y-0 left-0 w-64 overflow-y-auto bg-white pb-28 shadow-xl">
            <div className="border-ink-200 flex h-14 items-center justify-between border-b px-4">
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
            <NavContent onNavigate={() => setDrawerOpen(false)} />
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
