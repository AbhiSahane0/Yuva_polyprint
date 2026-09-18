/**
 * Reading a setting as at a day, with no database in sight.
 *
 * Its own module because it is pure and it is the piece that was wrong: the
 * logic used to sit inline in the service, and the test reimplemented it
 * alongside rather than calling it. Both copies had the same hole. A pure
 * function the test can import directly is what stops that happening twice.
 */

/** One recorded change: what a key became, and the day it became it. */
export interface SettingChange {
  key: string;
  value: string;
  /** yyyy-mm-dd. */
  effectiveDate: string;
}

/**
 * The stored values as they stood on a given day.
 *
 * Pure, exported and tested directly — the date logic used to be inline here
 * and the test reimplemented it alongside, which is how the bug below survived
 * being "covered": the shadow copy had the same hole.
 *
 * Three cases, and the third is the one that bites:
 *
 * 1. **A change on or before the date** — the newest of them is what was in
 *    force. Straightforward.
 * 2. **No change ever recorded** — the key has never been edited, so today's
 *    value has always been its value. Kept.
 * 3. **Changes recorded, but all of them after the date** — the key
 *    demonstrably became something else later, so today's value is certainly
 *    not what it was. Dropped, and the caller falls back to the documented
 *    default.
 *
 * Case 3 was missing, and adding a setting therefore rewrote history. The
 * `rateModel` switch arrived long after 2022 and defaults to PER_MINUTE;
 * turning it to PER_DAY made every 2022 quotation read PER_DAY too, so the
 * seven that reproduce the works' own sheets would have quietly stopped
 * matching them — on a change meant to leave them entirely alone.
 */
export function valuesAsAt(
  current: Record<string, string>,
  history: SettingChange[],
  onDate: string,
): Record<string, string> {
  const stored = { ...current };

  const newestOnOrBefore = new Map<string, string>();
  const changedLater = new Set<string>();

  for (const row of history) {
    if (row.effectiveDate <= onDate) {
      const seen = newestOnOrBefore.get(row.key);
      if (seen === undefined || row.effectiveDate > seen) {
        newestOnOrBefore.set(row.key, row.effectiveDate);
        stored[row.key] = row.value;
      }
    } else {
      changedLater.add(row.key);
    }
  }

  for (const key of changedLater) {
    if (!newestOnOrBefore.has(key)) delete stored[key];
  }

  return stored;
}
