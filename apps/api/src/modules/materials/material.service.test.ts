import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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

/**
 * **Twelve LDPE grades priced off one number.**
 *
 * The works sells General Poly and eleven grades of it, each the base rate
 * plus a fixed amount from the client's own rate master — Rs 6 for a 1 kg
 * packaging film, Rs 55 for a frosty one. Keying all twelve every time the
 * resin moves is eleven chances to key one wrong, and the table says they
 * never move apart.
 *
 * These pin the two properties that make deriving them safe. Source
 * inspection, like the cylinder register's, because what matters is where the
 * writes happen rather than what one call returns.
 */
const MATERIAL_SOURCE = readFileSync(
  fileURLToPath(new URL('./material.service.ts', import.meta.url)),
  'utf8',
);
const MATERIAL_CODE = MATERIAL_SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('a film whose rate follows another', () => {
  it('writes the grades inside the transaction that writes the base', () => {
    /*
     * Not afterwards. A quotation costed between the two writes would read a
     * General Poly that had moved and a frosty film that had not — and the
     * costing screen reads every film at once, so the window is real.
     */
    const save = MATERIAL_CODE.slice(
      MATERIAL_CODE.indexOf('export async function saveRates'),
      MATERIAL_CODE.indexOf('async function writeDerivedRates'),
    );
    const transaction = save.slice(save.indexOf('prisma.$transaction'));
    expect(transaction).toContain('writeDerivedRates(');
    /* And through the transaction client, or it would not be in it. */
    expect(MATERIAL_CODE).toContain('tx.materialRate.upsert');
  });

  it('refuses a rate typed against a grade rather than quietly losing it', () => {
    /*
     * There is one number to key. Accepting a second would leave the two
     * disagreeing until the next time the base moved and replaced it, which
     * is the worst of both: a figure somebody chose, overwritten later
     * without a word.
     */
    expect(MATERIAL_CODE).toContain('baseMaterialId !== null');
    expect(MATERIAL_CODE).toContain('set that rate instead');
  });

  it('only ever writes the day it was given', () => {
    /*
     * The premium is held on the material and is not dated, which is safe only
     * because a derived rate becomes an ordinary dated row the moment the base
     * is keyed. Raise a premium tomorrow and every quotation already written
     * goes on reading the row that existed on its own date.
     *
     * So the deriving code must touch exactly one date — the one passed in. A
     * write that recomputed history would turn a premium change into a silent
     * repricing of every document on file.
     */
    const from = MATERIAL_CODE.indexOf('async function writeDerivedRates');
    const writer = MATERIAL_CODE.slice(from, MATERIAL_CODE.indexOf('\nexport ', from));
    expect(writer).toContain('effectiveDate');
    /* No ranges, and no updateMany sweeping across days. */
    expect(writer).not.toContain('effectiveDate: { lt');
    expect(writer).not.toContain('effectiveDate: { gt');
    expect(writer).not.toContain('updateMany');
    expect(writer).not.toContain('deleteMany');
  });
});
