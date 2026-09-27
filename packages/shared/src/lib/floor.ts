import type { StageStatus } from '../constants/production.js';
import { round } from './quotation-math.js';

/**
 * **The machine screen — what one operator, at one machine, can see and do.**
 *
 * A different screen for a different person, and the difference is the point.
 * The office screens are for deciding; this one is for a pair of hands with
 * ink on them, holding a tablet bolted to a press. It shows one job, four
 * buttons and nothing else, because everything else is a way to press the
 * wrong thing.
 *
 * The rules here are all about **what a machine is allowed to pick up**, which
 * is the one question the office screens never had to ask: they show a whole
 * card, and the card knows its own order. A machine sees a queue, and a queue
 * of work that cannot actually be started is worse than no queue at all.
 */

export const FLOOR_EVENT_KINDS = ['PAUSED', 'RESUMED', 'ISSUE'] as const;
export type FloorEventKind = (typeof FLOOR_EVENT_KINDS)[number];

export const FLOOR_EVENT_LABELS: Record<FloorEventKind, string> = {
  PAUSED: 'Paused',
  RESUMED: 'Restarted',
  ISSUE: 'Problem',
};

export interface StageForFloor {
  id: string;
  position: number;
  status: StageStatus;
}

/**
 * **Whether the reel has actually reached this stage yet.**
 *
 * A job passes down the floor in order, so a stage is only workable once
 * everything before it is done or was never needed. Without this the
 * lamination tablet would offer a job whose printing has not started, and the
 * operator would take it — the screen offered it.
 *
 * A stage already running counts as reachable, because it is the one in hand.
 */
export function isReachable(stages: StageForFloor[], stage: StageForFloor): boolean {
  if (stage.status === 'DONE' || stage.status === 'SKIPPED') return false;
  return stages
    .filter((other) => other.position < stage.position)
    .every((other) => other.status === 'DONE' || other.status === 'SKIPPED');
}

/**
 * Whether this machine may pick a stage up.
 *
 * Two ways in. A stage the office has **assigned** to this machine belongs to
 * it outright. A stage with no machine yet belongs to whichever machine of the
 * right **kind** gets to it first — the works has two laminators and does not
 * decide in the office which one a job lands on.
 *
 * A stage assigned to a different machine is never offered, even of the same
 * kind. Somebody chose, and a tablet quietly overriding that is how two
 * machines start the same job.
 */
export function machineMayRun(
  stage: { machineId: string | null; stage: string },
  machine: { id: string; kind: string },
): boolean {
  if (stage.machineId) return stage.machineId === machine.id;
  return stage.stage === machine.kind;
}

/**
 * What the run has lost so far.
 *
 * Input less output, and it is **not** clamped at zero: a stage that reports
 * more out than in is a weighing mistake, and showing it as a negative is how
 * anybody finds out. Silently flooring it to nought hides the error and quietly
 * inflates the yield.
 */
export function wasteKg(stage: { inputKg: number; outputKg: number }): number {
  if (!stage.outputKg) return 0;
  return round(stage.inputKg - stage.outputKg, 3);
}

/** The same as a percentage of what went in. Zero where nothing went in. */
export function wastePercent(stage: { inputKg: number; outputKg: number }): number {
  if (!stage.inputKg || !stage.outputKg) return 0;
  return round((wasteKg(stage) / stage.inputKg) * 100, 2);
}

/**
 * What the big button should say.
 *
 * One control, and what it does depends on where the job is — which is the
 * whole design of a machine screen. Four buttons that are each sometimes wrong
 * is four chances to press the wrong one with gloves on.
 */
export type FloorAction = 'START' | 'FINISH' | 'RESUME' | 'NONE';

export function floorAction(input: {
  cardStatus: 'PLANNED' | 'RUNNING' | 'ON_HOLD' | 'COMPLETED';
  stageStatus: StageStatus;
}): FloorAction {
  if (input.cardStatus === 'COMPLETED') return 'NONE';
  /* A held card says nothing else may happen until somebody restarts it —
     including finishing the stage that was running when it stopped. */
  if (input.cardStatus === 'ON_HOLD') return 'RESUME';
  if (input.stageStatus === 'RUNNING') return 'FINISH';
  if (input.stageStatus === 'PENDING') return 'START';
  return 'NONE';
}

/**
 * The order a machine's queue reads in.
 *
 * What is running comes first — there is only ever one, and it is the job in
 * hand. Then what is wanted soonest, because that is the only basis the floor
 * has for choosing between two jobs it could equally start. An undated order
 * sorts last: nobody promised it.
 */
export function floorQueueOrder(
  a: { isRunning: boolean; dueDate: string | null; cardNumber: number },
  b: { isRunning: boolean; dueDate: string | null; cardNumber: number },
): number {
  if (a.isRunning !== b.isRunning) return a.isRunning ? -1 : 1;
  if (a.dueDate !== b.dueDate) {
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate < b.dueDate ? -1 : 1;
  }
  return a.cardNumber - b.cardNumber;
}

/** Morning, afternoon or evening, for the one line of warmth on the screen. */
export function greeting(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
