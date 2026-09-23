/**
 * Which dated costing rows applied on a given day.
 *
 * **One rule, used by every costing figure that has a history**: the works'
 * own overheads, and the wages a process is charged at. Both answer the same
 * question — was this figure in force on the day that quotation was written —
 * and two copies of the answer is how the two come to disagree.
 *
 * **The window is half-open: on or after `effectiveFrom`, and strictly before
 * `effectiveTo`.** That is what makes "ended today" mean the charge does not
 * apply to a quotation written today, and what makes closing one row and
 * opening another on the same date mean "the new figure from now" rather than
 * "both at once".
 *
 * It exists as a function, rather than only as the `where` clause that fetches
 * these rows, because the rule is the whole reason the works can add an
 * overhead — or take on a lamination crew — without disturbing anything
 * already quoted — and a rule that lives
 * only inside a database query cannot be tested without a database. The service
 * narrows with SQL and then filters with this, so the two cannot drift: if they
 * ever disagreed, this one wins, and it is the one with the tests.
 */
/**
 * The day a figure that has always applied is dated from.
 *
 * Not a real date and not meant to be read as one. When wages gained their
 * history, every row that was live had to be given a start, and there was
 * nothing in the data to say when it truly began — only that every document on
 * file had been priced with it. So they start before the works did, and the
 * screens say "from the start" rather than showing somebody 1900.
 */
export const COSTING_EPOCH = '1900-01-01';

/** Whether this row is one of those. */
export const isFromTheStart = (row: DatedRow): boolean => row.effectiveFrom <= COSTING_EPOCH;

export interface DatedRow {
  /** ISO yyyy-mm-dd. The first day this figure applies. */
  effectiveFrom: string;
  /** ISO yyyy-mm-dd, or null while it is still live. The first day it does NOT. */
  effectiveTo: string | null;
}

/**
 * Compared as strings, which is exact for ISO dates and has no timezone in it.
 *
 * A Date comparison here would be a way to turn "the 20th" into "the 19th at
 * half past six in the evening" on a server an hour or two off UTC, and a
 * quotation that picks up a different overhead depending on where it is costed
 * is not something anybody could explain.
 */
export function isLiveOn(row: DatedRow, onDate: string): boolean {
  if (row.effectiveFrom > onDate) return false;
  if (row.effectiveTo !== null && row.effectiveTo <= onDate) return false;
  return true;
}

/** The same, over a list. */
export function liveOn<T extends DatedRow>(rows: T[], onDate: string): T[] {
  return rows.filter((row) => isLiveOn(row, onDate));
}
