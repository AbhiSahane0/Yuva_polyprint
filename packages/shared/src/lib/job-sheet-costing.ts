import { round } from './quotation-math.js';

/**
 * **What a job actually cost, once it has run.**
 *
 * This is the works' September 2026 Job Sheet, which is a different document
 * from the quotation and answers a different question. A quotation estimates a
 * price from a design: so many microns of film, so many stations, so many
 * minutes on the press. A job sheet costs a *run*: what actually went out to
 * the floor, what came back, and what the difference was worth. One is a
 * forecast and the other is the settled fact, and the works keeps both because
 * the gap between them is the only place an estimate can be caught being wrong.
 *
 * The arithmetic is deliberately plain — issued minus returned, times a rate —
 * and every interesting decision in it is about the things that are *shared*.
 *
 * ### The mix drums
 *
 * Neither ink nor adhesive goes to the press as bought. Both are mixed, and the
 * works books the mixed drum back to its ingredients at a fixed recipe:
 *
 * | Printing mix | Lamination mix |
 * | --- | --- |
 * | 40% pigment | 40% adhesive (NCO) |
 * | 40% ethyl acetate | 5% hardener (OH) |
 * | 20% toluene | 60% ethyl acetate |
 *
 * So a line's consumption is what it drew neat *plus* its share of the drum.
 * The printing recipe comes to 100%; the lamination one to 105%, which is the
 * works' own figure and is left exactly as they have it — a recipe is a fact
 * about a process, not an identity that has to sum.
 *
 * Which drum a line draws from is the caller's business, not this module's: an
 * ink takes a share of *its own* mix, while the solvents take a share of the
 * *pooled* mix across every colour. Both arrive here as a mix issued and a mix
 * returned, so the sum below is the same either way.
 *
 * ### Why every figure can be overridden
 *
 * Two of the works' fourteen sheets have a typed number sitting on top of a
 * formula — someone replaced a White ink consumption of 23.52 with 14.5,
 * because the 23.52 was wrong and the drum in front of them was not. That one
 * override is worth Rs 2,164.80 on a Rs 65,000 job.
 *
 * A system that cannot be corrected by the person holding the drum gets
 * corrected somewhere else, in a spreadsheet nobody can see. So consumption is
 * computed and every line may be overridden, with the computed figure kept
 * beside it so the correction is visible rather than silent.
 */

/** The two halves of the works: the press, and the laminator. */
export const JOB_SHEET_STAGES = [
  'PRINTING',
  'LAMINATION_1',
  'LAMINATION_2',
  'SLITTING',
  'POUCHING',
] as const;
export type JobSheetStage = (typeof JOB_SHEET_STAGES)[number];

export const JOB_SHEET_STAGE_LABELS: Record<JobSheetStage, string> = {
  PRINTING: 'Printing',
  LAMINATION_1: 'Lamination 1',
  LAMINATION_2: 'Lamination 2',
  SLITTING: 'Slitting',
  POUCHING: 'Pouching',
};

/** One consumable, as it was issued and returned. */
export interface JobSheetLineInput {
  /** What it is, for the reader: `12 PET Polyester`, `Cyan`, `Hardener`. */
  name: string;
  /** Taken to the floor. */
  issuedKg: number;
  /** Brought back. */
  returnedKg: number;
  /**
   * The mixed drum this line draws a share of. Zero on anything used neat.
   *
   * For an ink this is its own mix; for a solvent it is the pooled mix across
   * every colour. The caller decides which, because only the caller knows how
   * the works stores it.
   */
  mixIssuedKg: number;
  mixReturnedKg: number;
  /** This line's share of that drum, as a percentage. */
  mixSharePercent: number;
  /**
   * The consumption the office typed instead, when the computed one was wrong.
   * Null means use the computed figure.
   */
  consumedOverrideKg: number | null;
  /** Rupees a kilogram, as at the day of the run. */
  ratePerKg: number;
}

/** One consumable, costed. */
export interface JobSheetLineCost extends JobSheetLineInput {
  /** What the issue and return figures work out to. */
  computedKg: number;
  /** What the sheet is actually costing — the override where there is one. */
  consumedKg: number;
  /** True when the two differ, so the document can say so. */
  isOverridden: boolean;
  amount: number;
}

/** One process the electricity meter is shared out between. */
export interface JobSheetStageInput {
  stage: JobSheetStage;
  /** This stage's share of a day's electricity. */
  sharePercent: number;
  /** Days this stage ran. Zero takes it off the bill entirely. */
  days: number;
  /** Shifts a day. Pouching is routinely two. */
  shifts: number;
}

/** One line of the wage bill. */
export interface JobSheetLabourInput {
  role: string;
  headcount: number;
  ratePerDay: number;
  days: number;
}

export interface JobSheetLabourCost extends JobSheetLabourInput {
  amount: number;
}

export interface JobSheetCostInput {
  lines: JobSheetLineInput[];

  /** A day's electricity for the whole works, shared out by stage. */
  electricityPerDay: number;
  stages: JobSheetStageInput[];
  labour: JobSheetLabourInput[];

  /** Rupees a kilogram of material *brought in*, not of finished goods. */
  transportPerKg: number;
  /** Rupees a kilogram of pouching. Zero on a roll job. */
  pouchingPerKg: number;
  pouchingWeightKg: number;
  /** A lump the office types: cartons, tape, stretch film. */
  packagingCost: number;
  emiPerDay: number;
  emiDays: number;
  /** Ten per cent, and of the material only. See `profit` below. */
  profitPercent: number;

  /**
   * Any overhead the office settled by hand. A sheet that types its own
   * electricity figure means the works knows something the model does not.
   */
  overrides?: Partial<
    Record<
      'electricity' | 'salary' | 'transport' | 'pouching' | 'packaging' | 'emi' | 'profit',
      number | null
    >
  >;

  /** Good laminate off the machine, before slitting losses. */
  producedKg: number;
  /** What was finally packed. The figure the cost is divided by. */
  finalOutputKg: number;
  /** What the works allows itself to lose. Five per cent. */
  expectedWastagePercent: number;
}

export interface JobSheetCost {
  lines: JobSheetLineCost[];
  labour: JobSheetLabourCost[];
  stages: (JobSheetStageInput & { amount: number })[];

  /** Total kilograms consumed, across every line. */
  materialKg: number;
  /** The basic cost: every line's amount. */
  materialCost: number;
  /** Rupees a kilogram of input — what the job was made of, before the works. */
  basicValuePerKg: number;

  electricityCost: number;
  salaryCost: number;
  transportCost: number;
  pouchingCost: number;
  packagingCost: number;
  emiCost: number;
  profit: number;
  overheadCost: number;

  /** Material plus everything above it. */
  effectivePrice: number;
  /** The answer: what a kilogram of finished goods cost to make. */
  costPerKg: number;

  expectedWastageKg: number;
  actualWastageKg: number;
  wastagePercent: number;
  /** What the wastage over the allowance cost, in rupees. */
  excessCost: number;
}

/** Zero rather than NaN: a missing figure is nothing, never an error on a page. */
function at(value: number | null | undefined): number {
  return Number.isFinite(value) ? (value as number) : 0;
}

/** An override only counts when somebody actually set one. */
function settled(override: number | null | undefined, computed: number): number {
  return override === null || override === undefined ? computed : at(override);
}

/**
 * What one line consumed: what it drew neat, plus its share of the drum.
 *
 * Both halves are issued-minus-returned, which is why a drum that came back
 * fuller than it went out reads as a negative — the works' own sheets carry a
 * handful of those, where a colour was topped up from a previous job's
 * leftovers. They are left negative rather than floored at zero: the figure is
 * a correction to an earlier job's cost, and hiding it would quietly overstate
 * this one.
 */
export function consumedKg(line: JobSheetLineInput): number {
  const neat = at(line.issuedKg) - at(line.returnedKg);
  const mix = at(line.mixIssuedKg) - at(line.mixReturnedKg);
  return neat + (at(line.mixSharePercent) / 100) * mix;
}

/** What a stage drew off the meter. */
export function stageElectricity(stage: JobSheetStageInput, perDay: number): number {
  return at(perDay) * (at(stage.sharePercent) / 100) * at(stage.days) * at(stage.shifts);
}

/** One role's wages for the run. */
export function labourAmount(line: JobSheetLabourInput): number {
  return at(line.ratePerDay) * at(line.headcount) * at(line.days);
}

/**
 * The whole sheet, costed.
 *
 * Nothing is rounded until it is returned. The works' sheets carry full
 * precision through every intermediate — a cost per kilogram is a division at
 * the very end of a chain of forty figures — and rounding on the way would
 * leave the app disagreeing with the spreadsheet by a few paise on every job,
 * which is exactly the kind of difference that costs an afternoon to explain.
 */
export function costJobSheet(input: JobSheetCostInput): JobSheetCost {
  const lines: JobSheetLineCost[] = input.lines.map((line) => {
    const computed = consumedKg(line);
    const used = settled(line.consumedOverrideKg, computed);
    return {
      ...line,
      computedKg: round(computed, 4),
      consumedKg: round(used, 4),
      isOverridden: line.consumedOverrideKg !== null && line.consumedOverrideKg !== undefined,
      amount: round(used * at(line.ratePerKg), 2),
    };
  });

  const materialKg = input.lines.reduce(
    (sum, line) => sum + settled(line.consumedOverrideKg, consumedKg(line)),
    0,
  );
  const materialCost = input.lines.reduce(
    (sum, line) => sum + settled(line.consumedOverrideKg, consumedKg(line)) * at(line.ratePerKg),
    0,
  );

  const stages = input.stages.map((stage) => ({
    ...stage,
    amount: round(stageElectricity(stage, input.electricityPerDay), 2),
  }));
  const labour = input.labour.map((line) => ({ ...line, amount: round(labourAmount(line), 2) }));

  const o = input.overrides ?? {};
  const electricityCost = settled(
    o.electricity,
    input.stages.reduce((sum, stage) => sum + stageElectricity(stage, input.electricityPerDay), 0),
  );
  const salaryCost = settled(
    o.salary,
    input.labour.reduce((sum, line) => sum + labourAmount(line), 0),
  );
  const transportCost = settled(o.transport, materialKg * at(input.transportPerKg));
  const pouchingCost = settled(o.pouching, at(input.pouchingWeightKg) * at(input.pouchingPerKg));
  const packagingCost = settled(o.packaging, at(input.packagingCost));
  const emiCost = settled(o.emi, at(input.emiPerDay) * at(input.emiDays));

  /*
   * Ten per cent of the MATERIAL, not of the loaded cost.
   *
   * It reads like an oversight and it is not one: every other figure on the
   * sheet is a cost the works can point at, and the margin is taken on what was
   * bought and converted. Charging it on the electricity and the wages as well
   * would take a margin on the works' own overheads, which is a different and
   * larger number — on these fourteen jobs, between 12% and 19% more profit
   * than the works believes it is making.
   */
  const profit = settled(o.profit, materialCost * (at(input.profitPercent) / 100));

  const overheadCost =
    electricityCost + salaryCost + transportCost + pouchingCost + packagingCost + emiCost + profit;
  const effectivePrice = materialCost + overheadCost;

  const output = at(input.finalOutputKg);
  const costPerKg = output > 0 ? effectivePrice / output : 0;

  const expectedWastageKg = at(input.producedKg) * (at(input.expectedWastagePercent) / 100);
  const actualWastageKg = at(input.producedKg) - output;

  return {
    lines,
    labour,
    stages,

    materialKg: round(materialKg, 3),
    materialCost: round(materialCost, 2),
    basicValuePerKg: materialKg !== 0 ? round(materialCost / materialKg, 2) : 0,

    electricityCost: round(electricityCost, 2),
    salaryCost: round(salaryCost, 2),
    transportCost: round(transportCost, 2),
    pouchingCost: round(pouchingCost, 2),
    packagingCost: round(packagingCost, 2),
    emiCost: round(emiCost, 2),
    profit: round(profit, 2),
    overheadCost: round(overheadCost, 2),

    effectivePrice: round(effectivePrice, 2),
    costPerKg: round(costPerKg, 2),

    expectedWastageKg: round(expectedWastageKg, 3),
    actualWastageKg: round(actualWastageKg, 3),
    wastagePercent: output > 0 ? round((actualWastageKg / output) * 100, 2) : 0,
    excessCost: round((actualWastageKg - expectedWastageKg) * costPerKg, 2),
  };
}

/**
 * Which drum a line draws its share from.
 *
 * The distinction is the whole reason the mix columns exist, and it is easy to
 * get backwards. **An ink carries its own drum**: each colour is mixed
 * separately, so Cyan takes 40% of the Cyan drum and nothing of anybody
 * else's. **A solvent draws from the pool**: the ethyl acetate that went into
 * every drum that day is booked back as one figure, 40% of the total mixed,
 * because there is no per-colour ethyl to speak of.
 *
 * Get it the wrong way round and a seven-colour job books seven times the
 * solvent, which is the kind of error that looks plausible on one sheet and
 * absurd on a year of them.
 */
export function mixDrumFor(
  line: { kind: string; section: string; mixIssuedKg: number; mixReturnedKg: number },
  pools: {
    printMixIssuedKg: number;
    printMixReturnedKg: number;
    lamMixIssuedKg: number;
    lamMixReturnedKg: number;
  },
): { issued: number; returned: number } {
  if (line.kind === 'INK') return { issued: line.mixIssuedKg, returned: line.mixReturnedKg };
  return line.section === 'PRINTING'
    ? { issued: pools.printMixIssuedKg, returned: pools.printMixReturnedKg }
    : { issued: pools.lamMixIssuedKg, returned: pools.lamMixReturnedKg };
}
