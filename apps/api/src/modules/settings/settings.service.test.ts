import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@yuva/shared';
import { valuesAsAt, type SettingChange } from './setting-history.js';

/**
 * **A quotation written for an older day must be costed on that day's figures.**
 *
 * The client's own sheets carry a bank EMI of Rs 4,166.66 in March and April
 * 2022 and Rs 10,000 in July — one figure, changed in between, not something
 * that varies job to job. Material rates have always answered "what was this
 * worth then"; settings could not, so rebuilding an old quotation repriced it
 * at today's overheads and it could never reproduce itself.
 *
 * The rule the service follows, pinned here because it is easy to get backwards:
 * today reads the CURRENT row, and only a past date consults the history. The
 * current row is not derived from the history, so the two cannot drift.
 */
describe('reading a setting as at a date', () => {
  /** The same resolution the service does, over rows a test can state. */
  const asAt = (
    current: Record<string, string>,
    history: { key: string; value: string; on: string }[],
    onDate: string,
    today: string,
  ): Record<string, string> => {
    const stored = { ...current };
    if (onDate < today) {
      const seen = new Set<string>();
      for (const row of [...history].sort((a, b) => (a.on < b.on ? 1 : -1))) {
        if (row.on > onDate || seen.has(row.key)) continue;
        seen.add(row.key);
        stored[row.key] = row.value;
      }
    }
    return stored;
  };

  const TODAY = '2026-09-13';
  const current = { emiPerMonth: '4166.66' };
  const history = [
    { key: 'emiPerMonth', value: '4166.66', on: '2022-03-23' },
    { key: 'emiPerMonth', value: '10000', on: '2022-07-10' },
    { key: 'emiPerMonth', value: '4166.66', on: '2022-08-01' },
  ];

  it.each([
    ['2022-03-23', '4166.66'],
    ['2022-04-04', '4166.66'],
    ['2022-07-10', '10000'],
    ['2022-07-31', '10000'],
    ['2022-08-01', '4166.66'],
  ])('on %s the EMI was %s', (onDate, expected) => {
    expect(asAt(current, history, onDate, TODAY).emiPerMonth).toBe(expected);
  });

  it('reads the current row for today, not the newest history entry', () => {
    const moved = { emiPerMonth: '5000' };
    expect(asAt(moved, history, TODAY, TODAY).emiPerMonth).toBe('5000');
  });

  it('leaves a key that never changed alone', () => {
    const withOther = { ...current, defaultWastagePercent: '8' };
    expect(asAt(withOther, history, '2022-03-23', TODAY).defaultWastagePercent).toBe('8');
  });

  it('falls back to the documented default when nothing is stored at all', () => {
    expect(asAt({}, [], '2022-03-23', TODAY).emiPerMonth).toBeUndefined();
    /* Which is what makes the service fill it from here. */
    expect(DEFAULT_SETTINGS.emiPerMonth).toBe(4166.66);
  });
});

/**
 * **Adding a setting must not rewrite history.**
 *
 * These call the service's own `valuesAsAt` rather than a copy of it. The tests
 * above resolve the dates themselves, which is how the hole below survived
 * being "covered" — the shadow implementation had the same one.
 */
describe('a setting that did not exist yet', () => {
  const HISTORY: SettingChange[] = [
    { key: 'emiPerMonth', value: '4166.66', effectiveDate: '2022-03-23' },
    { key: 'emiPerMonth', value: '10000', effectiveDate: '2022-07-10' },
    /* Switched on today, long after the 2022 quotations were written. */
    { key: 'rateModel', value: 'PER_DAY', effectiveDate: '2026-09-18' },
  ];
  const CURRENT = { emiPerMonth: '10000', rateModel: 'PER_DAY', gstPercent: '18' };

  /*
   * The bug this exists for. `rateModel` has no row on or before 2022, so the
   * old loop left it at today's value and every 2022 quotation silently read
   * PER_DAY — moving seven quotations that reproduce the works' own sheets.
   */
  it('is dropped for a date before it was ever set, so the default stands', () => {
    const then = valuesAsAt(CURRENT, HISTORY, '2022-03-23');
    expect(then['rateModel']).toBeUndefined();
  });

  it('keeps a key that has never been edited at all', () => {
    // gstPercent has no history: today's value has always been its value.
    const then = valuesAsAt(CURRENT, HISTORY, '2022-03-23');
    expect(then['gstPercent']).toBe('18');
  });

  it('still reads the value in force where one was recorded', () => {
    expect(valuesAsAt(CURRENT, HISTORY, '2022-03-23')['emiPerMonth']).toBe('4166.66');
    expect(valuesAsAt(CURRENT, HISTORY, '2022-07-10')['emiPerMonth']).toBe('10000');
    expect(valuesAsAt(CURRENT, HISTORY, '2022-06-30')['emiPerMonth']).toBe('4166.66');
  });

  it('reads today’s value once the date is past the change', () => {
    expect(valuesAsAt(CURRENT, HISTORY, '2026-09-18')['rateModel']).toBe('PER_DAY');
  });

  /* Order of the rows is the database's business, not a rule to depend on. */
  it('does not depend on the order the changes arrive in', () => {
    const shuffled = [HISTORY[2]!, HISTORY[0]!, HISTORY[1]!];
    expect(valuesAsAt(CURRENT, shuffled, '2022-03-23')).toEqual(
      valuesAsAt(CURRENT, HISTORY, '2022-03-23'),
    );
  });
});
