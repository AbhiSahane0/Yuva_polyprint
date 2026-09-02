import { describe, expect, it } from 'vitest';
import { quotationItemSchema } from './quotation.js';

/**
 * How a line is sold is now the office's choice, with the trade convention as
 * the fallback. These pin the three ways that resolves, because getting it
 * wrong silently reprices a quotation rather than failing.
 */

/** A standup pouch, per-piece by convention, priced by the piece. */
const perPouchLine = {
  jobName: 'Standup 200g',
  jobKind: 'POUCH' as const,
  pouchType: 'STANDUP' as const,
  widthMm: 250,
  heightMm: 205,
  layers: [
    { materialId: 'a', micron: 12 },
    { materialId: 'b', micron: 60 },
  ],
  quantities: [{ quantityPouches: 25_000, ratePerPouch: 4.2 }],
  repeatWidth: 1,
  repeatHeight: 1,
  cylinderCount: 4,
};

/** The same line, sold by weight instead. */
const perKgLine = {
  ...perPouchLine,
  quantities: [{ quantityKg: 250, ratePerKg: 300 }],
};

describe('a line that does not state a basis', () => {
  it('takes the convention for its pouch style', () => {
    const standup = quotationItemSchema.parse(perPouchLine);
    expect(standup.pricingBasis).toBe('PER_POUCH');

    const centreSeal = quotationItemSchema.parse({
      ...perKgLine,
      pouchType: 'CENTRE_SEAL' as const,
    });
    expect(centreSeal.pricingBasis).toBe('PER_KG');
  });
});

describe('a line that states one', () => {
  it('sells a standup pouch by the kilogram when the office says so', () => {
    const parsed = quotationItemSchema.parse({ ...perKgLine, pricingBasis: 'PER_KG' });
    expect(parsed.pricingBasis).toBe('PER_KG');
  });

  it('sells a centre-seal pouch by the piece when the office says so', () => {
    const parsed = quotationItemSchema.parse({
      ...perPouchLine,
      pouchType: 'CENTRE_SEAL' as const,
      pricingBasis: 'PER_POUCH',
    });
    expect(parsed.pricingBasis).toBe('PER_POUCH');
  });

  it('validates the pair the office chose, not the one its style implies', () => {
    // A standup pouch sold by weight: the pouch pair is empty, and that is fine.
    expect(() => quotationItemSchema.parse({ ...perKgLine, pricingBasis: 'PER_KG' })).not.toThrow();

    // The same line without the kilogram pair must fail, on the kilogram fields.
    const missing = quotationItemSchema.safeParse({
      ...perPouchLine,
      pricingBasis: 'PER_KG',
      quantities: [{ quantityPouches: 25_000, ratePerPouch: 4.2 }],
    });
    expect(missing.success).toBe(false);
    expect(missing.error?.issues.map((issue) => issue.path.join('.'))).toEqual([
      'quantities.0.quantityKg',
      'quantities.0.ratePerKg',
    ]);
  });
});

describe('a roll', () => {
  it('is sold by weight however the request asks', () => {
    const parsed = quotationItemSchema.parse({
      ...perKgLine,
      jobKind: 'ROLL' as const,
      pricingBasis: 'PER_POUCH',
    });
    // There are no pouches on a reel to count, so the choice is not honoured.
    expect(parsed.pricingBasis).toBe('PER_KG');
    expect(parsed.pouchType).toBeNull();
  });
});
