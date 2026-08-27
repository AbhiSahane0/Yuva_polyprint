import { describe, expect, it } from 'vitest';
import { computeMargin, computeMaterialCostPerKg } from './material-cost.js';

/** A 3-layer job: PET 12µ + MET PET 12µ + poly 60µ at 0.92, plus ink and adhesive. */
const threeLayer = {
  layer: 3,
  polyMicron: 60,
  polyDensity: 0.92,
  petRate: 210,
  metpetRate: 260,
  polyRate: 185,
  inkRate: 400,
  adhesiveRate: 300,
  inkGsm: 1.8,
  adhesiveGsm: 3,
};

describe('computeMaterialCostPerKg', () => {
  it('costs the metallised ply separately from the plain PET ply', () => {
    const result = computeMaterialCostPerKg(threeLayer);

    const pet = result.breakdown.find((c) => c.component === 'PET');
    const metpet = result.breakdown.find((c) => c.component === 'MET PET');

    // One ply each, not two PET plies — this is the correction.
    expect(pet?.gsm).toBeCloseTo(16.8, 3);
    expect(metpet?.gsm).toBeCloseTo(16.8, 3);
    expect(pet?.rate).toBe(210);
    expect(metpet?.rate).toBe(260);
  });

  it('gives a 2-layer job no metallised ply at all', () => {
    const result = computeMaterialCostPerKg({ ...threeLayer, layer: 2 });

    expect(result.breakdown.map((c) => c.component)).not.toContain('MET PET');
    // PET + poly + ink + adhesive only.
    expect(result.compositeGsm).toBeCloseTo(16.8 + 55.2 + 1.8 + 3, 3);
  });

  it('is the GSM-weighted average of the component rates', () => {
    const result = computeMaterialCostPerKg(threeLayer);

    const expected =
      (16.8 * 210 + 16.8 * 260 + 55.2 * 185 + 1.8 * 400 + 3 * 300) / (16.8 + 16.8 + 55.2 + 1.8 + 3);
    expect(result.costPerKg).toBeCloseTo(expected, 3);
  });

  it('costs a 3-layer job more than the same job priced as two PET plies would', () => {
    // METPET is dearer than PET, so the old behaviour understated the cost.
    const asMetpet = computeMaterialCostPerKg(threeLayer);
    const asPet = computeMaterialCostPerKg({ ...threeLayer, metpetRate: threeLayer.petRate });

    expect(asMetpet.costPerKg!).toBeGreaterThan(asPet.costPerKg!);
  });

  it('reports no cost at all when the metallised rate is missing', () => {
    // Never understate: a quotation must not look more profitable than it is
    // because a rate was not keyed in that morning.
    const result = computeMaterialCostPerKg({ ...threeLayer, metpetRate: null });

    expect(result.costPerKg).toBeNull();
    // The composite is still reported, so the form can show the structure.
    expect(result.compositeGsm).toBeGreaterThan(0);
  });

  it('ignores a missing metallised rate on a 2-layer job, which has no such ply', () => {
    const result = computeMaterialCostPerKg({ ...threeLayer, layer: 2, metpetRate: null });

    expect(result.costPerKg).not.toBeNull();
  });
});

describe('computeMargin', () => {
  it('is the gap between selling and cost, over selling', () => {
    expect(computeMargin(300, 210)).toBe(30);
  });

  it('goes negative when the job is quoted below cost', () => {
    expect(computeMargin(200, 250)).toBe(-25);
  });

  it('is unknown when the cost is unknown', () => {
    expect(computeMargin(300, null)).toBeNull();
  });
});
