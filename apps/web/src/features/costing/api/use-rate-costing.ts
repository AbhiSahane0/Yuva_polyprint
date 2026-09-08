import { useMemo, useState } from 'react';
import {
  adhesiveGsmFor,
  costRate,
  unpricedColours,
  type CostingBreakdown,
  type CostingColour,
  type CostingInput,
  type CostingLayer,
  type Material,
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
  /** The quantities being priced, in kilograms. */
  quantitiesKg: number[];
  /**
   * Pieces in a kilogram, as the quotation itself counts them. Passed so the
   * rate shown is the rate the document ends up carrying.
   */
  piecesPerKg: number;
}

/**
 * What each quantity on a line costs to make.
 *
 * A hook rather than something the panel keeps to itself, because two places
 * need the same answer: the panel, which suggests a rate, and the quantity
 * rows beneath it, which have to say what margin the rate somebody TYPED
 * actually earns. Computing it twice would let the two disagree about the same
 * job on the same screen.
 */
export function useRateCosting(line: RateCostingLine, materials: Material[]) {
  const { data: settings } = useSettings();
  const { data: master } = useCostingMasterData();

  const inks = useMemo(
    () =>
      materials.filter((material) => material.category === 'INK' && material.laydownGsm !== null),
    [materials],
  );

  /*
   * Two groups, because they are two different things. Cyan, magenta, yellow
   * and black are on every press and every job may use them. Everything after
   * that is one customer's brand and only becomes the works' business once a
   * tin has been bought — which is why the second group can be added to from
   * here rather than being a list somebody guessed in advance.
   */
  const process = inks.filter((ink) => ink.inkKind === 'PROCESS');
  const special = inks.filter((ink) => ink.inkKind !== 'PROCESS');

  const [chosen, setChosen] = useState<string[] | null>(null);
  const colourNames =
    chosen ?? [...process, ...special].slice(0, Math.max(1, line.colourCount)).map((i) => i.name);
  /* A stable dependency: the array is rebuilt every render, its contents are not. */
  const colourKey = colourNames.join('|');

  const toggle = (name: string) =>
    setChosen(
      colourNames.includes(name)
        ? colourNames.filter((chosenName) => chosenName !== name)
        : [...colourNames, name],
    );

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
        flatInk: { ratePerKg: rate(settings.defaultInkMaterial) },
        adhesive: {
          /* Worked out from the structure, as the sheet does. */
          gsm: adhesiveGsmFor(line.layers, {
            thinGsm: settings.adhesiveCoatThinGsm,
            thickGsm: settings.adhesiveCoatThickGsm,
            thickPlyMicron: settings.adhesiveThickPlyMicron,
          }),
          flatRatePerKg: rate(settings.defaultAdhesiveMaterial),
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
        piecesPerKgOverride: line.piecesPerKg,
        /* The works weighs the laminate with its own ink figure. */
        inkGsmOverride: settings.inkGsm,
        /* One cylinder per station, which is what the line is charged for. */
        stationCount: line.colourCount,
        adhesiveSplitRatio: settings.adhesiveSplitRatio,
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
        emiBasis: settings.emiBasis,
        pouchMakingPerKg: settings.pouchMakingPerKg,
        stationSurcharges: [
          settings.stationSurcharge6,
          settings.stationSurcharge7,
          settings.stationSurcharge8,
        ],
        marginPercent: settings.defaultMarginPercent,
        marginBasis: settings.marginBasis,
        inkCostModel: settings.inkCostModel,
        adhesiveCostModel: settings.adhesiveCostModel,
      },
    };
  }, [settings, master, line, colourKey, materials, inks]);

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
              ? costRate({ ...input, job: { ...input.job, orderQtyKg: qty } })
              : null,
          )
        : [],
    [input, line.quantitiesKg],
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
        ['Adhesive', settings.defaultAdhesiveMaterial],
        ['Ethyl acetate', settings.defaultEthylAcetateMaterial],
        ['Toluene', settings.defaultTolueneMaterial],
        ['Hardener', settings.defaultHardenerMaterial],
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
              : unpriced.length > 0
                ? `${unpriced.join(', ')} ${unpriced.length === 1 ? 'has' : 'have'} no rate yet. Price ${unpriced.length === 1 ? 'it' : 'them'} on the Rates screen — costing a colour at nothing would quietly understate the job.`
                : unpricedSupporting.length > 0
                  ? `No rate for ${unpricedSupporting.join(', ')}. Every one of these is real cost on the job, so the rate would come out low — price them on the Rates screen, or point at the right material on the Costing screen.`
                  : null;

  return {
    settings,
    master,
    process,
    special,
    colourNames,
    toggle,
    setChosen,
    results,
    unusable,
  } as const;
}

export type RateCosting = ReturnType<typeof useRateCosting>;
export type { CostingBreakdown };
