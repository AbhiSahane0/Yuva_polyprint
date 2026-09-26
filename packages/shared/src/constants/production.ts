import { MACHINE_KINDS, type MachineKind } from '../lib/rate-costing.js';

/**
 * A job card's stages are the works' four processes, in the order a job meets
 * them. The vocabulary is already `MachineKind` — the same list the Costing
 * screen holds machines against — rather than a second one free to drift.
 */
export const PRODUCTION_STAGES = MACHINE_KINDS;
export type ProductionStage = MachineKind;

export const PRODUCTION_STAGE_LABELS: Record<ProductionStage, string> = {
  PRINTING: 'Rotogravure printing',
  LAMINATION: 'Lamination',
  SLITTING: 'Slitting',
  POUCHING: 'Pouch making',
};

/** Where a job card as a whole has got to. */
export const PRODUCTION_STATUSES = ['PLANNED', 'RUNNING', 'ON_HOLD', 'COMPLETED'] as const;
export type ProductionStatus = (typeof PRODUCTION_STATUSES)[number];

export const PRODUCTION_STATUS_LABELS: Record<ProductionStatus, string> = {
  PLANNED: 'Planned',
  RUNNING: 'Running',
  ON_HOLD: 'On hold',
  COMPLETED: 'Completed',
};

/**
 * **A hold is temporary, so it is the one move that goes back.**
 *
 * Everything else is one-way, as an order's statuses are: a completed job card
 * returning to running is the kind of thing nobody notices until the month's
 * output disagrees with the floor's. "Delayed" is not here at all — it is the
 * due date compared with today, not a state anybody sets.
 */
export const PRODUCTION_STATUS_FLOW: Record<ProductionStatus, readonly ProductionStatus[]> = {
  PLANNED: ['RUNNING', 'ON_HOLD', 'COMPLETED'],
  RUNNING: ['ON_HOLD', 'COMPLETED'],
  ON_HOLD: ['RUNNING', 'COMPLETED'],
  COMPLETED: [],
};

export function canMoveProductionTo(from: ProductionStatus, to: ProductionStatus): boolean {
  return from === to || PRODUCTION_STATUS_FLOW[from].includes(to);
}

/** Where one stage has got to. */
export const STAGE_STATUSES = ['PENDING', 'RUNNING', 'DONE', 'SKIPPED'] as const;
export type StageStatus = (typeof STAGE_STATUSES)[number];

export const STAGE_STATUS_LABELS: Record<StageStatus, string> = {
  PENDING: 'Not started',
  RUNNING: 'Running',
  DONE: 'Done',
  SKIPPED: 'Skipped — not required',
};

/** One stage as the derivation hands it over: what it is, and its place in the run. */
export interface RequiredStage {
  stage: ProductionStage;
  /** 1-based, the order the job meets them in. */
  position: number;
  /** Which lamination pass this is, 1 or 2. Zero on every other stage. */
  pass: number;
}

/**
 * **Which stages a job actually needs.**
 *
 * The pitch's central claim is that not every product goes through every
 * process — a roll skips pouch making, a single-ply job has nothing to
 * laminate — and that the system knows without being told each time.
 *
 * It is derived from the **structure**, which is what the costing already does:
 * the same ply count that decides how many lamination passes to charge for
 * decides how many to run. So a job card and the quotation behind it cannot
 * disagree about what the job involves, and there is no third place to keep in
 * step.
 *
 * Four rules, each of which is the works' own arithmetic rather than a policy:
 *
 * - **Printing** unless the job prints nothing. An unprinted film still gets
 *   slit and made up; it simply never reaches the press.
 * - **Lamination once per bond** — three plies is two passes, which is why a
 *   three-ply job takes longer than a two-ply one of the same weight. Each pass
 *   is its own row: it is a separate run, on a machine, with its own operator
 *   and its own waste, and the works' own job sheet names them Lamination 1
 *   and Lamination 2.
 * - **Slitting** always. Everything comes off the machine wider than it is sold.
 * - **Pouch making** only where pouches are made. A reel is not converted into
 *   anything.
 *
 * The office may still tick a stage off or put one back on the card — this is
 * the starting point, not a ruling. A works that sends one job out for
 * lamination should not have to argue with the software about it.
 */
export function requiredStages(job: {
  /** Plies with a real thickness. Two is the ordinary laminate. */
  plyCount: number;
  /** False for a reel, which is not converted into anything. */
  makesPouches: boolean;
  /** False for plain unprinted film, which never reaches the press. */
  isPrinted?: boolean;
}): RequiredStage[] {
  const stages: RequiredStage[] = [];
  const add = (stage: ProductionStage, pass = 0) =>
    stages.push({ stage, position: stages.length + 1, pass });

  if (job.isPrinted !== false) add('PRINTING');

  const passes = Math.max(0, Math.floor(job.plyCount) - 1);
  for (let pass = 1; pass <= passes; pass += 1) add('LAMINATION', pass);

  add('SLITTING');
  if (job.makesPouches) add('POUCHING');

  return stages;
}

/**
 * How far along a job card is, as a percentage.
 *
 * **Derived, never stored.** A number somebody keeps updating is a number that
 * is wrong between updates, and the stages already say everything it could.
 * Skipped stages are left out of both halves — a job that skips three of four
 * is not three-quarters done before it starts.
 */
export function productionProgress(stages: { status: StageStatus }[]): number {
  const applicable = stages.filter((s) => s.status !== 'SKIPPED');
  if (applicable.length === 0) return 0;
  const done = applicable.filter((s) => s.status === 'DONE').length;
  return Math.round((done / applicable.length) * 100);
}

/**
 * What a stage lost: what went in, less what came out.
 *
 * Negative is possible and is left alone rather than floored — more coming off
 * a machine than went onto it means one of the two weights is wrong, and the
 * screen showing a quiet zero is how that goes unnoticed. The works' own
 * Samarth Atta job sheet does exactly this.
 */
export function stageWasteKg(stage: { inputKg: number; outputKg: number }): number {
  const input = Number.isFinite(stage.inputKg) ? stage.inputKg : 0;
  const output = Number.isFinite(stage.outputKg) ? stage.outputKg : 0;
  if (input === 0 && output === 0) return 0;
  return Math.round((input - output) * 1000) / 1000;
}

/**
 * Whether that figure means anything yet.
 *
 * Waste is the difference between two weights, so it is not a fact until both
 * have been weighed. A stage part-way through has the film on the machine and
 * nothing off it — reporting the whole input as waste says the run has lost
 * everything, which is the opposite of what is happening.
 *
 * A FINISHED stage with nothing out is different, and is left alone to say so
 * loudly: that really is a run that produced nothing, and it should not be
 * hidden behind a dash.
 */
export function stageWasteKnown(stage: {
  inputKg: number;
  outputKg: number;
  status: StageStatus;
}): boolean {
  if (stage.inputKg === 0 && stage.outputKg === 0) return false;
  return stage.outputKg > 0 || stage.status === 'DONE';
}
