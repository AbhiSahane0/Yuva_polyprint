import { describe, expect, it } from 'vitest';
import {
  computeItem,
  computeItemGeometry,
  computeTier,
  computeTotals,
  structureGsm,
} from './quotation-math.js';

/**
 * Locks the arithmetic to the client's real quotation #118. If a formula ever
 * drifts, these numbers stop matching the document they already sent out.
 */
describe('quotation #118 (Sai Samruddhi Milk and Agro Products)', () => {
  const CYLINDER_RATE = 2.5;
  const RATES = { gstPercent: 18, materialAdvancePercent: 70, cylinderAdvancePercent: 100 };

  const fiveKg = computeItem(
    {
      layer: 2,
      widthMm: 670,
      heightMm: 460,
      polyMicron: 60,
      quantityKg: 250,
      ratePerKg: 295,
      repeatWidth: 1,
      repeatHeight: 1,
      cylinderCount: 4,
    },
    CYLINDER_RATE,
  );
  const oneKg = computeItem(
    {
      layer: 2,
      widthMm: 560,
      heightMm: 220,
      polyMicron: 60,
      quantityKg: 250,
      ratePerKg: 295,
      repeatWidth: 1,
      repeatHeight: 2,
      cylinderCount: 4,
    },
    CYLINDER_RATE,
  );

  it('computes the 5 Kg Paneer Bag line', () => {
    expect(fiveKg.micron).toBe(74);
    expect(fiveKg.pouchesPerKg).toBe(39.86);
    expect(fiveKg.totalPouches).toBe(9965);
    expect(fiveKg.totalAmount).toBe(73750);
    expect(fiveKg.cylinderWidth).toBe(750);
    expect(fiveKg.cylinderCircumference).toBe(460);
    expect(fiveKg.costPerCylinder).toBe(8625);
    expect(fiveKg.totalCylinderCost).toBe(34500);
  });

  it('computes the 1 Kg Paneer Bag line, rounding pouches/kg before multiplying', () => {
    expect(oneKg.pouchesPerKg).toBe(99.72);
    // 99.716 x 250 would give 24,929 — the sheet rounds first and prints 24,930.
    expect(oneKg.totalPouches).toBe(24930);
    expect(oneKg.costPerCylinder).toBe(7040);
    expect(oneKg.totalCylinderCost).toBe(28160);
  });

  it('computes the document totals', () => {
    const totals = computeTotals(
      [
        { ...fiveKg, quantityKg: 250, cylinderCount: 4 },
        { ...oneKg, quantityKg: 250, cylinderCount: 4 },
      ],
      RATES,
    );

    expect(totals.totalQuantityKg).toBe(500);
    expect(totals.totalCylinderCount).toBe(8);
    expect(totals.materialSubtotal).toBe(147500);
    expect(totals.materialWithGst).toBe(174050);
    expect(totals.cylinderSubtotal).toBe(62660);
    expect(totals.cylinderWithGst).toBe(73939);
    expect(totals.grandSubtotal).toBe(210160);
    expect(totals.grandWithGst).toBe(247989);
    // Advance is taken on GST-inclusive amounts.
    expect(totals.totalAdvance).toBe(195774);
  });
});

/*
 * Geometry and tiers, checked against quotation #118 — the document the whole
 * module was verified against originally. Splitting the calculation in two must
 * not move a single figure on a quotation the client has already sent.
 */
describe('computeItemGeometry', () => {
  // 5 Kg Paneer Bag: 670 × 460, 74µ overall, one pouch across and around.
  const paneerBag = {
    layerCount: 2,
    micron: 74,
    widthMm: 670,
    heightMm: 460,
    repeatWidth: 1,
    repeatHeight: 1,
    cylinderCount: 8,
  };

  it('reproduces the pouches per kilogram on the sent document', () => {
    expect(computeItemGeometry(paneerBag, 2.5).pouchesPerKg).toBe(39.86);
  });

  it('reproduces the cylinder size and cost on the sent document', () => {
    const g = computeItemGeometry(paneerBag, 2.5);

    expect(g.cylinderWidth).toBe(750); // 670 × 1 + 80 margin
    expect(g.cylinderCircumference).toBe(460);
    expect(g.costPerCylinder).toBe(8625);
    expect(g.totalCylinderCost).toBe(69000); // 8 cylinders
  });

  it('adds transport to the cylinder total when it is charged', () => {
    expect(computeItemGeometry({ ...paneerBag, transportCost: 1500 }, 2.5).totalCylinderCost).toBe(
      70500,
    );
  });

  /*
   * A repeat order on an existing design. The cylinders are already in the
   * works, so nothing is charged for them or for delivering them — but the
   * per-cylinder figure stays visible, so the office can still see what a new
   * set would cost if one were damaged.
   */
  it('charges nothing for cylinders on a design that already has them', () => {
    const g = computeItemGeometry(
      { ...paneerBag, chargeCylinders: false, transportCost: 1500 },
      2.5,
    );

    expect(g.totalCylinderCost).toBe(0);
    expect(g.costPerCylinder).toBe(8625);
  });

  /**
   * **A pouch weighs what its film weighs, not what its thickness implies.**
   *
   * The proxy below stands a flat 1.1 in for the laminate's density. PET over
   * white-opaque poly averages 0.985, so a pouch came out 9.1% heavy: the
   * works' own sheet says 500 kg of the Anupriya job is 9,524 pouches and this
   * quoted 8,730, which put Rs 15.09 on a document the sheet prices at
   * Rs 13.83. PET over MET PET averages 1.400 and went the other way by 27%.
   *
   * Density is a property of the film, is on the rate list beside its price,
   * and is what the client's own sheet uses — there is a whole table of them
   * in it.
   */
  describe('weighing a pouch by its real density', () => {
    /* The workbook's job: PET 12µ at 1.4 over W/O Poly 110µ at 0.94. */
    const plies = [
      { micron: 12, density: 1.4 },
      { micron: 110, density: 0.94 },
    ];
    const coats = { inkGsm: 1.8, adhesiveGsm: 3 };

    it('totals the plies at their own density, plus the coats', () => {
      // Estimation!G15 — 16.8 + 103.4 + 1.8 + 3
      expect(structureGsm(plies, coats)).toBe(125);
    });

    it('reaches the sheet’s own pouch weight and count', () => {
      const g = computeItemGeometry(
        { ...paneerBag, widthMm: 700, heightMm: 600, gsm: structureGsm(plies, coats) },
        2.5,
      );

      // Estimation!J10 — 19.05 pouches to the kilogram, so J9's 52.5 g.
      expect(g.pouchesPerKg).toBe(19.05);
      /* One decimal: the count is rounded to a paisa-sized 2 dp before this. */
      expect(1000 / g.pouchesPerKg).toBeCloseTo(52.5, 1);
    });

    it('falls back to the micron proxy when a ply has no density', () => {
      expect(
        structureGsm(
          [
            { micron: 12, density: 1.4 },
            { micron: 110, density: null },
          ],
          coats,
        ),
      ).toBe(0);

      /* Zero means "use the proxy", which is the pre-existing behaviour. */
      const withoutDensity = computeItemGeometry({ ...paneerBag, gsm: 0 }, 2.5);
      expect(withoutDensity.pouchesPerKg).toBe(39.86);
    });

    it('ignores a ply left at zero microns, as the sheet does', () => {
      const withEmptyMetPet = [
        { micron: 12, density: 1.4 },
        { micron: 0, density: 1.4 },
        { micron: 110, density: 0.94 },
      ];
      expect(structureGsm(withEmptyMetPet, coats)).toBe(125);
    });
  });

  it('allows more waste on a three-ply structure than a two-ply one', () => {
    const two = computeItemGeometry(paneerBag, 2.5).pouchesPerKg;
    const three = computeItemGeometry({ ...paneerBag, layerCount: 3 }, 2.5).pouchesPerKg;

    // 1.2 against 1.1 — fewer pouches out of the same kilogram.
    expect(three).toBeLessThan(two);
  });
});

describe('computeTier', () => {
  it('prices a per-kg line and reports the pouches it yields', () => {
    const tier = computeTier(39.86, { quantityKg: 250, ratePerKg: 200 });

    expect(tier.totalPouches).toBe(9965); // 39.86 × 250, the figure on #118
    expect(tier.totalAmount).toBe(50000);
    expect(tier.quantityKg).toBe(250);
  });

  it('works the weight back out of a per-pouch line', () => {
    const tier = computeTier(39.86, {
      pricingBasis: 'PER_POUCH',
      quantityKg: 0,
      ratePerKg: 0,
      quantityPouches: 9965,
      ratePerPouch: 5,
    });

    // The film is ordered by weight whichever way the line was typed.
    expect(tier.quantityKg).toBe(250);
    expect(tier.totalAmount).toBe(49825);
    expect(tier.ratePerKg).toBe(199.3);
  });

  it('gives the same geometry a different price at each quantity', () => {
    const tiers = [
      computeTier(39.86, { quantityKg: 100, ratePerKg: 210 }),
      computeTier(39.86, { quantityKg: 250, ratePerKg: 200 }),
      computeTier(39.86, { quantityKg: 500, ratePerKg: 190 }),
    ];

    expect(tiers.map((t) => t.totalAmount)).toEqual([21000, 50000, 95000]);
    // Per-pouch cost falls as the quantity rises, which is the point of tiers.
    expect(tiers[0]!.costPerPouch).toBeGreaterThan(tiers[2]!.costPerPouch);
  });

  it('costs nothing rather than dividing by zero on an empty line', () => {
    expect(computeTier(0, { quantityKg: 0, ratePerKg: 0 }).costPerPouch).toBe(0);
  });
});
