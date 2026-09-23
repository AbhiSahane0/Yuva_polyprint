import { describe, expect, it } from 'vitest';
import { isLiveOn, liveOn } from './costing-window.js';

/**
 * **The rule that lets the works add an overhead without disturbing anything.**
 *
 * A quotation is costed on the figures in force on ITS date. An overhead added
 * today therefore has to be invisible to a document written in 2022 — otherwise
 * repricing one of the seven quotations this system reproduces to the paisa
 * would quietly add a charge that never priced it.
 *
 * The window is **half-open**: on or after the start, strictly before the end.
 * That is not a detail. It is what makes "ended today" mean the charge does not
 * apply to a quotation written today, and what makes closing one row and
 * opening another on the same date mean "the new figure from now" instead of
 * charging both.
 */
const live = { effectiveFrom: '2026-09-20', effectiveTo: null };
const past = { effectiveFrom: '2022-01-01', effectiveTo: '2022-06-01' };

describe('when a works-defined overhead applies', () => {
  it('does not reach back before it was added', () => {
    // The whole guard. Nothing quoted before today may move.
    expect(isLiveOn(live, '2022-03-23')).toBe(false);
    expect(isLiveOn(live, '2026-09-19')).toBe(false);
  });

  it('applies from its first day', () => {
    expect(isLiveOn(live, '2026-09-20')).toBe(true);
    expect(isLiveOn(live, '2027-01-01')).toBe(true);
  });

  it('applies inside a closed window', () => {
    expect(isLiveOn(past, '2022-01-01')).toBe(true);
    expect(isLiveOn(past, '2022-03-23')).toBe(true);
  });

  it('stops ON the day it ends, not after it', () => {
    /*
     * Half-open, and this is the case that says so. "Ended today" has to mean
     * a quotation written today does not carry the charge — the office ended
     * it because they stopped paying it, and a document raised that afternoon
     * should not still include it.
     */
    expect(isLiveOn(past, '2022-06-01')).toBe(false);
    expect(isLiveOn(past, '2022-06-02')).toBe(false);
  });

  it('never charges both halves of an amount that changed', () => {
    /*
     * Changing an amount closes one row and opens another on the same day.
     * With a closed window both would apply on that day and the job would be
     * charged twice — which is precisely the sort of thing that would go
     * unnoticed, being a single day in a year.
     */
    const was = { effectiveFrom: '2026-01-01', effectiveTo: '2026-09-20' };
    const now = { effectiveFrom: '2026-09-20', effectiveTo: null };
    expect(liveOn([was, now], '2026-09-20')).toEqual([now]);
    expect(liveOn([was, now], '2026-09-19')).toEqual([was]);
  });

  it('compares as text, so no timezone can move a day', () => {
    /*
     * ISO dates sort correctly as strings. Parsing them into Dates is how "the
     * 20th" becomes "the 19th at half past six" on a server a few hours off
     * UTC — and a quotation that picks up a different overhead depending on
     * where it was costed is not something anybody could explain.
     */
    expect(isLiveOn({ effectiveFrom: '2026-09-09', effectiveTo: null }, '2026-09-10')).toBe(true);
    expect(isLiveOn({ effectiveFrom: '2026-09-10', effectiveTo: null }, '2026-09-09')).toBe(false);
  });
});

/**
 * **The bug this window was added to fix**, kept as a test.
 *
 * The works' lamination crew was switched off in the wage master. Switching it
 * back on in 2026 re-priced seven quotations written in 2022 — each by about a
 * rupee a kilogram — because a wage was one live row with a boolean, and a
 * quotation is costed against whatever the master says now.
 *
 * A window cannot do that. The crew applies from the day it is taken on, and
 * every earlier document goes on being costed without it.
 */
describe('taking a crew back on', () => {
  const laminationCrew = { effectiveFrom: '2026-09-23', effectiveTo: null };

  it('does not reach back to a quotation written before it', () => {
    for (const quotationDate of ['2022-03-23', '2022-04-04', '2022-07-10', '2026-09-22']) {
      expect(isLiveOn(laminationCrew, quotationDate)).toBe(false);
    }
  });

  it('applies from the day it is taken on, and after', () => {
    expect(isLiveOn(laminationCrew, '2026-09-23')).toBe(true);
    expect(isLiveOn(laminationCrew, '2027-01-01')).toBe(true);
  });

  it('treats a window that was never opened as never applying', () => {
    /*
     * What the migration wrote for a role that was switched OFF when wages
     * gained their history. A boolean cannot say when it was last true, and the
     * documents on file were priced without it — so an empty window is the only
     * backfill that keeps every one of them reproducing.
     */
    const neverLive = { effectiveFrom: '1900-01-01', effectiveTo: '1900-01-01' };
    for (const date of ['1899-12-31', '1900-01-01', '2022-03-23', '2026-09-23']) {
      expect(isLiveOn(neverLive, date)).toBe(false);
    }
  });
});
