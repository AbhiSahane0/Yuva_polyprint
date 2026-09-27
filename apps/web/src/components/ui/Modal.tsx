import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg' | 'xl';
}

/** What counts as somewhere to start typing. */
const FIELDS =
  'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])';

/**
 * Dialog with the accessibility basics people actually notice when they are
 * missing: Escape closes, background scroll is locked, focus lands inside on
 * open and Tab is trapped, and the click-outside target is the backdrop only.
 *
 * **Two things here are load-bearing, and both were once wrong at the same
 * time — which is how a lorry's number could not be typed into a dispatch note.**
 *
 * `onClose` is held in a ref and kept out of the effect's dependencies. Every
 * caller passes an inline arrow, so its identity changes on every render of the
 * parent; with it in the dependencies, each keystroke in a dialog tore the
 * effect down and set it up again — and setting it up focuses something. The
 * ref keeps the handler current without the effect ever re-running.
 *
 * And the focus goes to the first **field**, looked for in the content area
 * alone. `querySelector('input, …, button')` returns the first match in
 * document order, and the close button in the header beats every input below
 * it, so dialogs opened with the X focused and put it back there after each
 * letter. Where there is nothing to fill in, the footer's first button gets it
 * — which is what ConfirmDialog means by putting Cancel first.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLElement>(null);

  /* The current handler, without making the effect depend on its identity. */
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables || focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);

    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    /*
     * Somewhere to start typing, so keyboard users begin inside the dialog: the
     * first field, else the first thing in the footer, else the close button.
     * Never the close button while there is a field — see above.
     */
    const timer = window.setTimeout(() => {
      const field = bodyRef.current?.querySelector<HTMLElement>(FIELDS);
      const footerFirst = footerRef.current?.querySelector<HTMLElement>('button:not([disabled])');
      const anything = panelRef.current?.querySelector<HTMLElement>('button:not([disabled])');
      (field ?? footerFirst ?? anything)?.focus();
    }, 0);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
      window.clearTimeout(timer);
      previouslyFocused?.focus?.();
    };
    /*
     * `open` alone. See the note above: anything else in here re-runs the whole
     * setup — and the focus with it — on every render of the parent.
     */
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/50 p-0 sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={cn(
          'flex max-h-[92dvh] w-full flex-col overflow-hidden bg-white shadow-[var(--shadow-elevated)]',
          'rounded-t-[var(--radius-xl)] sm:rounded-[var(--radius-xl)]',
          size === 'xl' ? 'sm:max-w-5xl' : size === 'lg' ? 'sm:max-w-3xl' : 'sm:max-w-xl',
        )}
      >
        <header className="border-ink-200 flex items-start justify-between gap-4 border-b px-5 py-4">
          <div>
            <h2 id="modal-title" className="text-ink-900 text-base font-semibold">
              {title}
            </h2>
            {description ? <p className="text-ink-500 mt-0.5 text-sm">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="text-ink-400 hover:bg-ink-100 hover:text-ink-700 -mr-1 cursor-pointer rounded-full p-1.5"
          >
            <X className="size-5" />
          </button>
        </header>

        <div ref={bodyRef} className="flex-1 overflow-y-auto px-5 py-4">
          {children}
        </div>

        {footer ? (
          <footer
            ref={footerRef}
            className="border-ink-200 bg-ink-25 flex justify-end gap-2 border-t px-5 py-3"
          >
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
