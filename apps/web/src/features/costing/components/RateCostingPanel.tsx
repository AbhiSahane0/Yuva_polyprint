import { useState, type ReactNode } from 'react';
import { Calculator, Plus } from 'lucide-react';
import { formatNumber, type Material } from '@yuva/shared';
import { cn } from '@/lib/utils';
import type { RateCosting, RateCostingLine } from '../api/use-rate-costing';
import { SpecialColourModal } from './SpecialColourModal';

/**
 * What a kilogram costs to make, and therefore what it should be sold for.
 *
 * This sits at the foot of a job because it can only answer once the job has
 * been described — the structure decides the weight, the weight decides the
 * running metres, and the metres decide how long every machine is occupied.
 * Asking for a rate before any of that is asking somebody to remember one.
 *
 * It **suggests**; it does not impose. The rate boxes stay exactly as they
 * were and Use writes the figure into them, because the works knows things
 * this does not — what the customer paid last year, and who else is quoting.
 */
export function RateCostingPanel({
  costing,
  line,
}: {
  /** Shared with the quantity rows below, so the two cannot disagree. */
  costing: RateCosting;
  line: RateCostingLine;
}) {
  const [adding, setAdding] = useState(false);

  /*
   * The colours are picked here rather than taken from the cylinder count
   * alone, because what they ARE changes the price: a white base coat lays 1.8
   * g/m² at 40% solids and a process colour lays 0.13 at 19.5%, so two jobs
   * with six cylinders each can differ by a third on ink.
   */
  const { settings, process, special, colourNames, toggle, setChosen, unusable } = costing;

  if (!settings) return null;

  return (
    <section className="border-brand-200 bg-brand-50/30 rounded-[var(--radius-lg)] border p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-ink-900 flex items-center gap-2 text-sm font-semibold">
          <Calculator className="text-brand-600 size-4" />
          What it costs to make
        </h3>
        <span className="text-ink-500 text-xs">
          Built from the machines and wages on the Costing screen
        </span>
      </div>

      {unusable ? (
        <p className="text-ink-500 text-sm">{unusable}</p>
      ) : (
        <>
          {/*
            Colours are the only thing here that belongs to the JOB. Wastage,
            margin, trim and the adhesive batch are what the works is, so they
            live on the Costing screen — repeating them on every job card
            invited four different answers to the same question, and the panel
            they cluttered is the one place the office looks for a price.
          */}
          <fieldset className="mb-4">
            <legend className="text-ink-700 mb-2 text-sm font-medium">
              Colours it prints
              <span className="text-ink-400 ml-2 text-xs font-normal">
                what they are changes the price — a white base coat lays 1.8 gsm against a process
                colour&apos;s 0.13
              </span>
            </legend>
            <div className="space-y-2">
              <ColourGroup label="Process" inks={process} chosen={colourNames} onToggle={toggle} />
              <ColourGroup
                label="Special"
                inks={special}
                chosen={colourNames}
                onToggle={toggle}
                empty="None yet — a Pantone, a metallic, an opaque white"
                action={
                  <button
                    type="button"
                    onClick={() => setAdding(true)}
                    className="border-brand-300 text-brand-700 hover:bg-brand-50 inline-flex cursor-pointer items-center gap-1 rounded-full border border-dashed px-3 py-1.5 text-xs font-medium"
                  >
                    <Plus className="size-3.5" />
                    Add a special colour
                  </button>
                }
              />
            </div>

            <p className="text-ink-500 mt-2 text-xs">
              {colourNames.length} colour{colourNames.length === 1 ? '' : 's'}
              {colourNames.length !== line.colourCount
                ? ` — the line charges for ${line.colourCount} cylinder${line.colourCount === 1 ? '' : 's'}`
                : ''}{' '}
              · {settings.defaultWastagePercent}% wastage · {settings.defaultMarginPercent}% margin
              · {settings.defaultTrimMm} mm trim · adhesive {settings.defaultAdhesiveRatio} —{' '}
              <a href="/costing" className="text-brand-600 underline">
                change on Costing
              </a>
            </p>
          </fieldset>
        </>
      )}

      <SpecialColourModal
        open={adding}
        onClose={() => setAdding(false)}
        onCreated={(name) => setChosen([...colourNames, name])}
      />
    </section>
  );
}

/**
 * One group of colour chips.
 *
 * An unpriced colour is marked before it is chosen rather than only after the
 * panel refuses it, so the office sees the gap while deciding rather than
 * being stopped by it afterwards.
 */
function ColourGroup({
  label,
  inks,
  chosen,
  onToggle,
  empty,
  action,
}: {
  label: string;
  inks: Material[];
  chosen: string[];
  onToggle: (name: string) => void;
  empty?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-ink-400 w-16 shrink-0 text-xs font-semibold tracking-wide uppercase">
        {label}
      </span>
      {inks.length === 0 && empty ? <span className="text-ink-400 text-xs">{empty}</span> : null}
      {inks.map((ink) => {
        const on = chosen.includes(ink.name);
        const priced = Boolean(ink.currentRate && ink.currentRate > 0);
        return (
          <label
            key={ink.id}
            title={priced ? undefined : 'No rate on the Rates screen'}
            className={cn(
              'inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs',
              on
                ? 'border-brand-500 bg-brand-600 text-white'
                : 'border-ink-200 text-ink-600 bg-white hover:bg-ink-50',
            )}
          >
            <input
              type="checkbox"
              className="sr-only"
              checked={on}
              onChange={() => onToggle(ink.name)}
            />
            {ink.name.replace(/^Ink\s*[—-]\s*/, '')}
            <span className={on ? 'text-white/70' : 'text-ink-400'}>
              {formatNumber(ink.laydownGsm ?? 0, 2)}
            </span>
            {!priced ? <span className={on ? 'text-white' : 'text-warning-600'}>!</span> : null}
          </label>
        );
      })}
      {action}
    </div>
  );
}
