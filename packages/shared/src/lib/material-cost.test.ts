import { describe, expect, it } from 'vitest';
import {
  computeMargin,
  computeMaterialCostPerKg,
  filmFamily,
  overriddenRate,
  plyRatePerKg,
  resolveFilm,
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

/**
 * Whether a stored ply was priced by its film or by hand.
 *
 * There is no column recording it, so this is inferred — which makes it worth
 * pinning. The server carries the rate through when repricing from storage and
 * the form puts it back in the box on reopening; both read it from here, and if
 * they ever disagreed a quotation would display one rate and be repriced at
 * another.
 */
describe('overriddenRate', () => {
  it('is null when the gauge quoted is the gauge the film is stocked at', () => {
    expect(overriddenRate({ materialName: 'PET 12µm', micron: 12, ratePerKg: 210 })).toBeNull();
  });

  it('returns the rate when a gauge off the price list was quoted', () => {
    // The case it exists for: 12 and 19 are stocked, 20 was quoted, so neither
    // rate on file applies and the office typed one.
    expect(overriddenRate({ materialName: 'PET 12µm', micron: 20, ratePerKg: 245 })).toBe(245);
  });

  it('is null for a film whose name states no gauge', () => {
    // PP Woven is specified by GSM, so its rate applies at any thickness and a
    // typed micron is not an override.
    expect(overriddenRate({ materialName: 'PP Woven', micron: 90, ratePerKg: 150 })).toBeNull();
  });

  it('is null when nothing was ever priced', () => {
    expect(overriddenRate({ materialName: 'PET 12µm', micron: 20, ratePerKg: null })).toBeNull();
  });

  it('reads Decimal columns handed over as strings', () => {
    // Prisma Decimals JSON-serialise as strings, so a ply read back over the
    // wire carries "20" where the form carries 20. Comparing those as they
    // arrive would make every reloaded ply look overridden.
    expect(overriddenRate({ materialName: 'PET 12µm', micron: '12', ratePerKg: '210' })).toBeNull();
    expect(overriddenRate({ materialName: 'PET 12µm', micron: '20', ratePerKg: '245' })).toBe(245);
  });
});

/**
 * What a ply costs, and when it refuses to cost at all.
 *
 * The third case is the point. Asking for a rate when a gauge off the price
 * list is quoted does nothing if the line goes on costing itself from the
 * stocked gauge's price meanwhile — it reported an 87.7% margin on a 20µ PET
 * priced as a 12µ one, with an empty rate box beside it and nothing to say the
 * figure was invented.
 */
describe('plyRatePerKg', () => {
  it('uses the film’s rate at the gauge it is stocked at', () => {
    expect(
      plyRatePerKg({ materialName: 'PET 12µm', micron: 12, stockRate: 210, override: null }),
    ).toBe(210);
  });

  it('refuses to cost a gauge off the price list until a rate is given', () => {
    expect(
      plyRatePerKg({ materialName: 'PET 12µm', micron: 20, stockRate: 210, override: null }),
    ).toBeNull();
  });

  it('uses the typed rate once it arrives', () => {
    expect(
      plyRatePerKg({ materialName: 'PET 12µm', micron: 20, stockRate: 210, override: 245 }),
    ).toBe(245);
  });

  it('prices a film named without a gauge at whatever thickness is typed', () => {
    // PP Woven is specified by GSM, so there is no stocked gauge to disagree with.
    expect(
      plyRatePerKg({ materialName: 'PP Woven', micron: 90, stockRate: 150, override: null }),
    ).toBe(150);
  });

  it('is null when no film has been chosen', () => {
    expect(
      plyRatePerKg({ materialName: null, micron: 12, stockRate: null, override: null }),
    ).toBeNull();
  });

  it('is null when the film itself has no rate on record', () => {
    expect(
      plyRatePerKg({ materialName: 'PET 12µm', micron: 12, stockRate: null, override: null }),
    ).toBeNull();
  });

  it('does not refuse while the micron box is empty mid-edit', () => {
    // Zero is "not typed yet", not "a gauge off the list". Treating it as the
    // latter would blank the margin on every keystroke that clears the box.
    expect(
      plyRatePerKg({ materialName: 'PET 12µm', micron: 0, stockRate: 210, override: null }),
    ).toBe(210);
  });

  it('leaves the whole line uncostable, which is how the margin reads as a dash', () => {
    const cost = computeMaterialCostPerKg({
      layers: [
        { name: 'PET 12µm', micron: 20, density: 1.4, ratePerKg: null },
        { name: 'PE 50µm', micron: 50, density: 0.92, ratePerKg: 185 },
      ],
      inkGsm: 1.8,
      adhesiveGsm: 2.5,
      inkRate: 610,
      adhesiveRate: 480,
    });
    expect(cost.costPerKg).toBeNull();
    expect(computeMargin(1623, cost.costPerKg)).toBeNull();
  });
});

/**
 * Families, and the film a family plus a gauge names between them.
 *
 * The rates master holds `PET 12µm` and `PET 19µm` as separate rows because
 * they are bought at separate prices, but they are one film to anybody at the
 * machine. The gauge is typed on the line, so listing both asked the same
 * question twice and let the two answers disagree.
 */
describe('filmFamily', () => {
  it.each([
    ['PET 12µm', 'PET'],
    ['PET 19µm', 'PET'],
    ['MET PET 12µm', 'MET PET'],
    ['PE 60µm', 'PE'],
    ['PVC / PETG 45µm', 'PVC / PETG'],
    ['Foil 7µm', 'Foil'],
  ])('%s belongs to %s', (name, family) => {
    expect(filmFamily(name)).toBe(family);
  });

  it('leaves a name that states no gauge alone', () => {
    // PP Woven is specified by GSM, and is its own family of one.
    expect(filmFamily('PP Woven')).toBe('PP Woven');
  });

  it('collapses the master to one entry per film', () => {
    const names = [
      'PET 12µm',
      'PET 19µm',
      'MET PET 12µm',
      'PE 50µm',
      'PE 60µm',
      'LDPE 60µm',
      'BOPP 20µm',
      'Foil 7µm',
      'PVC / PETG 45µm',
      'POF 40µm',
      'PP Woven',
    ];
    // Eleven rows, nine films: PET and PE each appeared twice.
    expect(new Set(names.map(filmFamily)).size).toBe(9);
  });
});

describe('resolveFilm', () => {
  const FILMS = [
    { name: 'PET 12µm' },
    { name: 'PET 19µm' },
    { name: 'PE 50µm' },
    { name: 'PE 60µm' },
    { name: 'PP Woven' },
  ];

  it('finds the stocked film when the gauge is one the master holds', () => {
    // The point of the whole change: PET at 19 is a real material with a real
    // price, and must not be treated as an unpriced gauge.
    expect(resolveFilm('PET', 19, FILMS)?.name).toBe('PET 19µm');
    expect(resolveFilm('PET', 12, FILMS)?.name).toBe('PET 12µm');
    expect(resolveFilm('PE', 60, FILMS)?.name).toBe('PE 60µm');
  });

  it('falls back to the nearest gauge in the family for a gauge nobody stocks', () => {
    /*
     * Not a price — `plyRatePerKg` sees the name state 19 against a quoted 20
     * and refuses to cost it until the office gives a rate. This is for the
     * density, which is a property of the polymer rather than the gauge, and
     * for a name to show on the line.
     */
    expect(resolveFilm('PET', 20, FILMS)?.name).toBe('PET 19µm');
    expect(resolveFilm('PE', 45, FILMS)?.name).toBe('PE 50µm');
  });

  it('answers at any gauge for a family named without one', () => {
    expect(resolveFilm('PP Woven', 90, FILMS)?.name).toBe('PP Woven');
    expect(resolveFilm('PP Woven', 120, FILMS)?.name).toBe('PP Woven');
  });

  it('picks something while the gauge box is still empty', () => {
    // Choosing a family before typing a gauge must land somewhere, or the ply
    // would have no density and the line would read as uncostable.
    expect(resolveFilm('PET', 0, FILMS)?.name).toBe('PET 12µm');
  });

  it('is undefined for a family that holds nothing', () => {
    expect(resolveFilm('Nylon', 15, FILMS)).toBeUndefined();
    expect(resolveFilm('', 15, FILMS)).toBeUndefined();
  });
});
