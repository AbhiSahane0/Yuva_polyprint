import { describe, expect, it } from 'vitest';
import { pouchExpense, type PouchMakingRates } from './pouch-making.js';

/**
 * **Checked against the works' own pouch workbook** — `costing_for_Standup.xlsx`,
 * four sheets, one per style, nine costed jobs. Every figure below is read off
 * it rather than chosen.
 *
 * The workbook charges per pouch and the app used to charge Rs 15 a kilogram.
 * Those are not two ways of saying the same thing: across these nine jobs the
 * per-pouch charge works out at anywhere from Rs 11 to Rs 64 a kilogram, purely
 * because a small pouch packs 130 to a kilo and a big one 14.
 *
 *   Shamali Tea      0.494/pouch × 130/kg  =  Rs 64.22 a kg
 *   Agasti Ghee      0.250/pouch × 203/kg  =  Rs 50.75 a kg
 *   Humza Samosa     0.800/pouch ×  14/kg  =  Rs 11.20 a kg
 *
 * **Where this deliberately differs from the workbook:** its standup-zipper
 * sheet charges the zipper alone — 0.494 and nothing for making — so a zipper
 * pouch is formed, sealed and cut for free. Confirmed with the works that it
 * should pay making as well, so 13 cm of zipper at Rs 3.80 is 0.25 + 0.494 =
 * 0.744 here where the sheet says 0.494.
 */
describe('what making one pouch costs', () => {
  /* The workbook's own figures: standup 0.25, D punch 0.60 = 0.25 + 0.35. */
  const RATES: PouchMakingRates = {
    makingPerPouch: 0.25,
    zipperRatePerMetre: 3.6,
    dPunchPerPouch: 0.35,
  };

  it('reproduces the workbook on a plain standup', () => {
    // Only Standup, all three jobs: "Per Pouch expe" is 0.25.
    expect(pouchExpense('STANDUP', 120, RATES).perPouch).toBe(0.25);
    expect(pouchExpense('STANDUP', 710, RATES).perPouch).toBe(0.25);
  });

  it('reproduces the workbook on a D punch', () => {
    // D Punch Pouch, Humza Veg Samosa: 0.60.
    expect(pouchExpense('D_PUNCH', 190, RATES).perPouch).toBe(0.6);
  });

  /*
   * `(width in cm × rate) ÷ 100` on the sheet is width in METRES times the rate
   * — 13 cm of zipper at Rs 3.80 is Rs 0.494. Written in millimetres here
   * because that is what the rest of the app measures a pouch in.
   */
  it.each([
    ['Shamali Tea', 130, 3.8, 0.494],
    ['Balaji Super Bazar', 130, 3.6, 0.468],
    ['Royal Khajur', 170, 3.6, 0.612],
    ['Baramati Coconut', 200, 3.6, 0.72],
  ])('charges %s %d mm of zipper at Rs %d a metre', (_job, widthMm, rate, zipper) => {
    const rates = { ...RATES, zipperRatePerMetre: rate };
    expect(pouchExpense('ZIPPER', widthMm, rates).zipper).toBeCloseTo(zipper, 4);
    expect(pouchExpense('STANDUP_ZIPPER', widthMm, rates).zipper).toBeCloseTo(zipper, 4);
  });

  it('charges making as well as the zipper, where the sheet charges only the zipper', () => {
    const zipped = pouchExpense('STANDUP_ZIPPER', 130, { ...RATES, zipperRatePerMetre: 3.8 });
    expect(zipped.making).toBe(0.25);
    expect(zipped.zipper).toBeCloseTo(0.494, 4);
    expect(zipped.perPouch).toBeCloseTo(0.744, 4);
  });

  it('leaves the zipper and the punch off the styles that have neither', () => {
    for (const style of ['STANDUP', 'CENTRE_SEAL', 'THREE_SIDE_SEAL', 'SPOUT', 'OTHER'] as const) {
      const expense = pouchExpense(style, 200, RATES);
      expect(expense.zipper).toBe(0);
      expect(expense.punch).toBe(0);
      expect(expense.perPouch).toBe(0.25);
    }
  });

  /*
   * A line whose style has not been chosen yet. Charging making on it would put
   * a figure on the quotation that nobody entered, and the style is two boxes
   * up — it is about to arrive.
   */
  it('charges nothing until the style is known', () => {
    expect(pouchExpense(null, 200, RATES).perPouch).toBe(0);
    expect(pouchExpense(undefined, 200, RATES).perPouch).toBe(0);
  });

  /**
   * **Reached from a request body as well as from the form**, so every figure is
   * floored and defaulted. A negative rate would pay the customer to have
   * pouches made; a missing one would turn the whole rate into NaN, which is
   * worse than charging nothing — a quotation shows a price either way and only
   * one of them is obviously wrong.
   */
  it('survives rates that are missing, negative or nonsense', () => {
    expect(pouchExpense('STANDUP', 200, null).perPouch).toBe(0);
    expect(pouchExpense('STANDUP', 200, undefined).perPouch).toBe(0);

    const broken = {
      makingPerPouch: -5,
      zipperRatePerMetre: Number.NaN,
      dPunchPerPouch: undefined as unknown as number,
    };
    for (const style of ['STANDUP', 'ZIPPER', 'D_PUNCH'] as const) {
      expect(pouchExpense(style, 200, broken).perPouch).toBe(0);
    }
    expect(pouchExpense('ZIPPER', -200, RATES).zipper).toBe(0);
  });

  it('adds its own parts up', () => {
    const expense = pouchExpense('D_PUNCH', 250, RATES);
    expect(expense.perPouch).toBeCloseTo(expense.making + expense.zipper + expense.punch, 6);
  });
});
