import { describe, expect, it } from 'vitest';
import {
  adjustStockSchema,
  issueStockSchema,
  receiveStockSchema,
  transferStockSchema,
} from './inventory.js';

/**
 * What the stock forms accept, and what they refuse.
 *
 * The refusals are the point. A movement that gets in with the wrong sign, the
 * wrong magnitude or no explanation is one nobody can unpick later — movements
 * are never edited, so anything wrong here stays on the record forever.
 */
const receipt = {
  materialId: 'm1',
  batchCode: 'PET-2026-081',
  quantity: 3000,
  receivedOn: '2026-09-01',
};

describe('receiveStockSchema', () => {
  it('takes a delivery with the rate left blank', () => {
    // The lorry often arrives before the invoice. The catalogue rate stands in
    // for valuation until somebody fills this in.
    const result = receiveStockSchema.parse(receipt);
    expect(result.ratePerUnit).toBeNull();
    expect(result.location).toBe('NA');
  });

  it('needs a batch anybody can match to a delivery note', () => {
    expect(receiveStockSchema.safeParse({ ...receipt, batchCode: '  ' }).success).toBe(false);
  });

  it('refuses a quantity of nothing', () => {
    // A receipt of zero is not a delivery; it is a mistake with a batch code.
    expect(receiveStockSchema.safeParse({ ...receipt, quantity: 0 }).success).toBe(false);
    expect(receiveStockSchema.safeParse({ ...receipt, quantity: -500 }).success).toBe(false);
  });

  it('refuses a figure with an extra digit', () => {
    // A million kilograms of film is four hundred lorries. Far likelier a
    // keystroke, and a receipt that size would take days to unpick.
    expect(receiveStockSchema.safeParse({ ...receipt, quantity: 5_000_000 }).success).toBe(false);
  });

  it('insists on a real date', () => {
    expect(receiveStockSchema.safeParse({ ...receipt, receivedOn: '01-09-2026' }).success).toBe(
      false,
    );
  });

  it('treats the importer’s NA as an empty note', () => {
    expect(receiveStockSchema.parse({ ...receipt, notes: 'NA' }).notes).toBe('');
  });
});

describe('issueStockSchema', () => {
  it('defaults to an issue rather than to waste', () => {
    // The two are counted separately, and guessing wrong overstates one of them.
    expect(issueStockSchema.parse({ batchId: 'b1', quantity: 120 }).kind).toBe('ISSUE');
  });

  it('allows an issue with no job named', () => {
    expect(issueStockSchema.parse({ batchId: 'b1', quantity: 120 }).jobId).toBeNull();
  });

  it('refuses a negative quantity outright', () => {
    /*
     * The direction is decided by the kind, not by a sign somebody typed.
     * Accepting "-120" here would mean an issue that added stock.
     */
    expect(issueStockSchema.safeParse({ batchId: 'b1', quantity: -120 }).success).toBe(false);
  });
});

describe('adjustStockSchema', () => {
  it('takes what was counted, including nothing at all', () => {
    // Zero is a real count: the shelf was empty.
    expect(
      adjustStockSchema.parse({ batchId: 'b1', countedQuantity: 0, notes: 'shelf empty' }),
    ).toMatchObject({ countedQuantity: 0 });
  });

  it('will not record a correction nobody explained', () => {
    // An unexplained adjustment is the one nobody can learn from — and the one
    // that looks like stock going missing.
    expect(adjustStockSchema.safeParse({ batchId: 'b1', countedQuantity: 2050 }).success).toBe(
      false,
    );
    expect(
      adjustStockSchema.safeParse({ batchId: 'b1', countedQuantity: 2050, notes: 'ok' }).success,
    ).toBe(false);
  });

  it('refuses a negative count', () => {
    // There cannot be minus forty kilograms on a shelf.
    expect(
      adjustStockSchema.safeParse({ batchId: 'b1', countedQuantity: -5, notes: 'counted' }).success,
    ).toBe(false);
  });
});

describe('transferStockSchema', () => {
  it('needs somewhere to move it to', () => {
    expect(transferStockSchema.safeParse({ batchId: 'b1', toLocation: '   ' }).success).toBe(false);
  });

  it('takes a location and an optional note', () => {
    expect(transferStockSchema.parse({ batchId: 'b1', toLocation: 'B-01' })).toEqual({
      batchId: 'b1',
      toLocation: 'B-01',
      notes: '',
    });
  });
});
