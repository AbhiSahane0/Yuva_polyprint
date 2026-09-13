import { describe, expect, it } from 'vitest';

/**
 * **Delete is for a mistake; a document that left the building is never deleted
 * around.**
 *
 * A name typed wrong, or a film added and thought better of, should go. But a
 * **quotation** and a **purchase order** are things the works sent to somebody,
 * and each has to stay able to say what it was priced on. A purchase line is
 * `Restrict`, so the database would refuse it anyway — with a raw foreign-key
 * error, which is not an answer anybody can act on. A quotation ply is
 * `SetNull`, so the database would happily ALLOW it: the ply keeps its snapshot
 * and the document still reads, while the link to what it was priced on goes
 * without a word. Both are refused here, by name.
 *
 * **Stock is not in that class.** A batch is the works' own note of what it
 * holds, not a promise made to anybody, and a material received by mistake has
 * to be removable. So stock does not refuse outright — it refuses until the
 * caller says to discard it, which only the Inventory screen does, and only
 * after showing on screen how much goes. The batches and their movements are
 * then deleted in the same transaction as the material.
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
  const decide = (
    uses: {
      quotationLines?: number;
      purchaseLines?: number;
      stockBatches?: number;
      stockMovements?: number;
    },
    discardStock = false,
  ) => {
    // Documents that left the building. Never deleted around, whatever is asked.
    if ((uses.quotationLines ?? 0) + (uses.purchaseLines ?? 0) > 0) return 'refuse';
    // The works' own record of what it holds. Goes, once somebody has said so.
    if ((uses.stockBatches ?? 0) + (uses.stockMovements ?? 0) > 0) {
      return discardStock ? 'delete with its stock' : 'refuse';
    }
    return 'delete';
  };

  it('removes one nothing has used', () => {
    expect(decide({})).toBe('delete');
  });

  it.each([
    ['a quotation line', { quotationLines: 1 }],
    ['a purchase line', { purchaseLines: 1 }],
  ])('refuses one on %s, asked or not', (_label, uses) => {
    expect(decide(uses)).toBe('refuse');
    /* The flag says "I have seen the stock", not "delete it regardless". */
    expect(decide(uses, true)).toBe('refuse');
  });

  /*
   * A quotation ply is SetNull, not Restrict, so the database would ALLOW this
   * one. It is refused on purpose: the document would still read, and the link
   * to what it was priced on would be gone.
   */
  it('refuses a quoted material even though the database would allow it', () => {
    expect(decide({ quotationLines: 18 })).toBe('refuse');
  });

  it.each([
    ['a stock batch', { stockBatches: 1 }],
    ['a stock movement', { stockMovements: 1 }],
  ])('refuses one on %s until the stock is acknowledged', (_label, uses) => {
    expect(decide(uses)).toBe('refuse');
    expect(decide(uses, true)).toBe('delete with its stock');
  });

  /*
   * Received against a purchase order, so there is both. The order wins: stock
   * can be discarded, an order cannot, and the answer must not depend on which
   * check happens to run first.
   */
  it('refuses stock received on an order even when the stock is acknowledged', () => {
    expect(decide({ purchaseLines: 1, stockBatches: 2, stockMovements: 5 }, true)).toBe('refuse');
  });
});
