import { ChevronDown } from 'lucide-react';
import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/lib/utils';

/**
 * Controls are deliberately roomy (44px tall, 15px text). This system is used
 * by people who have spent years in a spreadsheet — cramped inputs are the
 * fastest way to make it feel worse than what it replaces.
 */
const CONTROL =
  'w-full rounded-[var(--radius-md)] border bg-white px-3.5 py-2.5 text-[15px] text-ink-900 ' +
  'placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-600/30 ' +
  'focus:border-brand-600 disabled:bg-ink-50 disabled:text-ink-400';

interface FieldWrapperProps {
  label: string;
  htmlFor: string;
  error?: string | undefined;
  hint?: string | undefined;
  required?: boolean;
  children: ReactNode;
}

export function Field({ label, htmlFor, error, hint, required, children }: FieldWrapperProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-ink-700 text-sm font-medium">
        {label}
        {required ? (
          <span className="text-danger-600 ml-0.5" aria-hidden>
            *
          </span>
        ) : null}
      </label>
      {children}
      {error ? (
        <p className="text-danger-600 text-xs">{error}</p>
      ) : hint ? (
        <p className="text-ink-400 text-xs">{hint}</p>
      ) : null}
    </div>
  );
}

/** A labelled block of related fields, so a long form stays scannable. */
export function FieldSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h4 className="text-ink-800 text-xs font-semibold tracking-wider uppercase">{title}</h4>
        {description ? <p className="text-ink-500 mt-0.5 text-xs">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid, className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(CONTROL, invalid ? 'border-danger-500' : 'border-ink-200', className)}
      {...props}
    />
  );
});

interface NumberInputProps extends Omit<InputProps, 'type' | 'onChange'> {
  /** Whether a minus sign is allowed. Off by default — most figures cannot be. */
  allowNegative?: boolean;
  /** Fired with the raw string, exactly like a text input. */
  onChange?: InputHTMLAttributes<HTMLInputElement>['onChange'];
}

/**
 * A box that only takes a number, and does not fight you over a leading zero.
 *
 * Two problems with a plain input, both of which the office hits daily.
 *
 * **Letters get in.** `type="number"` is not the answer: it silently reports an
 * empty string for anything it cannot parse, so "12abc" arrives as "" and the
 * figure that was typed is gone. It also brings spinner arrows that nudge a
 * quantity when the page scrolls. So the type stays `text` with a numeric
 * keypad, and non-numeric keystrokes are refused before they land.
 *
 * **A default of 0 becomes a prefix.** A field showing `0` is a field somebody
 * types into, and typing 5 leaves `05` — which parses as 5 and looks like a
 * mistake, or leaves `0210` where 210 was meant. Selecting the contents on
 * focus makes the first keystroke replace a lone zero, which is what everybody
 * expects, while a real figure stays selected and can still be edited rather
 * than being destroyed.
 */
export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(function NumberInput(
  { allowNegative = false, onChange, onFocus, className, ...props },
  ref,
) {
  const pattern = allowNegative ? /^-?\d*\.?\d*$/ : /^\d*\.?\d*$/;

  return (
    <input
      ref={ref}
      /*
       * Text, not number. `type="number"` reports "" for anything it cannot
       * parse, so a stray letter erases the whole figure — and its spinners
       * change a quantity when somebody scrolls the page with the cursor over
       * the box.
       */
      type="text"
      inputMode={allowNegative ? 'text' : 'decimal'}
      autoComplete="off"
      aria-invalid={props.invalid || undefined}
      onFocus={(event) => {
        // A lone zero is a placeholder somebody means to replace. Selecting it
        // means the first keystroke does that rather than appending to it.
        event.target.select();
        onFocus?.(event);
      }}
      onChange={(event) => {
        // Refused rather than stripped: silently deleting a character as it is
        // typed reads as a broken keyboard, where nothing happening reads as
        // "that key does not belong here".
        if (!pattern.test(event.target.value)) return;
        onChange?.(event);
      }}
      className={cn(
        CONTROL,
        'tabular-nums',
        props.invalid ? 'border-danger-500' : 'border-ink-200',
        className,
      )}
      {...props}
    />
  );
});

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

/**
 * A native select with a drawn chevron.
 *
 * `appearance: none` strips the browser's own arrow, so without one of our own
 * the control is indistinguishable from a text box and nobody realises it can
 * be opened. The icon is a real element rather than a CSS background image
 * because arbitrary data-URI backgrounds do not survive the Tailwind class
 * parser reliably.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { invalid, className, children, ...props },
  ref,
) {
  return (
    <div className="relative">
      <select
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          CONTROL,
          'cursor-pointer appearance-none pr-10',
          invalid ? 'border-danger-500' : 'border-ink-200',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="text-ink-400 pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2"
        aria-hidden
      />
    </div>
  );
});

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid, className, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        CONTROL,
        'resize-y',
        invalid ? 'border-danger-500' : 'border-ink-200',
        className,
      )}
      {...props}
    />
  );
});

/**
 * A value the system owns — generated or calculated — shown in the same visual
 * rhythm as an input so the form still reads as one grid, but visibly not
 * editable. Explaining WHY it cannot be typed into matters more than the
 * styling: a greyed-out box with no reason reads like a bug.
 */
export function ReadOnlyValue({
  value,
  placeholder = 'Calculated on save',
}: {
  value: string | null | undefined;
  placeholder?: string;
}) {
  const empty = value === null || value === undefined || value === '' || value === 'NA';
  return (
    <div
      aria-readonly="true"
      className={cn(
        'border-ink-200 bg-ink-50 flex min-h-[46px] w-full items-center rounded-[var(--radius-md)]',
        'border border-dashed px-3.5 py-2.5 text-[15px]',
        empty ? 'text-ink-400 italic' : 'text-ink-700 font-medium',
      )}
    >
      {empty ? placeholder : value}
    </div>
  );
}
