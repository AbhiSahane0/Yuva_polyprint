import { POUCH_TYPES, POUCH_TYPE_LABELS, type JobKind, type PouchType } from '@yuva/shared';
import { cn } from '@/lib/utils';
import { PouchIcon } from './PouchIcon';

/**
 * What the customer receives, chosen as a picture rather than from a list.
 *
 * The old dropdown asked the office to know which of seven names matched the
 * drawing on the enquiry. A grid of constructions asks them to recognise it
 * instead, which is the thing they are actually good at.
 *
 * The choice carries more weight than it looks: the pouch style decides whether
 * the line is sold per kilogram or per piece, so this control silently sets the
 * pricing basis for everything downstream. That is stated on the cards rather
 * than left to be discovered on the next step.
 */

/** Roll sits alongside the pouch styles — it is a choice of the same kind. */
type Construction = { jobKind: JobKind; pouchType: PouchType | null };

const ROLL: Construction = { jobKind: 'ROLL', pouchType: null };

const OPTIONS: Construction[] = [
  ...POUCH_TYPES.map((pouchType) => ({ jobKind: 'POUCH' as const, pouchType })),
  ROLL,
];

function labelFor(option: Construction): string {
  return option.jobKind === 'ROLL' ? 'Roll' : POUCH_TYPE_LABELS[option.pouchType!];
}

/** Standup and standup-zipper are quoted per piece; everything else by weight. */
function basisFor(option: Construction): string {
  if (option.jobKind === 'ROLL') return 'Priced per kg';
  return option.pouchType === 'STANDUP' || option.pouchType === 'STANDUP_ZIPPER'
    ? 'Priced per pouch'
    : 'Priced per kg';
}

function isSame(a: Construction, b: Construction): boolean {
  return a.jobKind === b.jobKind && a.pouchType === b.pouchType;
}

export function ConstructionPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: Construction;
  onChange: (next: Construction) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="What the customer receives"
      className="grid grid-cols-2 gap-3 sm:grid-cols-4"
    >
      {OPTIONS.map((option) => {
        const selected = isSame(option, value);
        const label = labelFor(option);

        return (
          <button
            key={`${option.jobKind}-${option.pouchType ?? 'roll'}`}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(option)}
            className={cn(
              'group focus-visible:ring-brand-500 flex flex-col items-center gap-2 rounded-[var(--radius-lg)] border p-3 text-center transition focus-visible:ring-2 focus-visible:outline-none',
              'disabled:cursor-not-allowed disabled:opacity-50',
              selected
                ? 'border-brand-500 bg-brand-50/70 text-brand-700 shadow-[var(--shadow-card)]'
                : 'border-ink-200 text-ink-400 hover:border-ink-300 hover:bg-ink-50/60 bg-white',
            )}
          >
            {/* The drawing inherits the button's colour, so selection tints it. */}
            <span className="h-16 w-12">
              <PouchIcon jobKind={option.jobKind} pouchType={option.pouchType} />
            </span>
            <span
              className={cn(
                'text-sm leading-tight font-medium',
                selected ? 'text-brand-800' : 'text-ink-800',
              )}
            >
              {label}
            </span>
            <span className="text-ink-400 text-[11px] leading-none">{basisFor(option)}</span>
          </button>
        );
      })}
    </div>
  );
}

export type { Construction };
