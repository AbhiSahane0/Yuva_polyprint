import { useMemo, useState } from 'react';
import { Calculator, Info, Wand2 } from 'lucide-react';
import {
  costRate,
  unpricedColours,
  formatNumber,
  formatRs,
  type AppSettings,
  type CostingBreakdown,
  type CostingColour,
  type CostingInput,
  type CostingLayer,
  type Material,
} from '@yuva/shared';
import { Button } from '@/components/ui/Button';
import { useSettings } from '@/features/quotations/api/quotation-api';
import { cn } from '@/lib/utils';
import { useCostingMasterData } from '../api/costing-api';
import { CostingBreakdownModal } from './CostingBreakdownModal';

export interface RateCostingLine {
  /** The plies, in order. The first is the one that gets printed. */
  layers: CostingLayer[];
  /** The flat film one piece is cut from, in millimetres. */
  filmWidthMm: number;
  filmHeightMm: number;
  ups: number;
  /** One cylinder per colour, which is how many the line is charged for. */
  colourCount: number;
  makesPouches: boolean;
  /** The quantities being priced, in kilograms. */
  quantitiesKg: number[];
  /**
   * Pieces in a kilogram, as the quotation itself counts them. Passed so the
   * rate shown here is the rate the document ends up carrying.
   */
  piecesPerKg: number;
}

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
  line,
  materials,
  onUseRate,
}: {
  line: RateCostingLine;
  materials: Material[];
  /** Writes a computed rate into the quantity row it belongs to. */
  onUseRate: (index: number, ratePerKg: number) => void;
}) {
  const { data: settings } = useSettings();
  const { data: master } = useCostingMasterData();

  const [shown, setShown] = useState<CostingBreakdown | null>(null);

  /*
   * The colours are picked here rather than taken from the cylinder count
   * alone, because what they ARE changes the price: a white base coat lays 1.8
   * g/m² at 40% solids and a process colour lays 0.13 at 19.5%, so two jobs
   * with six cylinders each can differ by a third on ink.
   */
  const inks = useMemo(
    () =>
      materials.filter((material) => material.category === 'INK' && material.laydownGsm !== null),
    [materials],
  );

  const [chosen, setChosen] = useState<string[] | null>(null);
  const colourNames = chosen ?? inks.slice(0, Math.max(1, line.colourCount)).map((i) => i.name);
  /* A stable dependency: the array is rebuilt every render, its contents are not. */
  const colourKey = colourNames.join('|');

  const rate = (name: string): number =>
    materials.find((material) => material.name === name)?.currentRate ?? 0;

  /*
   * Colours chosen but not priced.
   *
   * A colour with no rate costs nothing, and nothing is a plausible-looking
   * number: a job printing white would quote at a twelfth of its real ink and
   * read perfectly normal. The same rule the unpriced film gauge follows —
   * refuse, and say which.
   */
  const unpriced = unpricedColours(
    colourNames
      .map((name) => inks.find((candidate) => candidate.name === name))
      .filter((ink): ink is Material => Boolean(ink))
      .map((ink) => ({
        name: ink.name,
        laydownGsm: ink.laydownGsm ?? 0,
        solidsPercent: ink.solidsPercent ?? 100,
        ratePerKg: ink.currentRate ?? 0,
      })),
  );

  const input: CostingInput | null = useMemo(() => {
    if (!settings || !master) return null;
    if (line.layers.length === 0) return null;

    const colours: CostingColour[] = colourNames
      .map((name) => inks.find((ink) => ink.name === name))
      .filter((ink): ink is Material => Boolean(ink))
      .map((ink) => ({
        name: ink.name,
        laydownGsm: ink.laydownGsm ?? 0,
        solidsPercent: ink.solidsPercent ?? 100,
        ratePerKg: ink.currentRate ?? 0,
      }));

    if (colours.length === 0) return null;

    return {
      job: {
        orderQtyKg: 0, // set per quantity below
        wastagePercent: settings.defaultWastagePercent,
        filmWidthMm: line.filmWidthMm,
        filmHeightMm: line.filmHeightMm,
        ups: line.ups,
        trimMm: settings.defaultTrimMm,
        layers: line.layers,
        colours,
        adhesive: {
          gsm: settings.adhesiveGsm,
          ratio: settings.defaultAdhesiveRatio,
          adhesiveRatePerKg: rate(settings.defaultAdhesiveMaterial),
          ethylAcetateRatePerKg: rate('Ethyl Acetate'),
          hardenerRatePerKg: rate('Hardener'),
        },
        solvent: {
          inkParts: 100,
          solventParts: settings.inkSolventParts,
          ethylAcetatePercent: settings.ethylAcetatePercent,
          ethylAcetateRatePerKg: rate('Ethyl Acetate'),
          tolueneRatePerKg: rate('Toluene'),
        },
        makesPouches: line.makesPouches,
        piecesPerKgOverride: line.piecesPerKg,
      },
      machines: master.machines,
      labour: master.labour,
      overheads: {
        workingDaysPerMonth: settings.workingDaysPerMonth,
        hoursPerDay: settings.hoursPerDay,
        transportPerKg: settings.transportPerKg,
        packingPerKg: settings.packingPerKg,
        otherPerJob: settings.otherPerJob,
        emiPerMonth: settings.emiPerMonth,
        emiHoursPerMonth: settings.emiHoursPerMonth,
        pouchMakingPerKg: settings.pouchMakingPerKg,
        stationSurcharges: [
          settings.stationSurcharge6,
          settings.stationSurcharge7,
          settings.stationSurcharge8,
        ],
        marginPercent: settings.defaultMarginPercent,
        marginBasis: settings.marginBasis,
      },
    };
  }, [settings, master, line, colourKey, materials, inks]);

  /*
   * One rate per quantity, not one rate. Setting a press takes the same hour
   * whether it runs 500 kg or 5,000, so the rate falls with the order — which
   * is the whole reason a quotation carries tiers.
   */
  const results = useMemo(
    () =>
      input
        ? line.quantitiesKg.map((qty) =>
            qty > 0 ? costRate({ ...input, job: { ...input.job, orderQtyKg: qty } }) : null,
          )
        : [],
    [input, line.quantitiesKg],
  );

  if (!settings || !master) return null;

  /*
   * Why it cannot answer yet, named precisely.
   *
   * "Add the film structure" was wrong and confusing on the commonest case:
   * a saved job fills in the microns but leaves the film unchosen, so the
   * structure is plainly there on screen while this had nothing to cost.
   */
  const unusable =
    master.machines.length === 0
      ? 'No machines on record — add a press on the Costing screen.'
      : line.layers.length === 0
        ? 'Choose a film for each ply above. A thickness on its own has no density or rate.'
        : inks.length === 0
          ? 'No ink has a laydown or solids figure yet. Set them on the Rates screen.'
          : line.quantitiesKg.every((quantity) => quantity <= 0)
            ? 'Enter a quantity below and the rate works itself out.'
            : unpriced.length > 0
              ? `${unpriced.join(', ')} ${unpriced.length === 1 ? 'has' : 'have'} no rate yet. Price ${unpriced.length === 1 ? 'it' : 'them'} on the Rates screen — costing a colour at nothing would quietly understate the job.`
              : null;

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
            <div className="flex flex-wrap gap-1.5">
              {inks.map((ink) => {
                const on = colourNames.includes(ink.name);
                return (
                  <label
                    key={ink.id}
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
                      onChange={() =>
                        setChosen(
                          on
                            ? colourNames.filter((name) => name !== ink.name)
                            : [...colourNames, ink.name],
                        )
                      }
                    />
                    {ink.name.replace(/^Ink\s*[—-]\s*/, '')}
                    <span className={on ? 'text-white/70' : 'text-ink-400'}>
                      {formatNumber(ink.laydownGsm ?? 0, 2)}
                    </span>
                    {/* Visible before it is chosen, not only after it refuses. */}
                    {!(ink.currentRate && ink.currentRate > 0) ? (
                      <span
                        title="No rate on the Rates screen"
                        className={on ? 'text-white' : 'text-warning-600'}
                      >
                        !
                      </span>
                    ) : null}
                  </label>
                );
              })}
            </div>
            <p className="text-ink-500 mt-2 text-xs">
              {colourNames.length} of {line.colourCount} cylinders ·{' '}
              {settings.defaultWastagePercent}% wastage · {settings.defaultMarginPercent}% margin ·{' '}
              {settings.defaultTrimMm} mm trim · adhesive {settings.defaultAdhesiveRatio} —{' '}
              <a href="/costing" className="text-brand-600 underline">
                change on Costing
              </a>
            </p>
          </fieldset>

          <div className="grid gap-2 sm:grid-cols-3">
            {results.map((result, index) =>
              result === null ? null : (
                <div
                  key={index}
                  className="border-ink-200 rounded-[var(--radius-md)] border bg-white p-3"
                >
                  <p className="text-ink-500 text-xs">
                    {formatNumber(line.quantitiesKg[index] ?? 0, 0)} kg
                  </p>
                  <p className="text-ink-900 mt-0.5 flex items-center gap-1.5 text-lg font-bold tabular-nums">
                    {formatRs(result.ratePerKg, 2)}
                    <button
                      type="button"
                      onClick={() => setShown(result)}
                      title="How this rate was worked out"
                      aria-label={`How the rate for ${formatNumber(line.quantitiesKg[index] ?? 0, 0)} kg was worked out`}
                      className="text-ink-400 hover:text-brand-600 cursor-pointer"
                    >
                      <Info className="size-4" />
                    </button>
                  </p>
                  <p className="text-ink-500 text-xs">
                    per kg · {formatRs(result.ratePerPiece, 2)} a piece
                  </p>
                  <p className="text-ink-500 mt-1 text-xs">
                    {formatNumber(result.marginOnRatePercent, 1)}% margin
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mt-2 w-full"
                    onClick={() => onUseRate(index, result.ratePerKg)}
                  >
                    <Wand2 className="size-4" />
                    Use this rate
                  </Button>
                </div>
              ),
            )}
          </div>
        </>
      )}

      <CostingBreakdownModal breakdown={shown} onClose={() => setShown(null)} />
    </section>
  );
}

export type { AppSettings };
