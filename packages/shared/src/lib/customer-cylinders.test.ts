import { describe, expect, it } from 'vitest';
import { quotationItemSchema } from '../schemas/quotation.js';
import { computeItemGeometry } from './quotation-math.js';

/**
 * **A set the works never made is a set it cannot charge for making.**
 *
 * Some jobs arrive with their cylinders. The customer had them cut elsewhere,
 * the works prints from them, and they go home again — so there is nothing to
 * engrave and nothing to bill for engraving.
 *
 * It is not a repeat, although both charge nothing. A repeat is a design the
 * works engraved itself and still holds on a shelf, which is why it can also be
 * quoted for putting one of them right. Before this answer existed the only way
 * to stop the charge was to mark the new design as a repeat, after which the
 * quotation claimed the works holds a set nobody here has ever seen.
 */

/** Enough of a line for the schema to accept, and for a set to be priced. */
const LINE = {
  jobName: 'Amol Bhadang 500gm',
  jobKind: 'POUCH',
  pouchType: 'STANDUP',
  widthMm: 170,
  heightMm: 240,
  layers: [
    { materialId: 'm1', micron: 12 },
    { materialId: 'm2', micron: 70 },
  ],
  /* Sold by the kilogram, so the kilogram pair is the one that has to be
     filled in — a standup otherwise takes the per-piece convention and the
     schema asks for a count and a rate per pouch instead. */
  pricingBasis: 'PER_KG',
  quantities: [{ quantityKg: 500, ratePerKg: 240 }],
  repeatWidth: 2,
  repeatHeight: 2,
  cylinderCount: 6,
} as const;

describe('whose cylinders the line prints from', () => {
  it('cuts and charges a set by default', () => {
    const item = quotationItemSchema.parse(LINE);
    expect(item.customerCylinders).toBe(false);
    expect(item.chargeCylinders).toBe(true);
  });

  /*
   * The screen writes both fields, and a request need only send one. This is
   * the rule that stops a line saying "the customer brought them" and "charge
   * for cutting them" in the same breath — which would quote an engraving
   * nobody is doing.
   */
  it('never charges for a set the customer brought, whatever else the line says', () => {
    const item = quotationItemSchema.parse({
      ...LINE,
      customerCylinders: true,
      chargeCylinders: true,
    });
    expect(item.customerCylinders).toBe(true);
    expect(item.chargeCylinders).toBe(false);
  });

  it('leaves a repeat a repeat, which is a different answer', () => {
    const item = quotationItemSchema.parse({ ...LINE, chargeCylinders: false });
    /* Nothing charged either way — and the document still says which it is, so
       the cylinder register is not told about a set that is not here. */
    expect(item.chargeCylinders).toBe(false);
    expect(item.customerCylinders).toBe(false);
  });
});

/** ₹2.50 a square centimetre, as the works' settings have it. */
const RATE = 2.5;

const GEOMETRY = {
  layerCount: 2,
  micron: 82,
  gsm: 90,
  widthMm: 170,
  heightMm: 240,
  makesPouches: true,
  repeatWidth: 2,
  repeatHeight: 2,
  cylinderCount: 6,
  mountingMm: 80,
} as const;

describe('what the quotation bills for a set the customer brought', () => {
  it('bills nothing, and still says what one would have cost', () => {
    const own = quotationItemSchema.parse({ ...LINE, customerCylinders: true });
    const line = computeItemGeometry(
      { ...GEOMETRY, chargeCylinders: own.chargeCylinders } as never,
      RATE,
    );

    /* Reported, so the office can see what the works was spared — but not
       charged, because the works did not cut them. */
    expect(line.costPerCylinder).toBeGreaterThan(0);
    expect(line.totalCylinderCost).toBe(0);
  });

  /*
   * Freight on a set is freight on a set that is coming. Nothing is being
   * engraved, so nothing is being delivered, and the transport went the same
   * way as the engraving.
   */
  it('bills no delivery on cylinders that are not being made', () => {
    const line = computeItemGeometry(
      { ...GEOMETRY, chargeCylinders: false, transportCost: 1500 } as never,
      RATE,
    );
    expect(line.totalCylinderCost).toBe(0);
  });
});
