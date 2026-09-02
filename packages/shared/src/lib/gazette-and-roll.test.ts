import { describe, expect, it } from 'vitest';
import { computeItemGeometry } from './quotation-math.js';

/**
 * The pouches-per-kilogram formula, and what a gusset does to it.
 *
 * The client states it as:
 *
 *     3 layer:  A = width × height × micron × 1.20 ÷ 1,000,000
 *     2 layer:  A = width × height × micron × 1.10 ÷ 1,000,000
 *     pouches per kg = 1000 ÷ A
 *
 * `A` is the grams of film one pouch is cut from. These pin that reading
 * against figures from the client's own sheet, because the divisor is easy to
 * misremember — a thousand rather than a million puts every answer out by
 * three orders of magnitude while still looking plausible in isolation.
 */
const RATE = 2.5;

/** The formula, written out longhand exactly as stated. */
function statedFormula(w: number, h: number, micron: number, factor: number) {
  const gramsPerPouch = (w * h * micron * factor) / 1_000_000;
  return 1000 / gramsPerPouch;
}

describe('pouches per kilogram', () => {
  it('matches the client’s sheet on known jobs', () => {
    // 1 Kg Paneer Bag — 560 × 220, two ply, 74µ. The sheet says 99.72.
    const paneer = computeItemGeometry(
      {
        layerCount: 2,
        micron: 74,
        widthMm: 560,
        heightMm: 220,
        repeatWidth: 1,
        repeatHeight: 1,
        cylinderCount: 4,
      },
      RATE,
    );
    expect(paneer.pouchesPerKg).toBe(99.72);

    // 5 Kg Paneer Bag — 670 × 460. The sheet says 39.86.
    const large = computeItemGeometry(
      {
        layerCount: 2,
        micron: 74,
        widthMm: 670,
        heightMm: 460,
        repeatWidth: 1,
        repeatHeight: 1,
        cylinderCount: 4,
      },
      RATE,
    );
    expect(large.pouchesPerKg).toBe(39.86);
  });

  it('is the stated formula, at both ply counts', () => {
    for (const [layerCount, factor] of [
      [2, 1.1],
      [3, 1.2],
    ] as const) {
      const geometry = computeItemGeometry(
        {
          layerCount,
          micron: 86,
          widthMm: 420,
          heightMm: 260,
          repeatWidth: 1,
          repeatHeight: 1,
          cylinderCount: 4,
        },
        RATE,
      );
      expect(geometry.pouchesPerKg).toBeCloseTo(statedFormula(420, 260, 86, factor), 1);
    }
  });
});

describe('a gazette pouch', () => {
  const plain = {
    layerCount: 2 as const,
    micron: 74,
    widthMm: 250,
    heightMm: 205,
    repeatWidth: 1,
    repeatHeight: 1,
    cylinderCount: 4,
  };

  it('is cut from film wider and taller than the pouch', () => {
    const gusseted = computeItemGeometry(
      { ...plain, gazette: { bottom: 40, left: 30, right: 30 } },
      RATE,
    );

    // width + left + right, height + bottom — exactly as the office states it.
    expect(gusseted.filmWidthMm).toBe(310);
    expect(gusseted.filmHeightMm).toBe(245);
  });

  it('yields fewer pouches per kilogram, because the film is bigger', () => {
    const flat = computeItemGeometry(plain, RATE);
    const gusseted = computeItemGeometry(
      { ...plain, gazette: { bottom: 40, left: 30, right: 30 } },
      RATE,
    );

    expect(gusseted.pouchesPerKg).toBeLessThan(flat.pouchesPerKg);
    // And it is the stated formula on the film size, not the pouch size.
    expect(gusseted.pouchesPerKg).toBeCloseTo(statedFormula(310, 245, 74, 1.1), 1);
  });

  it('needs a bigger cylinder, because that film is what is printed', () => {
    const flat = computeItemGeometry(plain, RATE);
    const gusseted = computeItemGeometry(
      { ...plain, gazette: { bottom: 40, left: 30, right: 30 } },
      RATE,
    );

    expect(flat.cylinderWidth).toBe(250 + 80);
    expect(gusseted.cylinderWidth).toBe(310 + 80);
    expect(gusseted.cylinderCircumference).toBe(245);
    expect(gusseted.costPerCylinder).toBeGreaterThan(flat.costPerCylinder);
  });

  it('changes nothing when it is not one', () => {
    const flat = computeItemGeometry(plain, RATE);
    const zeroed = computeItemGeometry(
      { ...plain, gazette: { bottom: 0, left: 0, right: 0 } },
      RATE,
    );

    expect(zeroed).toEqual(flat);
    expect(flat.filmWidthMm).toBe(250);
    expect(flat.filmHeightMm).toBe(205);
  });
});

describe('a roll', () => {
  it('reports no pouches at all, rather than a count of zero-sized ones', () => {
    const roll = computeItemGeometry(
      {
        layerCount: 2,
        micron: 74,
        widthMm: 560,
        heightMm: 220,
        makesPouches: false,
        repeatWidth: 1,
        repeatHeight: 1,
        cylinderCount: 4,
      },
      RATE,
    );

    // Film on a reel has not been converted into anything.
    expect(roll.pouchesPerKg).toBe(0);
  });

  it('still needs its cylinders costed — it is printed film', () => {
    const roll = computeItemGeometry(
      {
        layerCount: 2,
        micron: 74,
        widthMm: 560,
        heightMm: 220,
        makesPouches: false,
        repeatWidth: 1,
        repeatHeight: 1,
        cylinderCount: 4,
        transportCost: 500,
      },
      RATE,
    );

    expect(roll.cylinderWidth).toBe(640);
    expect(roll.totalCylinderCost).toBe(roll.costPerCylinder * 4 + 500);
  });
});
