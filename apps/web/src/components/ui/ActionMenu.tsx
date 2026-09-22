import { useEffect, useRef, useState } from 'react';
import { MoreVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MenuAction {
  label: string;
  onSelect: () => void;
  /** Red, for the one that destroys or ends something. */
  danger?: boolean;
  disabled?: boolean;
}

/**
 * The actions that do not fit, behind one button.
 *
 * **Used only below `sm`.** On a desktop the same actions are ordinary buttons
 * in a row — a menu there would hide three things that comfortably fit, and
 * cost a click to reach each of them. On a phone three buttons either wrap into
 * a stack that pushes the order's own figures below the fold, or get squeezed
 * to widths nobody can read. So the small screen gets one button and a sheet.
 *
 * Deliberately small: there is no submenu, no icons, no checkable items. It
 * closes on Escape, on a click outside, and on choosing something — which is
 * the whole of what a menu has to do to not be a trap on a touch screen.
 */
export function ActionMenu({
  actions,
  label = 'More actions',
  className,
}: {
  actions: MenuAction[];
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    /*
     * `pointerdown`, not `click`. A click listener fires after the button that
     * opened the menu has already toggled it, so tapping the button again
     * closed and reopened it in the same gesture and the menu never shut.
     */
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (actions.length === 0) return null;

  return (
    <div ref={root} className={cn('relative', className)}>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((on) => !on)}
        className="border-ink-200 text-ink-700 hover:bg-ink-50 focus-visible:outline-brand-600 inline-flex size-10 items-center justify-center rounded-[var(--radius-md)] border bg-white transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <MoreVertical className="size-4" aria-hidden />
      </button>

      {open ? (
        <div
          role="menu"
          className="border-ink-200 absolute right-0 z-20 mt-1 min-w-52 overflow-hidden rounded-[var(--radius-lg)] border bg-white py-1 shadow-[var(--shadow-elevated)]"
        >
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              disabled={action.disabled}
              onClick={() => {
                setOpen(false);
                action.onSelect();
              }}
              className={cn(
                'block w-full px-4 py-2.5 text-left text-sm transition-colors',
                'disabled:cursor-not-allowed disabled:opacity-50',
                action.danger
                  ? 'text-danger-600 hover:bg-danger-50 hover:text-danger-700'
                  : 'text-ink-700 hover:bg-ink-50 hover:text-ink-900',
              )}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
