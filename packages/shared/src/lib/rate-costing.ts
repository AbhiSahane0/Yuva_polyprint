import type { PouchType } from '../constants/job.js';
import {
  NO_POUCH_EXPENSE,
  pouchExpense,
  pouchMakingInForce,
  type PouchExpense,
  type PouchMakingBands,
  type PouchMakingRates,
} from './pouch-making.js';
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
  /**
   * The one of its kind the works actually runs.
   *
   * Without it, "one machine per kind" meant whichever came first on the list —
   * which is how a works with an old laminator and a new one priced every job
   * on the old one's speed. A job that names a machine still beats this.
   */
  isDefault?: boolean;
  /**
   * Connected load, costed as horsepower × a rate per hour.
   *
   * On a press carrying `stationHorsepower` this is the MAIN DRIVE alone and
   * the stations are added to it. Everywhere else it is the whole load.
   */
  horsepower: number;
  /**
   * What one printing station adds when its colour is inked. Zero is a fixed
   * load, which is what a laminator or a slitter has.
   */
  stationHorsepower?: number;
  /**
   * Which colour switches each station on — `[3, 4, 6]` on the works' press,
   * confirmed by the operator. Empty leaves the load fixed.
   */
  stationColourSteps?: number[];
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
   * figure is knowable from here, so the works sets it; 0 is the default
   * because it is what their sheet does.
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

  /**
   * Overheads the works added for itself, each with the basis it is charged on.
   *
   * The fixed figures above are wired into this engine by name; these are not,
   * which is the whole point — a works that starts paying for something new
   * should not need a migration to say so. They are costed exactly like
   * transport and packing: part of the overhead, and so **outside** the margin
   * base under `MATERIAL_ONLY`. A charge the works earns on is a margin, and
   * there is already a setting for that.
   *
   * Empty or absent on every quotation written before the works added one,
   * which is what keeps the seven verified 2022 documents reproducing.
   */
  customOverheads?: CustomOverhead[];

  /** Recovered across machine time, as the sheet does. */
  emiPerMonth: number;
  /** Machine hours a month the EMI is spread over. */
  emiHoursPerMonth: number;
  /**
   * Which minutes the EMI is recovered over.
   *
   * The works' sheet uses running time alone. Charging the setup as well is
   * arguably truer — the asset is tied up either way — but the office
   * reconciles against the sheet, so RUN_TIME is what it does.
   */
  emiBasis: 'RUN_TIME' | 'OCCUPIED';

  /**
   * **How the works' own time is recovered — and the reason a big order gets
   * cheaper.**
   *
   * `PER_MINUTE` is the works' Estimation sheet: each operator is billed for
   * the minutes of the machine they stand at, and the bank EMI for the minutes
   * the machine runs. It has one flaw, and it is fatal to quoting. Everything
   * in it scales with the kilograms, so the only genuinely fixed cost on a job
   * is `otherPerJob` — Rs 250. Between 1,000 kg and 2,000 kg of the same job the
   * rate falls by **twenty paise**, and the works says it should fall by about
   * ten rupees.
   *
   * `PER_DAY` is their job card. The works is open, the whole crew is paid and
   * the bank is paid, for as many days as the job occupies it — and a job does
   * NOT occupy it in proportion to its size, because the make-ready is the same
   * whatever the order. Their own fourteen job sheets fit
   * `days = 0.75 + kg / 1,945`, and the three-quarters of a day at the front is
   * the whole effect: spread over 2,000 kg it costs half what it costs over
   * 1,000.
   *
   * Machine electricity is NOT folded in. It stays per machine, which is what
   * lets two laminators of different cost produce two different rates —
   * `powerRatePerHpHour` is already a loaded rate rather than a tariff, as the
   * works' own figures show (printing 9, lamination 35, slitting 60).
   *
   * The default is `PER_MINUTE` because that is what the works held until they
   * asked for this, and settings are read **as at the quotation's own date** —
   * so their 2022 quotations still reproduce the sheets they were written from.
   */
  rateModel?: 'PER_MINUTE' | 'PER_DAY';
  /**
   * What one day of the works costs: the whole crew, and the bank. Not
   * electricity, which is charged per machine.
   */
  worksDayCost?: number;
  /** Make-ready — the days a job takes before it makes anything sellable. */
  makeReadyDays?: number;
  /**
   * **Machine minutes the works gets through in a day.**
   *
   * Not minutes in a shift. Printing, lamination and slitting run at the same
   * time, so a day of elapsed time absorbs several machines' worth of minutes —
   * the works' own fourteen sheets fit about 1,600, which is a 480-minute shift
   * roughly three times over.
   *
   * Driving the days off MINUTES rather than kilograms is what makes the
   * estimate follow the job instead of its weight. Their Amruta Family Tea ran
   * three days for 3,313 kg while Malpani Lime ran two for 3,285 — the same
   * weight, and not remotely the same job: a 750 mm web instead of 990 is half
   * again the metres, three plies instead of two laminates the whole web twice,
   * and eight colours is eight cylinders to register rather than one. On
   * kilograms alone the two are indistinguishable and one of them is wrong.
   */
  machineMinutesPerDay?: number;
  /**
   * Kilograms a day, used only where a line has no costed structure to work
   * metres out of. A fallback, not the model.
   */
  kgPerDay?: number;

  /**
   * What making one pouch costs — see `pouchExpense`.
   *
   * Per POUCH, because that is how the works' own pouch workbook charges it and
   * how the work is actually done. It used to be one rate per kilogram, which
   * cannot describe the job: across the workbook's nine costed pouches the same
   * charge reads between Rs 11 and Rs 64 a kilogram, depending on nothing but
   * how big the pouch is.
   */
  pouchMaking?: PouchMakingRates | null;

  /**
   * A per-quotation figure that replaces the computed pouch charge, per kg.
   *
   * The office's override, and it stays in kilograms because that is the unit
   * it overrides: "charge Rs 20 a kilo for making on this one, whatever the
   * style says". Null uses the styles. Quotations written before the charge
   * became per pouch carry one of these and still price exactly as they did.
   */
  pouchMakingPerKgOverride?: number | null;

  /**
   * The works' three per-kilogram making bands.
   *
   * Absent on a works that has not set them, and on every quotation priced
   * before they existed — both fall back to the per-pouch rate, so reopening an
   * old document shows what it was sold at.
   */
  pouchMakingBands?: PouchMakingBands | null;
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
   * `MATERIAL_ONLY` is the default because it is what the sheet does and the
   * office reconciles against that sheet. `TOTAL_COST` earns on the effort as
   * well, and is one setting away when they want it.
   */
  marginBasis: 'TOTAL_COST' | 'MATERIAL_ONLY';

  /**
   * How ink is costed. The workbook does it two ways and they disagree by 2x
   * on the same job.
   *
   * `PER_COLOUR` is the Costing sheet: each colour's laydown grossed up by its
   * solids to the wet weight actually bought, plus solvent at the press ratio.
   * `FLAT_GSM` is the Estimation sheet: the structure's ink GSM times one
   * blended rate, with no solids and no solvent — simpler, and what the
   * workbook's headline 263.40 is built from.
   */
  inkCostModel: 'PER_COLOUR' | 'FLAT_GSM';
  /**
   * `BATCH` dilutes the adhesive and prices its three parts, as the Costing
   * sheet does. `FLAT_GSM` is the Estimation sheet: GSM times one rate.
   */
  adhesiveCostModel: 'BATCH' | 'FLAT_GSM';
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

/**
 * Adhesive laid down, worked out from the structure — as the sheet does.
 *
 * `IF(ply > 40µ, 3, 2)` for the coat weight, times the number of laminations.
 * The sheet writes that second term as "2 if there is a Met PET ply, else 1",
 * which is a shortcut for its own three-ply structure and gives the wrong
 * answer on any other; laminations are plies minus one, which agrees with it
 * everywhere the sheet is actually used.
 *
 * A single ply is not laminated at all and carries no adhesive.
 */
export function adhesiveGsmFor(
  plies: { micron: number }[],
  options: { thinGsm: number; thickGsm: number; thickPlyMicron: number },
): number {
  const laminations = Math.max(0, plies.length - 1);
  if (laminations === 0) return 0;

  /* The coat is heavier under a thick ply. */
  const thickest = Math.max(...plies.slice(1).map((ply) => ply.micron), 0);
  const coat = thickest > options.thickPlyMicron ? options.thickGsm : options.thinGsm;
  return round(coat * laminations, 4);
}

/** The five dilutions the works uses, and what each leaves behind. */
/**
 * How a works-defined overhead is applied to a job.
 *
 * The engine cannot guess. A row reading "Machine maintenance 5000" is per job,
 * per kilogram, per day or a percentage depending on what the works meant, and
 * the difference between the first two is three orders of magnitude. So an
 * overhead carries its basis and the costing reads it.
 */
export const OVERHEAD_BASES = [
  'PER_KG',
  'PER_JOB',
  'PER_POUCH',
  'PER_DAY',
  'PERCENT_MATERIAL',
  'PERCENT_TOTAL',
] as const;

export type OverheadBasis = (typeof OVERHEAD_BASES)[number];

export const OVERHEAD_BASIS_LABELS: Record<OverheadBasis, string> = {
  PER_KG: 'Rupees a kilogram',
  PER_JOB: 'Rupees a job, flat',
  PER_POUCH: 'Rupees a pouch',
  PER_DAY: 'Rupees a day the job occupies the works',
  PERCENT_MATERIAL: '% of the material cost',
  PERCENT_TOTAL: '% of the cost before margin',
};

/** What each basis multiplies. Written out because the screen says it too. */
export const OVERHEAD_BASIS_HINTS: Record<OverheadBasis, string> = {
  PER_KG: 'Times the kilograms CONSUMED — the order plus its wastage',
  PER_JOB: 'Added once, whatever the order size',
  PER_POUCH: 'Times the pouches on the order. Nothing on a roll',
  PER_DAY: 'Times make-ready plus running days, whichever rate model is on',
  PERCENT_MATERIAL: 'Film, ink and adhesive only',
  PERCENT_TOTAL: 'Everything else on the job, custom overheads excluded',
};

/** One works-defined overhead, as the costing receives it. */
export interface CustomOverhead {
  name: string;
  basis: OverheadBasis;
  amount: number;
}

/** The same, with what it came to on this job. */
export interface CustomOverheadCost extends CustomOverhead {
  cost: number;
}

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
  /** One blended rate, for `adhesiveCostModel: 'FLAT_GSM'`. */
  flatRatePerKg?: number;
  ratio: string;
  adhesiveRatePerKg: number;
  ethylAcetateRatePerKg: number;
  hardenerRatePerKg: number;
}

/** One blended ink rate, for `inkCostModel: 'FLAT_GSM'`. */
export interface CostingFlatInk {
  ratePerKg: number;
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
  /** Used only when `inkCostModel` is FLAT_GSM. */
  flatInk?: CostingFlatInk;
  adhesive: CostingAdhesive;
  solvent: CostingSolvent;

  /**
   * How the adhesive batch splits into its three parts.
   *
   * Separate from `adhesive.ratio`, which supplies the solids. The works'
   * sheet takes the solids from the ratio the office picks and the SPLIT from
   * a fixed row of the same table, so the two can differ — reproduced here
   * rather than quietly tidied, because the office reconciles against that
   * sheet. Null splits on the chosen ratio.
   */
  adhesiveSplitRatio?: string | null;

  /** A roll is not slit into pouches and carries no pouch-making charge. */
  makesPouches: boolean;

  /**
   * A punched handle, ticked on the line.
   *
   * Finishing rather than a style, so it reaches the costing separately from
   * `pouchType`. It replaces the ordinary making charge with the workbook's own
   * — see `pouchExpense`, which explains why it replaces rather than adds.
   */
  hasDPunch?: boolean;

  /**
   * A gusseted pouch, as the line has it.
   *
   * Reaches the costing for one reason: it chooses the making band. The gusset
   * depths themselves enlarge the film and are already in the weight.
   */
  isGazette?: boolean;

  /**
   * The style, which decides what making one costs: a zipper is charged across
   * the mouth by the metre, a D punch is made at its own flat rate. Null
   * charges nothing, because a style nobody has chosen has no charge.
   */
  pouchType?: PouchType | null;

  /**
   * The FINISHED pouch width, millimetres — what the zipper crosses.
   *
   * Not `filmWidthMm`, which is the flat sheet: a standup's bottom gusset
   * lengthens the film without widening the mouth the zipper is sewn into.
   */
  pouchWidthMm?: number;

  /**
   * Printing stations the job occupies — one cylinder each.
   *
   * NOT the number of colours priced. The works' sheet counts seven stations
   * on a job it prices four inks for, and the surcharge for the sixth and
   * seventh is charged on the stations: a station is occupied, and paid for,
   * whether or not its ink appears in the costing. Falls back to the colour
   * count when the caller has nothing better.
   */
  stationCount?: number | null;

  /**
   * Which machine this job runs on, by name, where the works has more than one
   * of a kind. Anything not named falls to the first of its kind on the list,
   * which is the works' own order.
   */
  machineChoice?: Partial<Record<MachineKind, string>> | null;

  /**
   * Ink GSM the STRUCTURE is weighed with, when it is stated rather than
   * derived.
   *
   * The works' sheet holds this at a flat figure — 1.8 — while pricing the
   * colours actually used, which on a four-colour job come to 0.55. Both
   * numbers are in the workbook and they do not agree, and the flat one is
   * what decides a pouch's weight there. Since the office costs against that
   * sheet, this follows it: the laminate is weighed with the works' figure and
   * the ink is priced colour by colour.
   *
   * Null derives it from the colours instead.
   */
  inkGsmOverride?: number | null;

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
  /**
   * Days the job occupies the works: make-ready plus running.
   *
   * Computed under both rate models. Only the CHARGE below is conditional —
   * a works-defined overhead may be per day whether or not the crew is.
   */
  occupiedDays: number;
  /** What those days cost — crew and bank. Zero under `PER_MINUTE`. */
  worksDayCost: number;
  electricityCost: number;
  labourCost: number;
  transportCost: number;
  packingCost: number;
  otherCost: number;
  emiCost: number;
  /** The works' own overheads, each with what it came to on this job. */
  customOverheads: CustomOverheadCost[];
  /** Their total, already inside `overheadCost`. */
  customOverheadCost: number;
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
  /** The pouch charge spread over a kilogram — what the rate actually carries. */
  pouchMakingPerKg: number;
  /**
   * And what it is made of, on one pouch.
   *
   * Reported so the breakdown can show the working: a standup zipper at
   * Rs 0.718 is Rs 0.25 of making and Rs 0.468 of zipper, and "0.718" on its
   * own is a figure nobody can check. Zero throughout on a roll, and on a line
   * where the office has overridden the charge — the parts no longer add up to
   * what is being charged, so reporting them would be a lie.
   */
  pouchExpense: PouchExpense;
  ratePerKg: number;

  /* --- and what that is per piece --------------------------------------- */
  pieceWeightG: number;
  piecesPerKg: number;
  ratePerPiece: number;

  /* --- margin, both ways -------------------------------------------------
   * The works' sheet has one margin concept — material cost times nine per
   * cent — and no gross/net split at all. But its own labelled totals map onto
   * both exactly: B is the materials, and A + C + D plus the per-kilogram
   * additions are everything else. So these are its buckets, read the two ways
   * an accountant reads them.
   */

  /** The sheet's B, per kilogram ORDERED. Film, ink and solvent, adhesive. */
  materialCostPerKg: number;
  /** Every bucket, per kilogram ordered — A + B + C + D and the per-kg extras. */
  fullCostPerKg: number;

  /**
   * Margin over materials alone, at the suggested rate.
   *
   * The figure a printer quotes across a table, and the one that flatters a
   * small order: materials cost the same per kilogram at any volume, so a
   * higher rate on a short run looks like more profit when the setup it has to
   * carry has not been counted.
   */
  grossMarginPercent: number;
  /** Margin over everything, at the suggested rate. What the job actually earns. */
  netMarginPercent: number;
}

// ---------------------------------------------------------------------------

const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);

/**
 * Margin as a share of the SELLING rate, which is how a margin is read.
 *
 * Not the mark-up on cost: nine per cent added to a cost is 8.26% of the price
 * it produces, and quoting the first figure as a margin overstates every job.
 */
export function marginPercentOf(ratePerKg: number, costPerKg: number): number {
  if (ratePerKg <= 0) return 0;
  return round(((ratePerKg - costPerKg) / ratePerKg) * 100, 2);
}

/**
 * Both margins at a rate somebody actually typed.
 *
 * The suggested rate is only a suggestion; what the office decides to charge is
 * the number these have to be measured against, or the screen reports the
 * margin on a price nobody is offering.
 */
export function marginsAt(
  ratePerKg: number,
  breakdown: Pick<CostingBreakdown, 'materialCostPerKg' | 'fullCostPerKg'>,
): { grossPercent: number; netPercent: number } {
  return {
    grossPercent: marginPercentOf(ratePerKg, breakdown.materialCostPerKg),
    netPercent: marginPercentOf(ratePerKg, breakdown.fullCostPerKg),
  };
}

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

/**
 * What a press draws with this many colours on it.
 *
 * Their sheet does not charge the full connected load on every job: the main
 * drive runs alone until the third colour, and a 12 HP station motor comes on
 * at the third, the fourth and the sixth. A two-colour job therefore draws
 * 30 HP where a seven-colour job draws 66, and charging 66 throughout overstated
 * electricity on every job short of a full press — by Rs 1.53 a kilogram on a
 * two-colour one.
 *
 * A machine with no station load keeps its horsepower whatever it prints.
 */
export function machineHorsepower(machine: CostingMachine, colours: number): number {
  const perStation = machine.stationHorsepower ?? 0;
  const steps = machine.stationColourSteps ?? [];
  if (perStation <= 0 || steps.length === 0) return machine.horsepower;

  const live = steps.filter((step) => step > 0 && colours >= step).length;
  return round(machine.horsepower + perStation * live, 4);
}

/** Splits "3,4,6" into the colours that switch each station motor on. */
export function parseStationSteps(steps: string): number[] {
  return steps
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
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
  /*
   * The structure's ink weight. Stated by the works where they state it —
   * see `inkGsmOverride`; the colours still price it.
   */
  const inkGsm =
    job.inkGsmOverride !== null && job.inkGsmOverride !== undefined && job.inkGsmOverride >= 0
      ? round(job.inkGsmOverride, 4)
      : round(inkGsmOf(job.colours), 4);
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

  /*
   * Estimation prices the whole ink laydown at one blended rate — no solids,
   * no solvent — and that is the model its headline figure is built from. The
   * per-colour breakdown is still returned either way, so the office can see
   * what the detailed method would have said.
   */
  const inkCost =
    overheads.inkCostModel === 'FLAT_GSM'
      ? round((inkGsm / totalGsm) * consumedKg * (job.flatInk?.ratePerKg ?? 0), 2)
      : round(sum(colours.map((colour) => colour.cost)), 2);

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
  const parts = parseAdhesiveRatio(job.adhesiveSplitRatio || job.adhesive.ratio) ?? [100, 0, 0];
  const partsTotal = parts[0] + parts[1] + parts[2];
  const adhesiveKg = round((parts[0] / partsTotal) * batchKg, 4);
  const ethylAcetateKg = round((parts[1] / partsTotal) * batchKg, 4);
  const hardenerKg = round((parts[2] / partsTotal) * batchKg, 4);

  const adhesiveCost =
    overheads.adhesiveCostModel === 'FLAT_GSM'
      ? round(
          (adhesiveGsm / totalGsm) *
            consumedKg *
            (job.adhesive.flatRatePerKg ?? job.adhesive.adhesiveRatePerKg),
          2,
        )
      : round(
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

  /*
   * Printing stations the job occupies.
   *
   * NOT the number of colours priced: the works' sheet counts seven stations on
   * a job it prices four inks for, because a station is occupied — drawing
   * power and paid a surcharge — whether or not its ink appears in the costing.
   */
  const stationsOn =
    job.stationCount !== null && job.stationCount !== undefined && job.stationCount > 0
      ? job.stationCount
      : job.colours.length;

  /* --- machines, and the people on them ---------------------------------
   * Printing runs the first ply. Lamination runs each ply after it — one pass
   * per ply, which is what a laminator does. Slitting runs the printed length
   * again. Pouch making is charged per kilogram, not by the minute.
   */
  const laminationPasses = Math.max(0, layers.length - 1);

  /**
   * **One machine of each kind, not all of them.**
   *
   * The works runs two laminators. The loop below charges a machine for the
   * metres its KIND has to run, so passing both would bill the job for two
   * lamination passes it never made — quietly, and on every quotation, because
   * nothing about the total says which machine it came from.
   *
   * So a job runs on one of each kind, chosen in this order:
   *
   *   1. the machine this JOB names, which is a decision about one job
   *   2. the machine the works has marked as the one it runs
   *   3. the first of that kind on the list
   *
   * The middle one was missing, and its absence had a cost: a works whose new
   * laminator is faster than the old one priced every job on the old one,
   * because the old one happened to be first. Third place is kept as the
   * fallback so a works that has marked nothing is costed exactly as before.
   */
  const chosenMachines = (() => {
    const byKind = new Map<MachineKind, CostingMachine>();
    const rank = (machine: CostingMachine): number => {
      if (job.machineChoice?.[machine.kind] === machine.name) return 0;
      if (machine.isDefault) return 1;
      return 2;
    };

    for (const machine of machines) {
      const held = byKind.get(machine.kind);
      if (!held || rank(machine) < rank(held)) byKind.set(machine.kind, machine);
    }
    return [...byKind.values()];
  })();

  const processes: ProcessCost[] = [];
  for (const machine of chosenMachines) {
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
    const setupFactor = machine.setupPowerFactor ?? 0;
    const poweredMinutes = runMinutes + machine.setupMinutes * setupFactor;

    /*
     * The press draws what the colours on it draw — see `machineHorsepower`.
     * Stations, not priced colours: a station is inked and drawing whether or
     * not its ink appears in the costing.
     */
    const electricityCost = round(
      ((machineHorsepower(machine, stationsOn) * machine.powerRatePerHpHour) / 60) * poweredMinutes,
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

  /*
   * --- per piece, BEFORE the overheads ------------------------------------
   *
   * The pouch charge is per pouch, so the rate cannot be finished until the
   * count is known — and a works-defined overhead may be per pouch too, which
   * is why this now sits above them rather than between them and the rate.
   */
  const ownPieceWeightG = round((job.filmWidthMm * job.filmHeightMm * totalGsm) / 1_000_000, 4);
  const piecesPerKg =
    job.piecesPerKgOverride && job.piecesPerKgOverride > 0
      ? round(job.piecesPerKgOverride, 4)
      : ownPieceWeightG > 0
        ? round(1000 / ownPieceWeightG, 4)
        : 0;
  const pieceWeightG = piecesPerKg > 0 ? round(1000 / piecesPerKg, 4) : ownPieceWeightG;

  /* --- everything else --------------------------------------------------- */
  const transportCost = round(consumedKg * overheads.transportPerKg, 2);
  const packingCost = round(consumedKg * overheads.packingPerKg, 2);
  const otherCost = round(overheads.otherPerJob, 2);

  const emiPerMinute =
    overheads.emiHoursPerMonth > 0 ? overheads.emiPerMonth / (overheads.emiHoursPerMonth * 60) : 0;
  const emiMinutes =
    overheads.emiBasis === 'OCCUPIED'
      ? totalMachineMinutes
      : round(sum(processes.map((process) => process.runMinutes)), 2);
  const perMinuteEmiCost = round(emiPerMinute * emiMinutes, 2);

  /*
   * --- the works' own time ------------------------------------------------
   *
   * Under PER_DAY the crew and the bank are paid by the day rather than by the
   * minute, and the days are make-ready plus running. Make-ready is the same
   * whatever the order is, which is the entire reason a bigger order comes out
   * cheaper — and it is the thing the works' own job card records in a box and
   * then charges nothing for.
   *
   * Machine electricity is untouched either way. That is what keeps one
   * laminator distinguishable from another.
   */
  const perDay = overheads.rateModel === 'PER_DAY';

  /*
   * Running time comes from the machines: the metres each one has to cover at
   * the speed the works recorded for it, plus its setup. That is already
   * `totalMachineMinutes`, and it is why a three-ply job takes longer than a
   * two-ply one of the same weight, and why a slower laminator costs more.
   *
   * Kilograms are the fallback for a line with no costed structure — a figure
   * typed straight onto a quotation, where there are no metres to work from.
   */
  const minutesPerDay = overheads.machineMinutesPerDay ?? 0;
  const kgPerDay = overheads.kgPerDay ?? 0;
  const runningDays =
    totalMachineMinutes > 0 && minutesPerDay > 0
      ? totalMachineMinutes / minutesPerDay
      : kgPerDay > 0
        ? job.orderQtyKg / kgPerDay
        : 0;

  /*
   * Days are worked out under BOTH models; only the charge is conditional.
   *
   * A works-defined overhead may be per day — a rented compressor, a shift
   * allowance — whether or not the crew is paid that way, and it would be a
   * trap for it to silently come to nothing because a switch elsewhere is set
   * to per-minute.
   */
  const occupiedDays = round((overheads.makeReadyDays ?? 0) + runningDays, 4);
  const worksDayCost = perDay ? round(occupiedDays * (overheads.worksDayCost ?? 0), 2) : 0;

  /* Under PER_DAY the day charge REPLACES the per-minute crew and EMI; it does
     not sit on top of them, which would bill the same people twice. */
  const chargedLabourCost = perDay ? 0 : labourCost;
  const emiCost = perDay ? 0 : perMinuteEmiCost;

  const fixedOverheadCost = round(
    chargedLabourCost + worksDayCost + transportCost + packingCost + otherCost + emiCost,
    2,
  );

  /*
   * --- the works' own overheads -------------------------------------------
   *
   * Each carries the basis it is charged on, because the engine cannot guess:
   * "Maintenance 5000" is three orders of magnitude apart read per job and read
   * per kilogram.
   *
   * `PERCENT_TOTAL` is taken on everything else on the job and NOT on the other
   * custom overheads. Including them would be circular — the total contains the
   * percentage that is being worked out from it — and defining it away is
   * better than picking an arbitrary pass count nobody could explain.
   */
  const pouchesOnOrder = job.makesPouches ? job.orderQtyKg * piecesPerKg : 0;
  const costBeforeCustom = round(materialCost + fixedOverheadCost + electricityCost, 2);

  const customOverheads: CustomOverheadCost[] = (overheads.customOverheads ?? []).map(
    (overhead) => {
      const amount = Number.isFinite(overhead.amount) ? overhead.amount : 0;
      const cost =
        overhead.basis === 'PER_KG'
          ? amount * consumedKg
          : overhead.basis === 'PER_JOB'
            ? amount
            : overhead.basis === 'PER_POUCH'
              ? amount * pouchesOnOrder
              : overhead.basis === 'PER_DAY'
                ? amount * occupiedDays
                : overhead.basis === 'PERCENT_MATERIAL'
                  ? (materialCost * amount) / 100
                  : (costBeforeCustom * amount) / 100;
      return { ...overhead, amount, cost: round(cost, 2) };
    },
  );

  const customOverheadCost = round(sum(customOverheads.map((overhead) => overhead.cost)), 2);

  const overheadCost = round(fixedOverheadCost + customOverheadCost, 2);

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
  const extraStations = Math.max(0, stationsOn - 5);
  const stationSurchargePerKg = round(sum(overheads.stationSurcharges.slice(0, extraStations)), 4);

  /*
   * What making one pouch costs, and what that comes to on a kilogram of them.
   *
   * A roll is made into nothing and pays neither. The office's own figure, when
   * it has set one, replaces the whole charge rather than any part of it — it
   * is stated per kilogram because that is the unit it overrides, and it is
   * what quotations written before this was per pouch still carry.
   */
  const expense: PouchExpense = job.makesPouches
    ? pouchExpense(
        job.pouchType,
        job.pouchWidthMm ?? job.filmWidthMm,
        overheads.pouchMaking,
        job.hasDPunch ?? false,
      )
    : NO_POUCH_EXPENSE;

  /*
   * **The making charge, by the kilogram.**
   *
   * Three sources, in order of who decided:
   *
   * 1. The office's own figure on the line, which replaces the whole charge.
   * 2. The works' three bands — plain, gusset, gusset with handle — which is
   *    how the works has priced making since October 2026.
   * 3. The per-pouch rate, for anything priced before those bands existed and
   *    for a works that has not set them.
   *
   * The ZIPPER is added on top of all three: it is a part bought in by the
   * metre rather than an operation, and the bands say nothing about it.
   */
  const override = overheads.pouchMakingPerKgOverride;

  const pouchMakingPerKg = !job.makesPouches
    ? 0
    : override !== null && override !== undefined
      ? round(override, 4)
      : /* Steps 2 and 3, which the quotation form must read the same way —
           see `pouchMakingInForce`. */
        pouchMakingInForce(
          { isGazette: job.isGazette, hasDPunch: job.hasDPunch },
          expense,
          overheads.pouchMakingBands,
          piecesPerKg,
        );

  const ratePerKg = round(baseRatePerKg + stationSurchargePerKg + pouchMakingPerKg, 2);
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
  const materialCostPerKg = round(materialCost / job.orderQtyKg, 4);
  const fullCostPerKg = round(
    costBeforeMargin / job.orderQtyKg + stationSurchargePerKg + pouchMakingPerKg,
    4,
  );

  const grossMarginPercent = marginPercentOf(ratePerKg, materialCostPerKg);
  const netMarginPercent = marginPercentOf(ratePerKg, fullCostPerKg);

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
    occupiedDays,
    worksDayCost,
    electricityCost,
    /* What was actually billed — zero under PER_DAY, where the day covers it. */
    labourCost: chargedLabourCost,
    transportCost,
    packingCost,
    otherCost,
    emiCost,
    customOverheads,
    customOverheadCost,
    overheadCost,

    costBeforeMargin,
    marginBasis: overheads.marginBasis,
    marginPercent: overheads.marginPercent,
    marginAmount,
    totalCost,

    baseRatePerKg,
    stationSurchargePerKg,
    pouchMakingPerKg,
    pouchExpense: override !== null && override !== undefined ? NO_POUCH_EXPENSE : expense,
    ratePerKg,

    pieceWeightG,
    piecesPerKg,
    ratePerPiece,

    materialCostPerKg,
    fullCostPerKg,
    grossMarginPercent,
    netMarginPercent,
  };
}
