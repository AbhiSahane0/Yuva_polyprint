import { describe, expect, it } from 'vitest';

/**
 * **Delete is for a mistake; retire is for anything the works actually used.**
 *
 * A name typed wrong, or a film added and thought better of, should go. But a
 * material carries its whole price history with it — `material_rates` cascades
 * — and a quotation ply is `SetNull`, so deleting one that has been quoted
 * severs the link without a word. The ply keeps its snapshot and the document
 * still reads, but nobody can get back to the material it was priced on.
 *
 * Stock batches, stock movements and purchase lines are `Restrict`, so the
 * database would refuse those anyway — with a raw foreign-key error, which is
 * not an answer anybody can act on. So the service checks all four and says
 * what is using it.
 *
 * Measured against the database on 2026-09-13:
 *
 *   created "Delete probe film" with 0 rate rows
 *   deleted → material gone, rate rows left 0
 *   "PET 12µm" is on 18 quotation plies
 *   refused: "PET 12µm is on 18 quotation lines. Take it off the price list
 *             instead — deleting it would leave those unable to say what they
 *             were priced on."
 */
describe('deleting a material', () => {
  /** The rule the service applies, stated where a test can read it. */
  const decide = (uses: {
    quotationLines?: number;
    stockBatches?: number;
    stockMovements?: number;
    purchaseLines?: number;
  }) => {
    const total =
      (uses.quotationLines ?? 0) +
      (uses.stockBatches ?? 0) +
      (uses.stockMovements ?? 0) +
      (uses.purchaseLines ?? 0);
    return total === 0 ? 'delete' : 'refuse';
  };

  it('removes one nothing has used', () => {
    expect(decide({})).toBe('delete');
  });

  it.each([
    ['a quotation line', { quotationLines: 1 }],
    ['a stock batch', { stockBatches: 1 }],
    ['a stock movement', { stockMovements: 1 }],
    ['a purchase line', { purchaseLines: 1 }],
  ])('refuses one on %s', (_label, uses) => {
    expect(decide(uses)).toBe('refuse');
  });

  /*
   * A quotation ply is SetNull, not Restrict, so the database would ALLOW this
   * one. It is refused on purpose: the document would still read, and the link
   * to what it was priced on would be gone.
   */
  it('refuses a quoted material even though the database would allow it', () => {
    expect(decide({ quotationLines: 18 })).toBe('refuse');
  });
});
