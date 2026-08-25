import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { Boxes, FileText, Menu, Users, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  to: string;
  label: string;
  icon: typeof Users;
  /** Modules that exist in the plan but are not built yet. */
  disabled?: boolean;
}

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: 'Commercial',
    items: [
      { to: '/customers', label: 'Customers', icon: Users },
      { to: '/quotations', label: 'Quotations', icon: FileText },
    ],
  },
  {
    group: 'Production',
    items: [{ to: '/jobs', label: 'Jobs', icon: Boxes, disabled: true }],
  },
];

function NavContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-6 p-4">
      {NAV.map((section) => (
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

/** Office layout: persistent sidebar on desktop, slide-over drawer on mobile. */
export function AppShell({ children }: { children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="bg-ink-50 min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="border-ink-200 fixed inset-y-0 left-0 hidden w-60 border-r bg-white lg:block">
        <div className="border-ink-200 flex h-14 items-center gap-2 border-b px-5">
          <div className="bg-brand-600 size-6 rounded-md" />
          <span className="text-ink-900 text-sm font-bold">Yuva Polyprint</span>
        </div>
        <NavContent />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="bg-ink-900/50 absolute inset-0"
            onClick={() => setDrawerOpen(false)}
            aria-hidden
          />
          <aside className="absolute inset-y-0 left-0 w-64 bg-white shadow-xl">
            <div className="border-ink-200 flex h-14 items-center justify-between border-b px-4">
              <span className="text-ink-900 text-sm font-bold">Yuva Polyprint</span>
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
          <span className="text-ink-900 text-sm font-bold">Yuva Polyprint</span>
        </header>

        <main>{children}</main>
      </div>
    </div>
  );
}
