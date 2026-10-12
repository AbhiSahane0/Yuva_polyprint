import type { ReactNode } from 'react';
import { formatNumber } from '@yuva/shared';
import { Input, NumberInput } from '@/components/ui/Field';
import { TYPED } from '@/components/ui/Document';
import { cn } from '@/lib/utils';

/**
 * **The works' own job sheet, as the paper has it.**
 *
 * The office has filled this form in for years and knows it by its shape: the
 * grey band that starts a section, the yellow box that means "you type this",
 * the Total / Bal. / Cons. columns that read the same way on every row. The
 * screen is laid out to be recognised rather than admired — somebody holding
 * the paper should be able to find any figure on it without being taught.
 *
 * **Yellow means typed; white means worked out.** That is the one rule the
 * whole form runs on, and it is theirs: 237 cells on their spreadsheet are
 * yellow and every one of them is an input. Nothing here is yellow unless the
 * works types it, and nothing white can be typed into.
 */

/**
 * The works' own yellow, at a weight a screen can hold.
 *
 * Their workbook fills 237 cells with a highlighter yellow, which is right on
 * paper under a workshop light and wrong on a monitor somebody sits in front
 * of for an hour. Same signal, same meaning — a box a person fills in — pitched
 * down to where it reads as a field rather than as a warning. Shared with the
 * job card so the two documents are the same document.
 */
export const YELLOW = TYPED;

/** A band, as the sheet uses to start a section. The job card's band. */
export function Band({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="bg-ink-100 text-ink-700 -mx-4 mb-3 flex items-center justify-between gap-3 px-4 py-1.5 text-xs font-semibold tracking-wider uppercase">
      <span>{children}</span>
      {right ? <span className="text-ink-500 text-xs font-normal normal-case">{right}</span> : null}
    </div>
  );
}

/** A column heading, as it reads on the paper: Total, Bal., Cons. */
export function Head({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('text-ink-500 text-[11px] font-semibold tracking-wide', className)}>
      {children}
    </div>
  );
}

/** A box the works types in. Yellow, always. */
export function Typed({
  value,
  onChange,
  disabled,
  label,
  width = 'w-20',
  text,
  placeholder,
}: {
  value: number | string;
  onChange: (next: string) => void;
  disabled?: boolean;
  label: string;
  width?: string;
  /** Free text rather than a weight — a time, a name, a film. */
  text?: boolean;
  placeholder?: string;
}) {
  const Box = text ? Input : NumberInput;
  return (
    <Box
      className={cn(YELLOW, width, text ? '' : 'text-right')}
      aria-label={label}
      value={value === 0 ? '' : String(value)}
      disabled={disabled}
      placeholder={placeholder ?? ''}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

/**
 * A figure the sheet worked out. Never a box — nothing here can be typed, and
 * a white cell that looks like a box is an invitation to try.
 */
export function Worked({
  value,
  places = 3,
  className,
  suffix,
}: {
  value: number;
  places?: number;
  className?: string;
  suffix?: string;
}) {
  return (
    <div
      className={cn(
        'text-ink-900 border-ink-100 bg-ink-50/70 min-w-16 rounded border px-2 py-1.5 text-right text-sm tabular-nums',
        className,
      )}
    >
      {value === 0 ? <span className="text-ink-300">—</span> : formatNumber(value, places)}
      {value !== 0 && suffix ? <span className="text-ink-400 ml-0.5 text-xs">{suffix}</span> : null}
    </div>
  );
}

/** A label down the left of a row, as the sheet prints them. */
export function RowName({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('text-ink-800 w-36 shrink-0 text-sm font-medium', className)}>
      {children}
    </div>
  );
}
