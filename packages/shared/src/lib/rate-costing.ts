import { round } from './quotation-math.js';

/**
 * Working out what a kilogram actually costs to make.
 *
 * This is the works' own method, taken from the spreadsheets they cost by. It
 * builds a rate up from every expense — film, ink, adhesive, solvent,
 * electricity by the minute, wages by the minute, transport, packing, even the
 * bank EMI — rather than starting from a rate somebody remembers.
 *
 * Two of their sheets disagreed about the same job (Rs 263.40 against Rs
 * 228.22 per kilogram) and this reconciles them the way the office asked:
 *
 *   - the **Estimation** frame, which divides by the quantity ORDERED. The
 *     wastage is already inside the cost, so dividing by the quantity consumed
 *     would charge for it and then hand it back.
 *   - the **Costing** detail for ink and adhesive, which prices each colour on
 *     its own laydown and solids, and the adhesive as a diluted batch.
 *
 * Three things their sheets get wrong are deliberately not reproduced. Each is
 * noted where it arises: the ink GSM that contradicted itself, the batch-ratio
 * lookup that could only ever return its first row, and the machine that drew
 * no electricity while it was being set up.
 *
 * Every figure the office might be asked to justify is returned, not just the
 * answer — see `CostingBreakdown`. A rate nobody can explain is a rate nobody
 * can defend across a table.
 */

// ---------------------------------------------------------------------------
// Master data — what the works is, rather than what this job is
// ---------------------------------------------------------------------------

export const MACHINE_KINDS = ['PRINTING', 'LAMINATION', 'SLITTING', 'POUCHING'] as const;
export type MachineKind = (typeof MACHINE_KINDS)[number];

export const MACHINE_KIND_LABELS: Record<MachineKind, string> = {
  PRINTING: 'Printing',
  LAMINATION: 'Lamination',
  SLITTING: 'Slitting',
  POUCHING: 'Pouch making',
};

export interface CostingMachine {
  name: string;
  kind: MachineKind;
  /** Connected load. The sheets cost power as horsepower × a rate per hour. */
  horsepower: number;
  /**
   * Rupees per horsepower-hour.
   *
   * Per machine rather than one figure for the works, because that is what
   * their sheets do — printing is costed at the electricity tariff itself
   * (Rs 9), while lamination and slitting carry Rs 35 and Rs 60, which are
   * plainly loaded with something more than power. Forcing one rate on all
   * three would silently reprice two machines.
   */
  powerRatePerHpHour: number;
  /** Metres a minute. */
  speedMPerMin: number;
  /** Setting and cleaning, before a metre is run. */
  setupMinutes: number;
  /**
   * Share of the connected load drawn while being set, 0-1.
   *
   * Their sheet charges nothing for setup power, which cannot be right — the
   * press is switched on. Charging the full load is not right either: a press
   * being threaded and having its cylinders cleaned is not running at 66 HP,
   * and assuming it does adds two thirds to the printing electricity. Neither
   * figure is knowable from here, so the works sets it; 1 keeps the old
   * behaviour for anybody who has not.
   */
  setupPowerFactor?: number;
}

export interface CostingLabour {
  role: string;
  /** Which machine's minutes this person is paid for. */
  process: MachineKind;
  monthlySalary: number;
}

/**
 * Everything else, and the two rules the office is most likely to argue about.
 */
export interface CostingOverheads {
  /** Working month, for turning a salary into a rate per minute. */
  workingDaysPerMonth: number;
  hoursPerDay: number;

  transportPerKg: number;
  packingPerKg: number;
  /** A flat sum on the job — sundries the works does not itemise. */
  otherPerJob: number;

  /** Recovered across machine time, as the sheet does. */
  emiPerMonth: number;
  /** Machine hours a month the EMI is spread over. */
  emiHoursPerMonth: number;

  /** Charged only when the line is made into pouches. */
  pouchMakingPerKg: number;
  /**
   * What each printing station beyond the fifth adds, per kilogram. The sheet
   * charges 5.5 for the sixth and 7.5 for the seventh.
   */
  stationSurcharges: number[];

  marginPercent: number;
  /**
   * What the margin is taken on.
   *
   * Their sheet applies it to the material cost alone, which leaves the labour,
   * the power, the transport and the packing recovered at cost and earning
   * nothing — on the job we were given, Rs 11,269 of effort for no return.
   * `TOTAL_COST` is the default because that is almost certainly what was
   * meant; `MATERIAL_ONLY` reproduces the sheet exactly, for anybody
   * reconciling against it.
   */
  marginBasis: 'TOTAL_COST' | 'MATERIAL_ONLY';
}

// ---------------------------------------------------------------------------
// The job
// ---------------------------------------------------------------------------

export interface CostingLayer {
  name: string;
  micron: number;
  density: number;
  ratePerKg: number;
}

export interface CostingColour {
  name: string;
  /** Dry ink laid down, g/m². White is far heavier than a process colour. */
  laydownGsm: number;
  /** How much of the tin is pigment. The rest evaporates. */
  solidsPercent: number;
  ratePerKg: number;
}

/** The five dilutions the works uses, and what each leaves behind. */
export const ADHESIVE_BATCHES = [
  { ratio: '100:189:15', solidsPercent: 30 },
  { ratio: '100:146:15', solidsPercent: 35 },
  { ratio: '100:113:15', solidsPercent: 40 },
  { ratio: '100:88:15', solidsPercent: 45 },
  { ratio: '100:68:15', solidsPercent: 50 },
] as const;

export type AdhesiveRatio = (typeof ADHESIVE_BATCHES)[number]['ratio'];

export interface CostingAdhesive {
  /** Dry adhesive on the film, g/m². */
  gsm: number;
  ratio: string;
  adhesiveRatePerKg: number;
  ethylAcetateRatePerKg: number;
  hardenerRatePerKg: number;
}

export interface CostingSolvent {
  /** Ink to solvent, as the press mixes it. Their sheet runs 100:80. */
  inkParts: number;
  solventParts: number;
  /** The two solvents, and how the mix splits between them. */
  ethylAcetatePercent: number;
  ethylAcetateRatePerKg: number;
  tolueneRatePerKg: number;
}

export interface CostingJob {
  /** What the customer is buying, in kilograms. The divisor. */
  orderQtyKg: number;
  /** Film spoiled in setting up and running, as a percentage of the order. */
  wastagePercent: number;

  /** The flat film one piece is cut from, in millimetres. */
  filmWidthMm: number;
  filmHeightMm: number;
  /** Pieces across the web. */
  ups: number;
  /** Edge trim, millimetres, added to the web width. */
  trimMm: number;

  layers: CostingLayer[];
  colours: CostingColour[];
  adhesive: CostingAdhesive;
  solvent: CostingSolvent;

  /** A roll is not slit into pouches and carries no pouch-making charge. */
  makesPouches: boolean;

  /**
   * Pieces in a kilogram, when the caller already has its own figure.
   *
   * The quotation works this out from its own geometry, which allows for
   * gussets and uses the settings' ink GSM rather than the colours actually
   * chosen. The two differ by a few per cent — enough that a rate suggested
   * here and applied to a per-piece line was showing Rs 1.10 and writing
   * Rs 1.15. Whichever figure the document uses has to be the one quoted, so
   * the caller's wins where it has one.
   */
  piecesPerKgOverride?: number | null;
}

export interface CostingInput {
  job: CostingJob;
  machines: CostingMachine[];
  labour: CostingLabour[];
  overheads: CostingOverheads;
}

// ---------------------------------------------------------------------------
// The answer
// ---------------------------------------------------------------------------

export interface LayerCost {
  name: string;
  micron: number;
  density: number;
  gsm: number;
  /** Its share of the kilogram, and therefore of the consumed quantity. */
  shareOfGsm: number;
  quantityKg: number;
  metres: number;
  ratePerKg: number;
  cost: number;
}

export interface ColourCost {
  name: string;
  laydownGsm: number;
  solidsPercent: number;
  /** Pigment that stays on the film. */
  dryKg: number;
  /** What has to be bought to lay that down. */
  wetKg: number;
  inkCost: number;
  solventKg: number;
  solventCost: number;
  cost: number;
}

export interface AdhesiveCost {
  gsm: number;
  ratio: string;
  batchSolidsPercent: number;
  /** The diluted batch the laminator actually pours. */
  batchKg: number;
  adhesiveKg: number;
  ethylAcetateKg: number;
  hardenerKg: number;
  cost: number;
}

export interface ProcessCost {
  machine: string;
  kind: MachineKind;
  metres: number;
  speedMPerMin: number;
  runMinutes: number;
  setupMinutes: number;
  /** Power is drawn while it is set up as well as while it runs. */
  electricityCost: number;
  labourCost: number;
}

export interface CostingBreakdown {
  /* --- what the job consumes ------------------------------------------- */
  totalGsm: number;
  substrateGsm: number;
  inkGsm: number;
  adhesiveGsm: number;
  webWidthMm: number;
  orderQtyKg: number;
  wastageKg: number;
  consumedKg: number;

  /* --- materials -------------------------------------------------------- */
  layers: LayerCost[];
  colours: ColourCost[];
  adhesiveDetail: AdhesiveCost;
  filmCost: number;
  inkCost: number;
  adhesiveCost: number;
  materialCost: number;

  /* --- effort ----------------------------------------------------------- */
  processes: ProcessCost[];
  totalMachineMinutes: number;
  electricityCost: number;
  labourCost: number;
  transportCost: number;
  packingCost: number;
  otherCost: number;
  emiCost: number;
  overheadCost: number;

  /* --- the rate --------------------------------------------------------- */
  costBeforeMargin: number;
  marginBasis: 'TOTAL_COST' | 'MATERIAL_ONLY';
  marginPercent: number;
  marginAmount: number;
  totalCost: number;

  /** Everything above, over the quantity ORDERED. */
  baseRatePerKg: number;
  stationSurchargePerKg: number;
  pouchMakingPerKg: number;
  ratePerKg: number;

  /* --- and what that is per piece --------------------------------------- */
  pieceWeightG: number;
  piecesPerKg: number;
  ratePerPiece: number;

  /** Margin as a share of the selling rate, which is how a margin is read. */
  marginOnRatePercent: number;
}

// ---------------------------------------------------------------------------

const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);

/** Splits '100:146:15' into its three parts. Null when it is not a ratio. */
export function parseAdhesiveRatio(ratio: string): [number, number, number] | null {
  const parts = ratio.split(':').map((part) => Number(part.trim()));
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part) || part < 0)) return null;
  if (parts[0]! <= 0) return null;
  return [parts[0]!, parts[1]!, parts[2]!];
}

/** What a dilution leaves behind, or null for a ratio nobody has measured. */
export function batchSolidsFor(ratio: string): number | null {
  return ADHESIVE_BATCHES.find((batch) => batch.ratio === ratio)?.solidsPercent ?? null;
}

/**
 * The dry ink on the film, which is the sum of what each colour lays down.
 *
 * Their Estimation sheet holds this at a flat 1.8 GSM while the Costing sheet
 * prices the four colours actually used, which come to 0.55. Both cannot be
 * right, and the structure's figure is the one that decides what a pouch
 * weighs — so a four-colour job was quoted as though it carried three times the
 * ink it does. The colours decide it here.
 */
export function inkGsmOf(colours: CostingColour[]): number {
  return sum(colours.map((colour) => colour.laydownGsm));
}

/**
 * Colours chosen but not priced.
 *
 * A colour with no rate costs nothing, and nothing looks like a plausible
 * number: a job printing white would quote at a twelfth of its real ink and
 * read perfectly normally on the page. The same rule an unpriced film gauge
 * follows — refuse, and name which.
 */
export function unpricedColours(colours: CostingColour[]): string[] {
  return colours.filter((colour) => !(colour.ratePerKg > 0)).map((colour) => colour.name);
}

/** Rupees a minute for one wage, given the works' month. */
export function salaryPerMinute(
  monthlySalary: number,
  workingDaysPerMonth: number,
  hoursPerDay: number,
): number {
  const minutes = workingDaysPerMonth * hoursPerDay * 60;
  return minutes > 0 ? monthlySalary / minutes : 0;
}

/**
 * Costs one job end to end.
 *
 * Returns null only when the job cannot describe itself — no order quantity,
 * no film, or a structure with no weight. Everything else is arithmetic.
 */
export function costRate(input: CostingInput): CostingBreakdown | null {
  const { job, machines, labour, overheads } = input;

  if (job.orderQtyKg <= 0) return null;

  /*
   * A ply left at zero microns is a ply the structure does not have.
   *
   * Their sheet keeps a Met PET row on every job and leaves it at 0 when there
   * is none. That is harmless for the weight — it contributes nothing — and is
   * not harmless for the machines: counted as a ply it books a second
   * lamination pass, and the job pays for a laminator that never ran.
   */
  const plies = job.layers.filter((layer) => layer.micron > 0 && layer.density > 0);
  if (plies.length === 0) return null;

  const substrateGsm = round(sum(plies.map((layer) => layer.micron * layer.density)), 4);
  const inkGsm = round(inkGsmOf(job.colours), 4);
  const adhesiveGsm = job.adhesive.gsm;
  const totalGsm = round(substrateGsm + inkGsm + adhesiveGsm, 4);
  if (totalGsm <= 0 || substrateGsm <= 0) return null;

  const wastageKg = round(job.orderQtyKg * (job.wastagePercent / 100), 3);
  const consumedKg = round(job.orderQtyKg + wastageKg, 3);

  const webWidthMm = job.filmWidthMm * Math.max(1, job.ups) + job.trimMm;

  /* --- film ------------------------------------------------------------- */
  const layers: LayerCost[] = plies.map((layer) => {
    const gsm = round(layer.micron * layer.density, 4);
    const shareOfGsm = gsm / totalGsm;
    const quantityKg = round(shareOfGsm * consumedKg, 3);
    /*
     * Running metres, which is what a machine's speed is measured against:
     * the kilograms give an area at this ply's own GSM, and the area over the
     * web width is a length.
     */
    const metres =
      gsm > 0 && webWidthMm > 0 ? round((quantityKg * 1_000_000) / (gsm * webWidthMm), 2) : 0;
    return {
      name: layer.name,
      micron: layer.micron,
      density: layer.density,
      gsm,
      shareOfGsm: round(shareOfGsm, 6),
      quantityKg,
      metres,
      ratePerKg: layer.ratePerKg,
      cost: round(quantityKg * layer.ratePerKg, 2),
    };
  });

  const printedLayer = layers[0]!;
  const filmCost = round(sum(layers.map((layer) => layer.cost)), 2);

  /* --- ink, per colour --------------------------------------------------
   * The printed area comes from the first ply: its kilograms at its own GSM.
   * Every colour is laid on that same area.
   */
  const printedAreaSqm =
    printedLayer.gsm > 0 ? (printedLayer.quantityKg * 1000) / printedLayer.gsm : 0;

  const solventParts = job.solvent.inkParts + job.solvent.solventParts;
  const solventShare = solventParts > 0 ? job.solvent.solventParts / solventParts : 0;

  const colours: ColourCost[] = job.colours.map((colour) => {
    const dryKg = round((printedAreaSqm * colour.laydownGsm) / 1000, 4);
    /* Only the solids stay; the tin has to be bought at its wet weight. */
    const wetKg = colour.solidsPercent > 0 ? round((dryKg * 100) / colour.solidsPercent, 4) : 0;
    const inkCost = round(wetKg * colour.ratePerKg, 2);

    const solventKg = round(wetKg * solventShare, 4);
    const ethylAcetateKg = solventKg * (job.solvent.ethylAcetatePercent / 100);
    const tolueneKg = solventKg - ethylAcetateKg;
    const solventCost = round(
      ethylAcetateKg * job.solvent.ethylAcetateRatePerKg + tolueneKg * job.solvent.tolueneRatePerKg,
      2,
    );

    return {
      name: colour.name,
      laydownGsm: colour.laydownGsm,
      solidsPercent: colour.solidsPercent,
      dryKg,
      wetKg,
      inkCost,
      solventKg,
      solventCost,
      cost: round(inkCost + solventCost, 2),
    };
  });

  const inkCost = round(sum(colours.map((colour) => colour.cost)), 2);

  /* --- adhesive, as a diluted batch -------------------------------------
   * Against the SUBSTRATE weight rather than the whole laminate, because
   * adhesive is spread over the film and not over itself or the ink.
   */
  const batchSolids = batchSolidsFor(job.adhesive.ratio) ?? 100;
  const batchKg =
    batchSolids > 0 ? round(((adhesiveGsm / substrateGsm) * consumedKg * 100) / batchSolids, 4) : 0;

  /*
   * Split on the ratio the office chose. Their sheet could not do this: the
   * lookup was SUMIFS over a single cell, so it always returned the first row
   * whatever was picked — a job set to 100:146:15 was costed at 100:189:15.
   */
  const parts = parseAdhesiveRatio(job.adhesive.ratio) ?? [100, 0, 0];
  const partsTotal = parts[0] + parts[1] + parts[2];
  const adhesiveKg = round((parts[0] / partsTotal) * batchKg, 4);
  const ethylAcetateKg = round((parts[1] / partsTotal) * batchKg, 4);
  const hardenerKg = round((parts[2] / partsTotal) * batchKg, 4);

  const adhesiveCost = round(
    adhesiveKg * job.adhesive.adhesiveRatePerKg +
      ethylAcetateKg * job.adhesive.ethylAcetateRatePerKg +
      hardenerKg * job.adhesive.hardenerRatePerKg,
    2,
  );

  const adhesiveDetail: AdhesiveCost = {
    gsm: adhesiveGsm,
    ratio: job.adhesive.ratio,
    batchSolidsPercent: batchSolids,
    batchKg,
    adhesiveKg,
    ethylAcetateKg,
    hardenerKg,
    cost: adhesiveCost,
  };

  const materialCost = round(filmCost + inkCost + adhesiveCost, 2);

  /* --- machines, and the people on them ---------------------------------
   * Printing runs the first ply. Lamination runs each ply after it — one pass
   * per ply, which is what a laminator does. Slitting runs the printed length
   * again. Pouch making is charged per kilogram, not by the minute.
   */
  const laminationPasses = Math.max(0, layers.length - 1);

  const processes: ProcessCost[] = [];
  for (const machine of machines) {
    if (machine.kind === 'POUCHING') continue;

    let metres = 0;
    if (machine.kind === 'PRINTING') metres = printedLayer.metres;
    else if (machine.kind === 'SLITTING') metres = printedLayer.metres;
    else if (machine.kind === 'LAMINATION') metres = printedLayer.metres * laminationPasses;

    if (metres <= 0) continue;

    const runMinutes = machine.speedMPerMin > 0 ? round(metres / machine.speedMPerMin, 2) : 0;
    /*
     * Setup is charged for power as well as for wages. Their sheet billed the
     * operator for the hour spent setting the press and billed nothing for the
     * press, which cannot be right — the machine is switched on.
     *
     * How MUCH it draws is a different question, and not one this code can
     * answer: a press being threaded is not running at its connected load.
     * `setupPowerFactor` is the works' answer to it.
     */
    const occupiedMinutes = runMinutes + machine.setupMinutes;
    const setupFactor = machine.setupPowerFactor ?? 1;
    const poweredMinutes = runMinutes + machine.setupMinutes * setupFactor;

    const electricityCost = round(
      ((machine.horsepower * machine.powerRatePerHpHour) / 60) * poweredMinutes,
      2,
    );

    const labourCost = round(
      sum(
        labour
          .filter((person) => person.process === machine.kind)
          .map(
            (person) =>
              salaryPerMinute(
                person.monthlySalary,
                overheads.workingDaysPerMonth,
                overheads.hoursPerDay,
              ) * occupiedMinutes,
          ),
      ),
      2,
    );

    processes.push({
      machine: machine.name,
      kind: machine.kind,
      metres: round(metres, 2),
      speedMPerMin: machine.speedMPerMin,
      runMinutes,
      setupMinutes: machine.setupMinutes,
      electricityCost,
      labourCost,
    });
  }

  const totalMachineMinutes = round(
    sum(processes.map((process) => process.runMinutes + process.setupMinutes)),
    2,
  );
  const electricityCost = round(sum(processes.map((process) => process.electricityCost)), 2);
  const labourCost = round(sum(processes.map((process) => process.labourCost)), 2);

  /* --- everything else --------------------------------------------------- */
  const transportCost = round(consumedKg * overheads.transportPerKg, 2);
  const packingCost = round(consumedKg * overheads.packingPerKg, 2);
  const otherCost = round(overheads.otherPerJob, 2);

  const emiPerMinute =
    overheads.emiHoursPerMonth > 0 ? overheads.emiPerMonth / (overheads.emiHoursPerMonth * 60) : 0;
  const emiCost = round(emiPerMinute * totalMachineMinutes, 2);

  const overheadCost = round(labourCost + transportCost + packingCost + otherCost + emiCost, 2);

  /* --- margin ------------------------------------------------------------ */
  const costBeforeMargin = round(materialCost + overheadCost + electricityCost, 2);
  const marginBase = overheads.marginBasis === 'MATERIAL_ONLY' ? materialCost : costBeforeMargin;
  const marginAmount = round(marginBase * (overheads.marginPercent / 100), 2);
  const totalCost = round(costBeforeMargin + marginAmount, 2);

  /* --- and finally, per kilogram ---------------------------------------- */
  const baseRatePerKg = round(totalCost / job.orderQtyKg, 4);

  /*
   * A surcharge for each station past the fifth. `stationSurcharges[0]` is the
   * sixth, and a five-colour job pays none of them.
   */
  const extraStations = Math.max(0, job.colours.length - 5);
  const stationSurchargePerKg = round(sum(overheads.stationSurcharges.slice(0, extraStations)), 4);

  const pouchMakingPerKg = job.makesPouches ? overheads.pouchMakingPerKg : 0;
  const ratePerKg = round(baseRatePerKg + stationSurchargePerKg + pouchMakingPerKg, 2);

  /* --- per piece --------------------------------------------------------- */
  const ownPieceWeightG = round((job.filmWidthMm * job.filmHeightMm * totalGsm) / 1_000_000, 4);
  const piecesPerKg =
    job.piecesPerKgOverride && job.piecesPerKgOverride > 0
      ? round(job.piecesPerKgOverride, 4)
      : ownPieceWeightG > 0
        ? round(1000 / ownPieceWeightG, 4)
        : 0;
  const pieceWeightG = piecesPerKg > 0 ? round(1000 / piecesPerKg, 4) : ownPieceWeightG;
  const ratePerPiece = piecesPerKg > 0 ? round(ratePerKg / piecesPerKg, 4) : 0;

  /*
   * The margin the office reads off a quotation is the share of the SELLING
   * rate, not the mark-up on cost — 9% added to cost is 8.26% of the rate.
   *
   * Only the margin counts towards it. The station surcharge and the pouch
   * charge sit outside the cost build-up but they are still costs, so treating
   * the gap between rate and `costBeforeMargin` as profit would report a
   * pouched job as half again as profitable as the same film on a reel.
   */
  const marginPerKg = marginAmount / job.orderQtyKg;
  const marginOnRatePercent = ratePerKg > 0 ? round((marginPerKg / ratePerKg) * 100, 2) : 0;

  return {
    totalGsm,
    substrateGsm,
    inkGsm,
    adhesiveGsm,
    webWidthMm: round(webWidthMm, 2),
    orderQtyKg: job.orderQtyKg,
    wastageKg,
    consumedKg,

    layers,
    colours,
    adhesiveDetail,
    filmCost,
    inkCost,
    adhesiveCost,
    materialCost,

    processes,
    totalMachineMinutes,
    electricityCost,
    labourCost,
    transportCost,
    packingCost,
    otherCost,
    emiCost,
    overheadCost,

    costBeforeMargin,
    marginBasis: overheads.marginBasis,
    marginPercent: overheads.marginPercent,
    marginAmount,
    totalCost,

    baseRatePerKg,
    stationSurchargePerKg,
    pouchMakingPerKg,
    ratePerKg,

    pieceWeightG,
    piecesPerKg,
    ratePerPiece,
    marginOnRatePercent,
  };
}
