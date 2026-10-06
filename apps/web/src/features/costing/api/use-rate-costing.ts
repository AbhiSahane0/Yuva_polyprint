import { useMemo } from 'react';
import {
  defaultMarginFor,
  adhesiveGsmFor,
  costRate,
  parseStationSteps,
  inkGsmFor,
  unpricedColours,
  wastagePercentFor,
  type CostingBreakdown,
  type CostingColour,
  type CostingInput,
  type CostingLayer,
  type Material,
  type PouchType,
} from '@yuva/shared';
import { useSettings } from '@/features/quotations/api/quotation-api';
import { useCostingMasterData } from './costing-api';

/**
 * Below this, a rate says more about the setup than about the film.
 *
 * A press is set for an hour whichever quantity follows it, so a fraction of a
 * kilogram carries the whole of that hour and prices at thousands of rupees a
 * kilogram. True, and useless.
 */
export const MIN_COSTABLE_KG = 1;

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
  /** The two ticks that choose the making band — see `pouchMakingPerKgFor`. */
  isGazette?: boolean;
  hasDPunch?: boolean;
  /**
   * The style, and the finished width the zipper would cross.
   *
   * What making one pouch costs depends on both: a zipper is charged by the
   * metre across the mouth, a D punch adds its punch. The width is the pouch's
   * own, not the flat film's — a bottom gusset lengthens the sheet without
   * widening the mouth.
   */
  pouchType: PouchType | null;
  pouchWidthMm: number;
  /**
   * The inks the line prints, already priced from the rates list.
   *
   * Empty on a line written before colours were chosen at all, and that is what
   * keeps it on the works' blended ink rate — there is nothing to price colour
   * by colour without colours.
   */
  colours: CostingColour[];
  /** The quantities being priced, in kilograms. */
  quantitiesKg: number[];
  /**
   * Pieces in a kilogram, as the quotation itself counts them. Passed so the
   * rate shown is the rate the document ends up carrying.
   */
  piecesPerKg: number;
}

/**
 * Figures this quotation overrides, or null/undefined to follow the works'.
 *
 * Margin, transport and pouch making are the three the client varies job to
 * job — their own sheets set all three by hand — so they are on the quotation
 * as well as on the Costing screen. Anything left unset follows the works',
 * which is what an ordinary job means.
 */
export interface RateCostingOverrides {
  marginPercent?: number | null;
  transportPerKg?: number | null;
  pouchMakingPerKg?: number | null;
  wastagePercent?: number | null;
  /**
   * The quotation's own date, so it is costed on the figures of that day.
   *
   * Not an override — the date is a fact about the quotation — but it travels
   * with them because it decides the same thing: which overheads apply. The
   * server has always priced at the quotation's date; the screen priced at
   * today's, so opening an older quotation showed a rate the server would
   * never have stored.
   */
  onDate?: string;
}

/**
 * What each quantity on a line costs to make.
 *
 * A hook rather than something one screen keeps to itself, because two places
 * need the same answer: the rate box, which fills itself in, and the quantity
 * rows beneath it, which say what margin that rate actually earns. Computing it
 * twice would let the two disagree about the same job on the same screen.
 */
export function useRateCosting(
  line: RateCostingLine,
  materials: Material[],
  overrides: RateCostingOverrides = {},
) {
  const { data: settings } = useSettings(overrides.onDate);
  /* As at the quotation's date, like the settings beside it — see the custom
     overheads below, which are the only part of it that is dated. */
  const { data: master } = useCostingMasterData(false, overrides.onDate);

  const inks = useMemo(
    () =>
      materials.filter((material) => material.category === 'INK' && material.laydownGsm !== null),
    [materials],
  );

  /*
   * Which colours the job prints.
   *
   * **Chosen on the line now.** There was a picker here once, taken out because
   * under the works' own settings the choice moved nothing: ink was the
   * Estimation sheet's flat GSM at one blended rate, and the same job came to
   * Rs 233.76/kg on CMYK, on CMYK + Gold and on CMYK + White alike. A control
   * that moves nothing teaches the office something false about their own
   * quotations.
   *
   * What changed is that the colours now decide the ink as well as the
   * cylinders, so the list is the office's and not a guess off the catalogue —
   * and a line that names none is still priced the old way, because there is
   * nothing to price colour by colour without colours.
   */
  /* A stable dependency: the array is rebuilt every render, its contents are not. */
  const colourKey = line.colours.map((colour) => `${colour.name}:${colour.ratePerKg}`).join('|');

  /**
   * Whether this line's ink is priced on what it prints.
   *
   * The method follows the data rather than a setting. A line that names its
   * colours is costed the Costing sheet's way — each colour on its own laydown,
   * solids and rate. One that names none has only the works' blended figure to
   * be priced at, which is also what every quotation written before colours
   * existed was priced at, so those do not move.
   */
  const perColourInk = line.colours.length > 0;

  /*
   * Colours chosen but not priced.
   *
   * A colour with no rate costs nothing, and nothing is a plausible-looking
   * number: a job printing white would quote at a twelfth of its real ink and
   * read perfectly normal. The same rule the unpriced film gauge follows —
   * refuse, and say which.
   */
  const unpriced = unpricedColours(line.colours);

  const rate = (name: string): number =>
    materials.find((material) => material.name === name)?.currentRate ?? 0;

  /** Stable across renders, so the memo below does not rerun on every keystroke. */
  const overrideKey = [
    overrides.marginPercent,
    overrides.transportPerKg,
    overrides.pouchMakingPerKg,
    /* Left out until now, so a wastage typed on the quotation changed nothing
       until some OTHER figure moved and dragged the costing with it. Wastage
       inflates the film bought and film is four-fifths of a rate, so it is
       about the worst one to miss. */
    overrides.wastagePercent,
    overrides.onDate,
    /* So a costing recomputes when the works adds or ends an overhead, which
       the object identity of `master` alone would not guarantee. */
    (master?.overheads ?? []).map((o) => `${o.id}:${o.amount}:${o.basis}`).join(','),
  ].join('|');

  /** A blank box means "follow the works' figure", which is not the same as 0. */
  const pick = (value: number | null | undefined, fallback: number): number =>
    value === null || value === undefined || !Number.isFinite(value) ? fallback : value;

  const input: CostingInput | null = useMemo(() => {
    if (!settings || !master) return null;
    if (line.layers.length === 0) return null;

    return {
      job: {
        orderQtyKg: 0, // set per quantity below
        wastagePercent: wastagePercentFor({
          pouchType: line.pouchType,
          override: overrides.wastagePercent,
          defaultWastagePercent: settings.defaultWastagePercent,
          pouchWastagePercent: settings.pouchWastagePercent,
        }),
        filmWidthMm: line.filmWidthMm,
        filmHeightMm: line.filmHeightMm,
        ups: line.ups,
        trimMm: settings.defaultTrimMm,
        layers: line.layers,
        colours: line.colours,
        /* The Estimation sheet's blended figure, not a purchase rate. */
        flatInk: { ratePerKg: rate(settings.defaultFlatInkMaterial) },
        adhesive: {
          /* Worked out from the structure, as the sheet does. */
          gsm: adhesiveGsmFor(line.layers, {
            thinGsm: settings.adhesiveCoatThinGsm,
            thickGsm: settings.adhesiveCoatThickGsm,
            thickPlyMicron: settings.adhesiveThickPlyMicron,
          }),
          flatRatePerKg: rate(settings.defaultFlatAdhesiveMaterial),
          ratio: settings.defaultAdhesiveRatio,
          adhesiveRatePerKg: rate(settings.defaultAdhesiveMaterial),
          ethylAcetateRatePerKg: rate(settings.defaultEthylAcetateMaterial),
          hardenerRatePerKg: rate(settings.defaultHardenerMaterial),
        },
        solvent: {
          inkParts: 100,
          solventParts: settings.inkSolventParts,
          ethylAcetatePercent: settings.ethylAcetatePercent,
          ethylAcetateRatePerKg: rate(settings.defaultEthylAcetateMaterial),
          tolueneRatePerKg: rate(settings.defaultTolueneMaterial),
        },
        makesPouches: line.makesPouches,
        isGazette: line.isGazette ?? false,
        hasDPunch: line.hasDPunch ?? false,
        pouchType: line.pouchType,
        pouchWidthMm: line.pouchWidthMm,
        piecesPerKgOverride: line.piecesPerKg,
        /* The works weighs the laminate with its own ink figure, and it has
           two — see `inkGsmFor`. */
        inkGsmOverride: inkGsmFor({
          pouchType: line.pouchType,
          inkGsm: settings.inkGsm,
          pouchInkGsm: settings.pouchInkGsm,
        }),
        /* One cylinder per station, which is what the line is charged for. */
        stationCount: line.colourCount,
        adhesiveSplitRatio: settings.adhesiveSplitRatio,
      },
      /*
       * A press's station motors come on as colours are added — the catalogue
       * holds that as "3,4,6" and the engine wants the numbers.
       */
      machines: master.machines.map((machine) => ({
        ...machine,
        stationColourSteps: parseStationSteps(machine.stationColourSteps),
      })),
      labour: master.labour,
      overheads: {
        workingDaysPerMonth: settings.workingDaysPerMonth,
        hoursPerDay: settings.hoursPerDay,
        transportPerKg: pick(overrides.transportPerKg, settings.transportPerKg),
        packingPerKg: settings.packingPerKg,
        otherPerJob: settings.otherPerJob,
        emiPerMonth: settings.emiPerMonth,
        emiHoursPerMonth: settings.emiHoursPerMonth,
        emiBasis: settings.emiBasis,
        /* How the works' own time is recovered, and what a day of it costs. */
        rateModel: settings.rateModel,
        worksDayCost: settings.worksDayCost,
        makeReadyDays: settings.makeReadyDays,
        machineMinutesPerDay: settings.machineMinutesPerDay,
        kgPerDay: settings.kgPerDay,
        pouchMaking: {
          makingPerPouch: settings.pouchMakingPerPouch,
          dPunchPerPouch: settings.dPunchPerPouch,
          dPunchLargePerPouch: settings.dPunchLargePerPouch,
          dPunchLargeAboveMm: settings.dPunchLargeAboveMm,
          zipperRatePerMetre: settings.zipperRatePerMetre,
        },
        /* The works' three per-kilogram bands, which supersede the per-pouch
           rate above for anything priced since October 2026. */
        pouchMakingBands: {
          plainPerKg: settings.pouchMakingPlainPerKg,
          gussetPerKg: settings.pouchMakingGussetPerKg,
          gussetHandlePerKg: settings.pouchMakingGussetHandlePerKg,
        },
        /* The office's own figure replaces the whole charge, in the unit it is
           stated in. Null lets the style decide. */
        pouchMakingPerKgOverride: overrides.pouchMakingPerKg ?? null,
        /*
         * The works' own overheads, as at this quotation's date.
         *
         * `master` is fetched for the date too, so a document written in 2022
         * is costed with the overheads that were live then — which is usually
         * none of them, and is why adding one today moves nothing already on
         * file.
         */
        customOverheads: master.overheads.map((overhead) => ({
          name: overhead.name,
          basis: overhead.basis,
          amount: overhead.amount,
        })),
        stationSurcharges: [
          settings.stationSurcharge6,
          settings.stationSurcharge7,
          settings.stationSurcharge8,
        ],
        /*
         * A placeholder. The real figure is chosen per QUANTITY below, because
         * the works asks more of a small order than a large one and a
         * quotation prices two or three at once — one margin for the whole
         * document would make at least one of its own tiers wrong.
         */
        marginPercent: pick(overrides.marginPercent, settings.defaultMarginPercent),
        marginBasis: settings.marginBasis,
        /*
         * The method follows the data: a line that names its colours is priced
         * on them, one that names none on the works' blended figure. That is
         * also what keeps every quotation written before colours existed
         * reading exactly as it did.
         */
        inkCostModel: perColourInk ? 'PER_COLOUR' : settings.inkCostModel,
        adhesiveCostModel: settings.adhesiveCostModel,
      },
    };
  }, [settings, master, line, colourKey, materials, inks, overrideKey]);

  /*
   * One rate per quantity, not one rate. Setting a press takes the same hour
   * whether it runs 500 kg or 5,000, so the rate falls with the order — which
   * is the whole reason a quotation carries tiers.
   */
  /*
   * One rate per quantity, not one rate. Setting a press takes the same hour
   * whether it runs 500 kg or 5,000, so the rate falls with the order — which
   * is the whole reason a quotation carries tiers.
   *
   * Anything under a kilogram is skipped rather than costed. A quotation for
   * 20 pouches is a fraction of a kilogram carrying a whole job's setup, and
   * it priced at Rs 13,504 a kilogram beside a heading that rounded to "0 kg"
   * — arithmetically right, and not a number anybody should be shown.
   */
  const results = useMemo(
    () =>
      input
        ? line.quantitiesKg.map((qty) =>
            qty >= MIN_COSTABLE_KG
              ? costRate({
                  ...input,
                  job: { ...input.job, orderQtyKg: qty },
                  overheads: {
                    ...input.overheads,
                    /*
                     * The margin follows the quantity — 15% up to 500 kg, 10%
                     * above — unless the office has typed one, which is theirs
                     * and applies to every tier.
                     *
                     * Chosen HERE rather than once for the document, because
                     * this is the only place that knows which quantity is being
                     * costed. A quotation priced at 250, 500 and 1,000 kg
                     * carries 15%, 15% and 10%.
                     */
                    marginPercent: overrides.marginPercent ?? defaultMarginFor(qty),
                  },
                })
              : null,
          )
        : [],
    [input, line.quantitiesKg, overrides.marginPercent],
  );

  /*
   * Anything else the costing needs a price for.
   *
   * These were hardcoded name lookups — 'Ethyl Acetate', 'Toluene',
   * 'Hardener' — and the catalogue calls its row "Solvent — Ethyl Acetate", so
   * every one missed and returned zero. Solvent is about a sixth of the ink
   * cost and it was free on every quotation, silently. Now they are settings
   * that name a material, and a missing price is named rather than costed at
   * nothing.
   */
  const supporting = settings
    ? [
        /*
         * Whichever materials THIS method actually reads.
         *
         * The flat method prices the whole laydown at one blended rate and
         * never touches the solvent rows; the per-colour method prices the
         * solvent and hardener and never touches the blends. Naming all of
         * them either way refused quotations over a rate that was not in the
         * arithmetic.
         */
        ...(perColourInk
          ? ([
              ['Adhesive', settings.defaultAdhesiveMaterial],
              ['Ethyl acetate', settings.defaultEthylAcetateMaterial],
              ['Toluene', settings.defaultTolueneMaterial],
              ['Hardener', settings.defaultHardenerMaterial],
            ] as string[][])
          : ([
              ['Ink', settings.defaultFlatInkMaterial],
              ['Adhesive', settings.defaultFlatAdhesiveMaterial],
            ] as string[][])),
      ]
    : [];
  const unpricedSupporting = supporting
    .filter(([, name]) => !(materials.find((m) => m.name === name)?.currentRate ?? 0))
    .map(([label, name]) => `${label} (${name || 'not set'})`);

  const unusable =
    !settings || !master
      ? 'Loading the works’ figures…'
      : master.machines.length === 0
        ? 'No machines on record — add a press on the Costing screen.'
        : line.layers.length === 0
          ? 'Choose a film for each ply above. A thickness on its own has no density or rate.'
          : inks.length === 0
            ? 'No ink has a laydown or solids figure yet. Set them on the Rates screen.'
            : line.quantitiesKg.every((quantity) => quantity < MIN_COSTABLE_KG)
              ? line.quantitiesKg.some((quantity) => quantity > 0)
                ? 'That is under a kilogram of film. A whole job’s setup over a few grams is not a rate anybody can quote — check the quantity below.'
                : 'Enter a quantity below and the rate works itself out.'
              : perColourInk && unpriced.length > 0
                ? `${unpriced.join(', ')} ${unpriced.length === 1 ? 'has' : 'have'} no rate yet. Price ${unpriced.length === 1 ? 'it' : 'them'} on the Rates screen — costing a colour at nothing would quietly understate the job.`
                : unpricedSupporting.length > 0
                  ? `No rate for ${unpricedSupporting.join(', ')}. Every one of these is real cost on the job, so the rate would come out low — price them on the Rates screen, or point at the right material on the Costing screen.`
                  : null;

  return {
    settings,
    master,
    /** The assembled inputs, for anything that needs to re-run or export it. */
    input,
    results,
    /**
     * Why the figures cannot be trusted, when they cannot.
     *
     * Nothing displays this since the costing panel was removed, and it is
     * kept rather than deleted because it is the only thing that knows: an
     * unpriced solvent does not stop the arithmetic, it quietly understates
     * it. Somewhere ought to say so.
     */
    unusable,
  } as const;
}

export type RateCosting = ReturnType<typeof useRateCosting>;
export type { CostingBreakdown };
