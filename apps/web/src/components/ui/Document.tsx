import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * **The pieces every works document is built from.**
 *
 * A job card and a job sheet are two halves of one job, and until these existed
 * they were two different-looking screens: one of them airy, labelled in small
 * caps, with its figures set as text; the other a grid of hard yellow cells
 * ruled like the spreadsheet it came from. Side by side, the second read as
 * unfinished — the works' paper has that look because it is paper, and copying
 * it pixel for pixel is not the same as designing for it.
 *
 * So the vocabulary lives here and both documents speak it:
 *
 * - **`Band`** opens a department or a block. Quiet, uppercase, letter-spaced.
 * - **`Shown`** is a figure the document worked out. A label above it and
 *   nothing around it — a box would invite somebody to type in it.
 * - **`TYPED`** is the one piece of the works' own formatting that carries
 *   meaning rather than decoration: a pale yellow fill on anything a person
 *   fills in. Theirs is a highlighter yellow on paper; this is the same signal
 *   at a weight a screen can hold for an hour without tiring anybody.
 * - **`Answer`** is the figure the document exists to produce — final time on a
 *   card, cost per kilogram on a sheet. One per document.
 */

/** A box somebody has to fill in. The works marks its own inputs yellow. */
export const TYPED = 'bg-[#FFFDE7] border-[#E6D98A] focus:border-[#CBB94A]';

/** The head of a block, as the document groups itself. */
export function Band({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div className="bg-ink-100 text-ink-700 -mx-4 mt-4 mb-2.5 flex items-center justify-between gap-3 px-4 py-1 text-xs font-semibold tracking-wider uppercase first:mt-0">
      <span>{title}</span>
      {right ? <span className="text-ink-500 normal-case">{right}</span> : null}
    </div>
  );
}

/** A figure the document worked out. Never a box: nothing here is typed. */
export function Shown({
  label,
  value,
  note,
  wide,
  tone,
}: {
  label: string;
  value: ReactNode;
  /** A word under the figure — where it came from, or what it means. */
  note?: string;
  wide?: boolean;
  tone?: 'default' | 'good' | 'bad';
}) {
  return (
    <div className={cn('min-w-0', wide && 'sm:col-span-2')}>
      <div className="text-ink-500 text-[11px] font-medium tracking-wide uppercase">{label}</div>
      <div
        className={cn(
          'mt-0.5 truncate text-sm leading-tight font-medium tabular-nums',
          tone === 'good' && 'text-success-700',
          tone === 'bad' && 'text-danger-700',
          (!tone || tone === 'default') && 'text-ink-900',
        )}
      >
        {value || '—'}
      </div>
      {note ? <div className="text-ink-400 mt-0.5 truncate text-[11px]">{note}</div> : null}
    </div>
  );
}

/**
 * The one figure the document builds to.
 *
 * `size="large"` is for a document whose whole purpose is the number — the
 * costing. A card's final time is the ordinary size, beside the fields that
 * produced it.
 */
export function Answer({
  label,
  value,
  note,
  size = 'normal',
}: {
  label: string;
  value: string;
  note?: string;
  size?: 'normal' | 'large';
}) {
  return (
    <div
      className={cn(
        'border-brand-200 bg-brand-50/60 rounded-md border',
        size === 'large' ? 'px-4 py-2.5' : 'px-3 py-2',
      )}
    >
      <div className="text-brand-700 text-[11px] font-semibold tracking-wide uppercase">
        {label}
      </div>
      <div
        className={cn(
          'text-ink-900 mt-0.5 font-bold tabular-nums',
          size === 'large' ? 'text-[28px] leading-none' : 'text-lg',
        )}
      >
        {value}
      </div>
      {note ? <div className="text-brand-700/80 mt-1 text-[11px]">{note}</div> : null}
    </div>
  );
}

/** One sheet of the document: white, bordered, with bands inside it. */
export function DocCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn('border-ink-200 rounded-lg border bg-white px-4 py-3', className)}>
      {children}
    </section>
  );
}
