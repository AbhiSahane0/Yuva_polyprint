import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Where you are in making a quotation.
 *
 * A quotation is a long form, and the old single page gave no sense of how much
 * was left or what still needed doing. The steps are numbered because they are
 * genuinely sequential — a job cannot be priced before the customer is known,
 * and nothing can be previewed before there are jobs.
 *
 * Completed steps are clickable so the office can go back and correct something
 * without losing what they have typed; steps ahead are not, because they have
 * nothing to show yet.
 */

export interface Step {
  id: string;
  label: string;
}

export function StepIndicator({
  steps,
  current,
  furthest,
  onGoTo,
}: {
  steps: Step[];
  /** Zero-based index of the step being shown. */
  current: number;
  /** The furthest step reached, so earlier ones can be revisited. */
  furthest: number;
  onGoTo: (index: number) => void;
}) {
  return (
    <nav aria-label="Progress" className="w-full">
      <ol className="flex items-start">
        {steps.map((step, index) => {
          const done = index < furthest;
          const active = index === current;
          const reachable = index <= furthest;
          const last = index === steps.length - 1;

          return (
            <li key={step.id} className={cn('flex min-w-0 flex-1 flex-col', last && 'flex-none')}>
              <div className="flex w-full items-center">
                <button
                  type="button"
                  disabled={!reachable}
                  aria-current={active ? 'step' : undefined}
                  onClick={() => reachable && onGoTo(index)}
                  className={cn(
                    'focus-visible:ring-brand-500 flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold transition focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
                    active && 'border-brand-600 bg-brand-600 text-white',
                    done && !active && 'border-brand-600 bg-brand-600 text-white hover:opacity-85',
                    !done && !active && 'border-ink-200 text-ink-400 bg-white',
                    reachable ? 'cursor-pointer' : 'cursor-default',
                  )}
                >
                  {done && !active ? <Check className="size-4" aria-hidden /> : index + 1}
                </button>

                {/* The rail to the next step, filled as far as you have got. */}
                {last ? null : (
                  <span
                    aria-hidden
                    className={cn(
                      'mx-2 h-0.5 min-w-4 flex-1 rounded-full',
                      done ? 'bg-brand-600' : 'bg-ink-200',
                    )}
                  />
                )}
              </div>

              <span
                className={cn(
                  'mt-2 pr-2 text-xs leading-tight',
                  active ? 'text-ink-900 font-semibold' : 'text-ink-500',
                  // The last label would otherwise overhang the container.
                  last && 'pr-0 text-right',
                )}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
