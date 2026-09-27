import { round } from './quotation-math.js';

/**
 * **Planning — the gate between an order and the floor.**
 *
 * It answers two questions the rest of the system could not, and deliberately
 * stops there.
 *
 * **Can it run?** The material check already exists and is thorough — it works
 * out every ply, ink and adhesive, and it knows a reel too narrow is no use
 * whatever it weighs. What it could not do was run *before* a job card existed,
 * so the only way to find out whether an order could be made was to raise the
 * card and be told no. Planning asks the same question of the order itself.
 *
 * **When, and on what?** Nothing in the system held this. An order had a due
 * date, which is the customer's, and a job card had stages, which is the
 * floor's — and nothing in between said which press a job was booked onto next
 * Tuesday. That is the one genuinely new fact this module stores.
 *
 * Everything else here is worked out. A plan is two fields and an opinion; the
 * status, the estimate and the lateness are all derived, because a planning
 * board whose figures have to be maintained is a planning board nobody trusts
 * by Wednesday.
 */

/**
 * Where an order stands on its way to the floor.
 *
 * Ordered by how much attention each needs, worst first, which is also the
 * order the board sorts in.
 */
export const PLANNING_STATUSES = ['BLOCKED', 'READY', 'SCHEDULED', 'STARTED'] as const;
export type PlanningStatus = (typeof PLANNING_STATUSES)[number];

export const PLANNING_STATUS_LABELS: Record<PlanningStatus, string> = {
  BLOCKED: 'Short of material',
  READY: 'Ready to schedule',
  SCHEDULED: 'Scheduled',
  STARTED: 'On the floor',
};

/**
 * What an order's own facts say about it.
 *
 * **A shortage outranks a plan.** An order booked onto Tuesday's press with no
 * film is not scheduled in any useful sense — it is a problem with a date on
 * it, and the board has to say the problem.
 *
 * Once a card has been raised, planning is over: the floor owns it, the card
 * has its own stages and its own claim on the film, and this board would only
 * be a second opinion about a job already running.
 */
export function planningStatus(order: {
  hasCard: boolean;
  isShort: boolean;
  plannedStart: string | null;
}): PlanningStatus {
  if (order.hasCard) return 'STARTED';
  if (order.isShort) return 'BLOCKED';
  return order.plannedStart ? 'SCHEDULED' : 'READY';
}

/**
 * Roughly how many days the works will be on it.
 *
 * `makeReady + kg / kgPerDay`, both the works' own figures, fitted from their
 * fourteen September job sheets. The three-quarters of a day at the front is
 * most of the value: it is why 2,000 kg does not take twice as long as 1,000.
 *
 * **This is the kilogram fallback, not the real model.** Costing drives days
 * off machine *minutes*, because a 750 mm web at eight colours is not the same
 * job as a 990 mm web at one even when they weigh the same. Minutes need a
 * costed structure and a machine, and planning is asking before either is
 * settled — so it uses the cruder of the two and is read as an estimate. Good
 * enough to spot an order that cannot possibly make its date; not good enough
 * to promise an hour.
 */
export function estimateDays(input: {
  quantityKg: number;
  makeReadyDays: number;
  kgPerDay: number;
}): number {
  const kg = Number.isFinite(input.quantityKg) ? Math.max(0, input.quantityKg) : 0;
  const perDay = input.kgPerDay > 0 ? input.kgPerDay : 1945;
  const makeReady = Number.isFinite(input.makeReadyDays) ? Math.max(0, input.makeReadyDays) : 0;
  return round(makeReady + kg / perDay, 2);
}

/** `n` days on from a yyyy-mm-dd, as a yyyy-mm-dd. Calendar days. */
export function addDays(iso: string, days: number): string {
  const at = new Date(`${iso}T00:00:00.000Z`);
  at.setUTCDate(at.getUTCDate() + Math.ceil(days));
  return at.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`. Negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000,
  );
}

export interface PlanOutlook {
  /** The day it should come off, if it starts when it is planned to. */
  finish: string | null;
  /**
   * True when that day is after the customer's. The whole reason for planning
   * a date at all — a plan that cannot make its date is worth knowing about
   * while it is still only a plan.
   */
  landsLate: boolean;
  /** By how much. Zero unless it lands late. */
  daysLate: number;
}

/**
 * What a plan implies about the promise.
 *
 * Says nothing at all without both a planned start and a due date: an order
 * with no due date can never be late, and an unplanned one has no finish to
 * judge. Silence is the honest answer to both, rather than a zero that looks
 * like an answer.
 */
export function planOutlook(input: {
  plannedStart: string | null;
  days: number;
  dueDate: string | null;
}): PlanOutlook {
  if (!input.plannedStart) return { finish: null, landsLate: false, daysLate: 0 };
  const finish = addDays(input.plannedStart, input.days);
  if (!input.dueDate) return { finish, landsLate: false, daysLate: 0 };
  const over = daysBetween(input.dueDate, finish);
  return { finish, landsLate: over > 0, daysLate: Math.max(0, over) };
}

/**
 * The order a planning board reads in.
 *
 * Worst first, then soonest wanted. A board sorted by order number puts the
 * one that is short of film below the four that are fine, on the one morning
 * somebody could still do something about it.
 */
export function planningOrder(
  a: { status: PlanningStatus; dueDate: string | null; number: number },
  b: { status: PlanningStatus; dueDate: string | null; number: number },
): number {
  const rank = (status: PlanningStatus) => PLANNING_STATUSES.indexOf(status);
  if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status);
  /* No date sorts last: an order nobody promised is not urgent. */
  if (a.dueDate !== b.dueDate) {
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate < b.dueDate ? -1 : 1;
  }
  return a.number - b.number;
}
