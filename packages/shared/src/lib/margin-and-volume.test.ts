import { describe, expect, it } from 'vitest';
import { computeItemGeometry, computeTier } from './quotation-math.js';
import { computeMargin, computeMaterialCostPerKg, totalMicronForLayers } from './material-cost.js';

/**
 * What ordering more does to the margin, and what it does not.
 *
 * The office asked whether the margin was right, because raising the quantity
 * at the same rate leaves it unchanged. It is right, and this pins the reason:
 * the margin is a **ratio of two per-kilogram figures**, so it cannot depend on
 * how many kilograms are bought. Quoting twice the order at the same price
 * earns twice the money at the same margin.
 *
 * What genuinely improves with volume is the all-in cost of a pouch, because
 * the cylinders are charged once whatever the order — that is the last case
 * below, and it is the figure a customer arguing for a bigger discount is
 * really talking about.
 */
const LAYERS = [
  { name: 'PET 12µm', micron: 12, density: 1.4, ratePerKg: 210 },
  { name: 'PE 50µm', micron: 50, density: 0.92, ratePerKg: 185 },
];

const MATERIAL = computeMaterialCostPerKg({
  layers: LAYERS,
  inkGsm: 1.8,
  adhesiveGsm: 2.5,
  inkRate: 610,
  adhesiveRate: 480,
});

const GEOMETRY = computeItemGeometry(
  {
    layerCount: 2,
    micron: totalMicronForLayers(LAYERS),
    widthMm: 350,
    heightMm: 250,
    repeatWidth: 1,
    repeatHeight: 2,
    cylinderCount: 4,
    chargeCylinders: true,
  },
  2.5,
);

const marginAt = (input: Parameters<typeof computeTier>[1]) =>
  computeMargin(computeTier(GEOMETRY.pouchesPerKg, input).ratePerKg, MATERIAL.costPerKg);

describe('margin against volume', () => {
  it('holds the office formula: 350 × 250 at 64µ over two plies is 6.16g a pouch', () => {
    // A = (width × height × micron × 1.10) ÷ 1,000,000 grams, and 1000 ÷ A to
    // the kilogram. 875 × 64 × 1.1 = 61,600, so 6.16g and 162.34 pouches.
    expect(totalMicronForLayers(LAYERS)).toBe(64);
    expect(GEOMETRY.pouchesPerKg).toBe(162.34);
    expect(1000 / GEOMETRY.pouchesPerKg).toBeCloseTo(6.16, 2);
  });

  it('does not move as a per-pouch order grows at the same rate', () => {
    const margins = [1000, 5000, 25000, 100000].map((quantityPouches) =>
      marginAt({
        pricingBasis: 'PER_POUCH',
        quantityPouches,
        ratePerPouch: 10,
        quantityKg: 0,
        ratePerKg: 0,
      }),
    );
    // Rs. 10 a pouch is Rs. 1,623/kg however many are bought, against Rs. 213.65
    // of material — so 86.84% at every volume.
    expect(new Set(margins).size).toBe(1);
    expect(margins[0]).toBe(86.84);
  });

  it('does not move as a per-kilogram order grows at the same rate', () => {
    const margins = [100, 500, 2500, 10000].map((quantityKg) =>
      marginAt({
        pricingBasis: 'PER_KG',
        quantityKg,
        ratePerKg: 400,
        quantityPouches: 0,
        ratePerPouch: 0,
      }),
    );
    expect(new Set(margins).size).toBe(1);
    expect(margins[0]).toBe(46.59);
  });

  it('does move with the rate, which is the thing it is there to answer', () => {
    const at = (ratePerPouch: number) =>
      marginAt({
        pricingBasis: 'PER_POUCH',
        quantityPouches: 25000,
        ratePerPouch,
        quantityKg: 0,
        ratePerKg: 0,
      });
    expect(at(8)).toBeLessThan(at(10));
    expect(at(12)).toBeGreaterThan(at(10));
  });

  it('counts pouches in proportion to the weight ordered', () => {
    const count = (quantityKg: number) =>
      computeTier(GEOMETRY.pouchesPerKg, {
        pricingBasis: 'PER_KG',
        quantityKg,
        ratePerKg: 400,
        quantityPouches: 0,
        ratePerPouch: 0,
      }).totalPouches;
    expect(count(100)).toBe(16234);
    expect(count(500)).toBe(count(100) * 5);
  });

  it('is the all-in cost of a pouch that improves with volume, not the margin', () => {
    /*
     * Cylinders are charged once whatever the order — Rs. 21,500 here — so what
     * a pouch really costs the customer falls sharply as that is spread. This
     * is the figure behind "order more and it gets cheaper", and it is why the
     * document carries two or three quantities side by side.
     */
    const allIn = (quantityPouches: number) => {
      const tier = computeTier(GEOMETRY.pouchesPerKg, {
        pricingBasis: 'PER_POUCH',
        quantityPouches,
        ratePerPouch: 10,
        quantityKg: 0,
        ratePerKg: 0,
      });
      return (tier.totalAmount + GEOMETRY.totalCylinderCost) / tier.totalPouches;
    };
    expect(allIn(1000)).toBeCloseTo(31.5, 1);
    expect(allIn(100000)).toBeCloseTo(10.215, 2);
    expect(allIn(100000)).toBeLessThan(allIn(1000));
  });
});
