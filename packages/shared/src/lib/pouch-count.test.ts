import { describe, expect, it } from 'vitest';
import {
  averagePouchGrams,
  boxTareKg,
  countedPouches,
  pouchesInBox,
  standardBoxWeight,
  type PouchWeighing,
} from './pouch-count.js';

/**
 * **The works' own Pouch Count sheet, reproduced to the figure.**
 *
 * Kemchho Sargawa Drumstick: three sets of a hundred at 900, 920 and 910
 * grams, and ten boxes off the scale. Every expectation below is a cell on
 * their sheet.
 */
const WEIGHINGS: PouchWeighing[] = [
  { pouchCount: 100, grams: 900 },
  { pouchCount: 100, grams: 920 },
  { pouchCount: 100, grams: 910 },
];

/** Gross and box weight as the packer wrote them; net is what is left. */
const BOXES: [number, number][] = [
  [22.8, 0.6],
  [30.3, 1.0],
  [30.25, 1.0],
  [31.3, 1.0],
  [31.2, 1.0],
  [30.79, 1.0],
  [32.0, 1.0],
  [29.7, 1.0],
  [27.8, 1.0],
  [30.2, 1.0],
];

const packages = BOXES.map(([gross, box]) => ({ netKg: gross - box, grossKg: gross }));

describe('counting a consignment by weight', () => {
  const grams = averagePouchGrams(WEIGHINGS);

  it('averages the sets to nine point one grams a pouch', () => {
    // D5: the mean of 9, 9.2 and 9.1.
    expect(grams).toBeCloseTo(9.1, 4);
  });

  it('counts each box the way their sheet does', () => {
    // F12..F21, in order.
    const counts = packages.map((pack) => pouchesInBox(pack.netKg, grams));
    expect(counts).toEqual([2440, 3220, 3214, 3330, 3319, 3274, 3407, 3154, 2945, 3209]);
  });

  it('adds the boxes rather than weighing the lorry', () => {
    /*
     * F22 reads 31,512. The whole net weight over the average pouch would say
     * 31,510 — the difference is ten roundings, and the boxes are what the
     * customer can check.
     */
    expect(countedPouches(packages, grams)).toBe(31512);
    expect(Math.round((286.74 * 1000) / grams)).toBe(31510);
  });

  it('reads the box weight back off the gross', () => {
    expect(boxTareKg(packages[0] as { netKg: number; grossKg: number })).toBeCloseTo(0.6, 3);
  });

  it('says what a standard box should weigh on the scale', () => {
    // G2..G5: three thousand pouches, a 0.9 kg carton.
    expect(standardBoxWeight({ pouchesPerBox: 3000, pouchGrams: grams, boxKg: 0.9 })).toEqual({
      pouchesKg: 27.3,
      grossKg: 28.2,
    });
  });
});

describe('a count nobody has weighed for yet', () => {
  it('has no average rather than a division by nothing', () => {
    expect(averagePouchGrams([])).toBe(0);
    expect(averagePouchGrams([{ pouchCount: 0, grams: 900 }])).toBe(0);
    expect(averagePouchGrams([{ pouchCount: 100, grams: 0 }])).toBe(0);
  });

  it('counts nothing, rather than infinitely many', () => {
    expect(pouchesInBox(22.2, 0)).toBe(0);
    expect(countedPouches(packages, 0)).toBe(0);
  });

  it('ignores a set somebody half typed', () => {
    const half = averagePouchGrams([...WEIGHINGS, { pouchCount: 100, grams: 0 }]);
    expect(half).toBeCloseTo(9.1, 4);
  });
});

describe('sets that are not all the same size', () => {
  it('means the average of the sets, not of the whole scale', () => {
    /*
     * 100 at 900 g and 50 at 460 g. Per set that is 9 and 9.2, so 9.1 — the
     * weight over the count would say 9.067, and the sheet means the first.
     */
    const grams = averagePouchGrams([
      { pouchCount: 100, grams: 900 },
      { pouchCount: 50, grams: 460 },
    ]);
    expect(grams).toBeCloseTo(9.1, 4);
  });
});
