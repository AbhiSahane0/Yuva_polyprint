import { describe, expect, it } from 'vitest';
import {
  computeMargin,
  computeMaterialCostPerKg,
  totalMicronForLayers,
  type LayerInput,
} from './material-cost.js';

/** The structure the works produces by default, stated ply by ply. */
const PET: LayerInput = { name: 'PET', micron: 12, density: 1.4, ratePerKg: 210 };
const METPET: LayerInput = { name: 'MET PET', micron: 12, density: 1.4, ratePerKg: 258 };
const POLY: LayerInput = { name: 'PE 60µm', micron: 60, density: 0.92, ratePerKg: 190 };

const consumables = {
  inkGsm: 1.8,
  adhesiveGsm: 2.5,
  inkRate: 610,
  adhesiveRate: 480,
};

const threeLayer = { layers: [PET, METPET, POLY], ...consumables };
const twoLayer = { layers: [PET, POLY], ...consumables };

describe('computeMaterialCostPerKg', () => {
  it('turns each ply into a weight through its own density', () => {
    const { breakdown } = computeMaterialCostPerKg(threeLayer);
    const gsm = Object.fromEntries(breakdown.map((c) => [c.component, c.gsm]));

    expect(gsm.PET).toBe(16.8); // 12 × 1.4
    expect(gsm['MET PET']).toBe(16.8);
    expect(gsm['PE 60µm']).toBe(55.2); // 60 × 0.92
  });

  it('adds the plies and the consumables into the composite', () => {
    // 16.8 + 16.8 + 55.2 + 1.8 + 2.5
    expect(computeMaterialCostPerKg(threeLayer).compositeGsm).toBe(93.1);
    expect(computeMaterialCostPerKg(twoLayer).compositeGsm).toBe(76.3);
  });

  it('costs a kilogram as the weighted average of the plies', () => {
    const { costPerKg } = computeMaterialCostPerKg(threeLayer);
    const expected = (16.8 * 210 + 16.8 * 258 + 55.2 * 190 + 1.8 * 610 + 2.5 * 480) / 93.1;

    expect(costPerKg).toBeCloseTo(expected, 4);
  });

  it('prices metallised PET on its own rate, not as plain PET', () => {
    const real = computeMaterialCostPerKg(threeLayer);
    const asPet = computeMaterialCostPerKg({
      ...threeLayer,
      layers: [PET, { ...METPET, ratePerKg: 210 }, POLY],
    });

    // Costing both plies as PET understated the cost of every 3-layer job.
    expect(real.costPerKg!).toBeGreaterThan(asPet.costPerKg!);
  });

  it('reports each ply share, which is also its share of a kilogram', () => {
    const { breakdown } = computeMaterialCostPerKg(threeLayer);
    const total = breakdown.reduce((sum, c) => sum + c.share, 0);

    expect(total).toBeCloseTo(100, 1);
    // 55.2 of 93.1 GSM — the sealant ply dominates because it is the thickest.
    expect(breakdown.find((c) => c.component === 'PE 60µm')!.share).toBeCloseTo(59.29, 2);
  });

  it('refuses to cost anything when a rate is missing that morning', () => {
    const result = computeMaterialCostPerKg({
      ...threeLayer,
      layers: [PET, { ...METPET, ratePerKg: null }, POLY],
    });

    // Better no figure than one that flatters the margin.
    expect(result.costPerKg).toBeNull();
    expect(result.compositeGsm).toBe(93.1);
  });

  /*
   * The defect this replaces: a ply with no density silently dropped out of the
   * composite, and the remaining plies were averaged into a confident — and
   * much higher — cost per kilogram. On a 2-layer line that quietly discarded
   * three quarters of the pouch's weight.
   */
  it('refuses to cost a ply whose material has no density recorded', () => {
    const result = computeMaterialCostPerKg({
      ...twoLayer,
      layers: [PET, { ...POLY, density: null }],
    });

    expect(result.costPerKg).toBeNull();
  });

  it('costs a four-ply structure without needing a code change', () => {
    const foil: LayerInput = { name: 'Foil 7µm', micron: 7, density: 2.7, ratePerKg: 410 };
    const result = computeMaterialCostPerKg({ ...threeLayer, layers: [PET, foil, METPET, POLY] });

    // 93.1 + (7 × 2.7)
    expect(result.compositeGsm).toBe(112);
    expect(result.costPerKg).not.toBeNull();
  });

  it('has nothing to cost when no ply has been chosen', () => {
    const result = computeMaterialCostPerKg({ ...threeLayer, layers: [] });

    expect(result.costPerKg).not.toBeNull();
    expect(result.compositeGsm).toBe(4.3); // ink + adhesive only
  });
});

describe('totalMicronForLayers', () => {
  it('adds the plies and one adhesive layer', () => {
    expect(totalMicronForLayers([{ micron: 12 }, { micron: 45 }])).toBe(59);
  });

  it('adds the same single adhesive on a three-ply structure', () => {
    // Flat, not per bond — the client's sheet does it this way and every
    // imported job matches. Changing it moves pouches-per-kg on every 3-layer.
    expect(totalMicronForLayers([{ micron: 12 }, { micron: 12 }, { micron: 60 }])).toBe(86);
  });
});

describe('computeMargin', () => {
  it('is taken on the selling price, not on cost', () => {
    expect(computeMargin(500, 226.59)).toBeCloseTo(54.68, 2);
  });

  it('says nothing when there is no cost to compare against', () => {
    expect(computeMargin(500, null)).toBeNull();
  });
});
