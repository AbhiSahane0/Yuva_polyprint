/**
 * Which works-defined overheads applied on a given day.
 *
 * **The window is half-open: on or after `effectiveFrom`, and strictly before
 * `effectiveTo`.** That is what makes "ended today" mean the charge does not
 * apply to a quotation written today, and what makes closing one row and
 * opening another on the same date mean "the new figure from now" rather than
 * "both at once".
 *
 * It exists as a function, rather than only as the `where` clause that fetches
 * these rows, because the rule is the whole reason the works can add an
 * overhead without disturbing anything already quoted — and a rule that lives
 * only inside a database query cannot be tested without a database. The service
 * narrows with SQL and then filters with this, so the two cannot drift: if they
 * ever disagreed, this one wins, and it is the one with the tests.
 */
export interface DatedOverhead {
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
export function isOverheadLiveOn(overhead: DatedOverhead, onDate: string): boolean {
  if (overhead.effectiveFrom > onDate) return false;
  if (overhead.effectiveTo !== null && overhead.effectiveTo <= onDate) return false;
  return true;
}

/** The same, over a list. */
export function overheadsLiveOn<T extends DatedOverhead>(overheads: T[], onDate: string): T[] {
  return overheads.filter((overhead) => isOverheadLiveOn(overhead, onDate));
}
