import { describe, expect, it } from 'vitest';
import { computeItem } from './quotation-math.js';
import { pricingBasisFor } from '../constants/job.js';

/** A standup pouch: 420 × 260, 3-layer, 45µ poly. */
const line = {
  layer: 3,
  widthMm: 420,
  heightMm: 260,
  polyMicron: 45,
  repeatWidth: 1,
  repeatHeight: 1,
  cylinderCount: 4,
};

describe('pricingBasisFor', () => {
  it('prices standup and standup zipper by the piece', () => {
    expect(pricingBasisFor('POUCH', 'STANDUP')).toBe('PER_POUCH');
    expect(pricingBasisFor('POUCH', 'STANDUP_ZIPPER')).toBe('PER_POUCH');
  });

  it('prices every other pouch style by weight', () => {
    for (const style of ['ZIPPER', 'SPOUT', 'CENTRE_SEAL', 'THREE_SIDE_SEAL', 'OTHER'] as const) {
      expect(pricingBasisFor('POUCH', style)).toBe('PER_KG');
    }
  });

  it('prices a roll by weight, whatever style is left on it', () => {
    expect(pricingBasisFor('ROLL', null)).toBe('PER_KG');
    expect(pricingBasisFor('ROLL', 'STANDUP')).toBe('PER_KG');
  });
});

describe('computeItem, priced per pouch', () => {
  const perPouch = computeItem(
    {
      ...line,
      pricingBasis: 'PER_POUCH',
      quantityPouches: 50_000,
      ratePerPouch: 4.2,
      quantityKg: 0,
      ratePerKg: 0,
    },
    2.5,
  );

  it('totals the pouch count against the per-pouch rate', () => {
    expect(perPouch.totalPouches).toBe(50_000);
    expect(perPouch.totalAmount).toBe(50_000 * 4.2);
  });

  it('works the weight back from pouches per kg, because the film is ordered by it', () => {
    expect(perPouch.quantityKg).toBeCloseTo(50_000 / perPouch.pouchesPerKg, 3);
    expect(perPouch.quantityKg).toBeGreaterThan(0);
  });

  it('reports the equivalent rate per kg, so a mixed quotation can be compared', () => {
    expect(perPouch.ratePerKg).toBeCloseTo(perPouch.totalAmount / perPouch.quantityKg, 1);
  });

  it('rounds a fractional pouch count — half a pouch cannot be sold', () => {
    const odd = computeItem(
      {
        ...line,
        pricingBasis: 'PER_POUCH',
        quantityPouches: 999.6,
        ratePerPouch: 4,
        quantityKg: 0,
        ratePerKg: 0,
      },
      2.5,
    );

    expect(odd.totalPouches).toBe(1000);
    expect(odd.totalAmount).toBe(4000);
  });

  it('does not divide by zero when the size makes no pouches', () => {
    const broken = computeItem(
      {
        ...line,
        widthMm: 0,
        heightMm: 0,
        pricingBasis: 'PER_POUCH',
        quantityPouches: 100,
        ratePerPouch: 5,
        quantityKg: 0,
        ratePerKg: 0,
      },
      2.5,
    );

    expect(broken.quantityKg).toBe(0);
    expect(broken.ratePerKg).toBe(0);
    // The money is still right — it never depended on the weight.
    expect(broken.totalAmount).toBe(500);
  });
});

describe('computeItem, priced per kg', () => {
  const perKg = computeItem(
    { ...line, pricingBasis: 'PER_KG', quantityKg: 250, ratePerKg: 300 },
    2.5,
  );

  it('is unchanged by the new basis', () => {
    expect(perKg.totalAmount).toBe(75_000);
    expect(perKg.quantityKg).toBe(250);
    expect(perKg.ratePerKg).toBe(300);
    expect(perKg.totalPouches).toBe(Math.round(perKg.pouchesPerKg * 250));
  });

  it('defaults to per-kg when no basis is given, so old callers are safe', () => {
    const legacy = computeItem({ ...line, quantityKg: 250, ratePerKg: 300 }, 2.5);

    expect(legacy.totalAmount).toBe(perKg.totalAmount);
    expect(legacy.totalPouches).toBe(perKg.totalPouches);
  });
});
