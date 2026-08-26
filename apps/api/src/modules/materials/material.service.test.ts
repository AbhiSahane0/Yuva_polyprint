import { describe, expect, it } from 'vitest';
import { carryForwardDates, toISODate } from './material.service.js';

/** DATE columns are UTC midnight; build them the same way the service does. */
const d = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);
const iso = (dates: Date[]): string[] => dates.map(toISODate);

describe('carryForwardDates', () => {
  it('fills the single day after yesterday', () => {
    expect(iso(carryForwardDates(d('2026-08-25'), d('2026-08-26')))).toEqual(['2026-08-26']);
  });

  it('creates nothing when the material is already priced for today', () => {
    expect(carryForwardDates(d('2026-08-26'), d('2026-08-26'))).toEqual([]);
  });

  it('creates nothing when the last rate is in the future', () => {
    expect(carryForwardDates(d('2026-08-27'), d('2026-08-26'))).toEqual([]);
  });

  it('fills every missed day, so a week away leaves no gap', () => {
    expect(iso(carryForwardDates(d('2026-08-19'), d('2026-08-26')))).toEqual([
      '2026-08-20',
      '2026-08-21',
      '2026-08-22',
      '2026-08-23',
      '2026-08-24',
      '2026-08-25',
      '2026-08-26',
    ]);
  });

  it('crosses a month end', () => {
    expect(iso(carryForwardDates(d('2026-07-30'), d('2026-08-02')))).toEqual([
      '2026-07-31',
      '2026-08-01',
      '2026-08-02',
    ]);
  });

  it('crosses a leap day', () => {
    expect(iso(carryForwardDates(d('2028-02-27'), d('2028-03-01')))).toEqual([
      '2028-02-28',
      '2028-02-29',
      '2028-03-01',
    ]);
  });

  it('caps a long gap at the most recent maxDays, still reaching today', () => {
    const dates = carryForwardDates(d('2020-01-01'), d('2026-08-26'), 3);

    expect(iso(dates)).toEqual(['2026-08-24', '2026-08-25', '2026-08-26']);
  });

  it('never emits a date past today', () => {
    const through = d('2026-08-26');
    const dates = carryForwardDates(d('2026-06-01'), through);

    expect(dates.at(-1)?.getTime()).toBe(through.getTime());
    expect(dates.every((date) => date.getTime() <= through.getTime())).toBe(true);
  });

  it('emits consecutive days with no repeats', () => {
    const dates = carryForwardDates(d('2026-08-01'), d('2026-08-26'));

    expect(new Set(iso(dates)).size).toBe(dates.length);
    for (let i = 1; i < dates.length; i += 1) {
      expect(dates[i]!.getTime() - dates[i - 1]!.getTime()).toBe(24 * 60 * 60 * 1000);
    }
  });
});
