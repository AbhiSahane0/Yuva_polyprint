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
 * What it shows depends on how the works costs ink. Under the Estimation
 * method the whole laydown is one flat GSM at one blended rate, so there is
 * nothing here to choose and the panel says what it used instead. Under the
 * Costing method each colour is priced on its own laydown and solids, and the
 * choice is the job's to make.
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

  const {
    settings,
    input,
    perColourInk,
    process,
    special,
    colourNames,
    toggle,
    setChosen,
    unusable,
  } = costing;

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

            And they only belong here at all when they are costed. The flat
            method reads one GSM and one rate; offering a picker beside it
            showed the office a control that moved nothing, and an unpriced
            metallic ticked in it used to refuse the whole quotation.
          */}
          {perColourInk ? (
            <fieldset className="mb-3">
              <legend className="text-ink-700 mb-2 text-sm font-medium">
                Colours it prints
                <span className="text-ink-400 ml-2 text-xs font-normal">
                  each is priced on its own laydown and solids
                </span>
              </legend>
              <div className="space-y-2">
                <ColourGroup
                  label="Process"
                  inks={process}
                  chosen={colourNames}
                  onToggle={toggle}
                />
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
            </fieldset>
          ) : (
            <p className="text-ink-600 mb-3 flex flex-wrap items-baseline gap-x-2 text-sm">
              <span className="text-ink-400 w-16 shrink-0 text-xs font-semibold tracking-wide uppercase">
                Ink
              </span>
              <span>
                {formatNumber(settings.inkGsm, 2)} gsm at Rs{' '}
                {formatNumber(input?.job.flatInk?.ratePerKg ?? 0, 2)}/kg
                <span className="text-ink-400">
                  {' '}
                  — {settings.defaultInkMaterial || 'no ink chosen'}, whatever colours print
                </span>
              </span>
            </p>
          )}

          <p className="text-ink-500 text-xs">
            {perColourInk ? (
              <>
                {colourNames.length} colour{colourNames.length === 1 ? '' : 's'}
                {colourNames.length !== line.colourCount
                  ? ` — the line charges for ${line.colourCount} cylinder${line.colourCount === 1 ? '' : 's'}`
                  : ''}{' '}
                ·{' '}
              </>
            ) : (
              <>
                {line.colourCount} cylinder{line.colourCount === 1 ? '' : 's'} ·{' '}
              </>
            )}
            {settings.defaultWastagePercent}% wastage · {settings.defaultMarginPercent}% margin ·{' '}
            {settings.defaultTrimMm} mm trim · adhesive {settings.defaultAdhesiveRatio} —{' '}
            <a href="/costing" className="text-brand-600 underline">
              change on Costing
            </a>
          </p>
        </>
      )}

      {perColourInk ? (
        <SpecialColourModal
          open={adding}
          onClose={() => setAdding(false)}
          onCreated={(name) => setChosen([...colourNames, name])}
        />
      ) : null}
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
