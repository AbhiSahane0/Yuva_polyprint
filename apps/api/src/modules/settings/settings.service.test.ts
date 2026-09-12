import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@yuva/shared';

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
