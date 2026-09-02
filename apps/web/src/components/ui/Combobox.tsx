import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { cn } from '@/lib/utils';

/**
 * A text field with a dropdown of suggestions, which still accepts anything
 * typed into it.
 *
 * This replaces the native `<datalist>`. A datalist works, but the browser
 * draws its own arrow and its own popup, neither of which can be styled — so
 * next to our selects it looked like a different control from a different
 * application. Everything here is ours, so the two match.
 *
 * The field stays registered with react-hook-form as a normal input; picking a
 * suggestion writes through `onPick` so validation and dirty-tracking behave
 * exactly as they do when the value is typed.
 */
interface ComboboxProps {
  id: string;
  options: readonly string[];
  registration: UseFormRegisterReturn;
  onPick: (value: string) => void;
  /** Current field value, used to filter and to mark the active option. */
  value: string;
  placeholder?: string;
  invalid?: boolean;
  /**
   * False when `options` has already been narrowed by whoever supplied it.
   *
   * The local filter matches the typed text against the option strings, which
   * is right for a fixed list and wrong for a server-searched one: the customer
   * search matches a company's brand as well as its name, so typing "Ashoka"
   * returns ADF Foods Ltd — and filtering that again by company name threw the
   * only result away.
   */
  filterLocally?: boolean;
  /**
   * A second line under an option, when the label alone does not explain why it
   * is in the list. Used to show the brand a company matched on.
   */
  describe?: (option: string) => string | undefined;
}

export function Combobox({
  id,
  options,
  registration,
  onPick,
  value,
  placeholder,
  invalid,
  filterLocally = true,
  describe,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  // Typing narrows the list; an exact match shows everything again so the user
  // can still see the alternatives.
  const query = value.trim().toLowerCase();
  const exact = options.some((option) => option.toLowerCase() === query);
  const filtered =
    !filterLocally || query === '' || exact
      ? options
      : options.filter((o) => o.toLowerCase().includes(query));

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  function choose(option: string) {
    onPick(option);
    setOpen(false);
    setHighlighted(-1);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setHighlighted((current) => {
        const next = current + step;
        if (next < 0) return filtered.length - 1;
        if (next >= filtered.length) return 0;
        return next;
      });
      return;
    }
    if (event.key === 'Enter' && open && highlighted >= 0) {
      const option = filtered[highlighted];
      if (option) {
        // Only swallow the keypress when it actually picks something, so Enter
        // still submits the form otherwise.
        event.preventDefault();
        choose(option);
      }
    }
  }

  return (
    <div ref={wrapperRef} className="relative">
      <input
        {...registration}
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        onChange={(event) => {
          void registration.onChange(event);
          setOpen(true);
          setHighlighted(-1);
        }}
        className={cn(
          'w-full rounded-[var(--radius-md)] border bg-white px-3.5 py-2.5 pr-10 text-[15px]',
          'text-ink-900 placeholder:text-ink-400 focus:outline-none focus:ring-2',
          'focus:ring-brand-600/30 focus:border-brand-600',
          invalid ? 'border-danger-500' : 'border-ink-200',
        )}
      />

      <button
        type="button"
        tabIndex={-1}
        aria-label="Show suggestions"
        onClick={() => setOpen((current) => !current)}
        className="text-ink-400 hover:text-ink-700 absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer rounded p-1"
      >
        <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
      </button>

      {open && filtered.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          className="border-ink-200 absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-[var(--radius-md)] border bg-white py-1 shadow-[var(--shadow-elevated)]"
        >
          {filtered.map((option, index) => {
            const selected = option.toLowerCase() === query;
            return (
              <li key={option}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  // mousedown, not click: the input's blur would close the list
                  // before a click ever lands.
                  onMouseDown={(event) => {
                    event.preventDefault();
                    choose(option);
                  }}
                  onMouseEnter={() => setHighlighted(index)}
                  className={cn(
                    'block w-full cursor-pointer px-3.5 py-2 text-left text-sm',
                    index === highlighted ? 'bg-brand-50 text-brand-700' : 'text-ink-700',
                    selected && 'font-semibold',
                  )}
                >
                  {option}
                  {/*
                    Why this option is in the list, when its own text does not
                    say. A company found by its brand looks like a mistake
                    without it.
                  */}
                  {describe?.(option) ? (
                    <span className="text-ink-400 mt-0.5 block text-xs font-normal">
                      {describe(option)}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
