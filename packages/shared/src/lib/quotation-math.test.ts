import { describe, expect, it } from 'vitest';
import { computeItem, computeTotals } from './quotation-math.js';

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
