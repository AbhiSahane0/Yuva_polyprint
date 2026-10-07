import { describe, expect, it } from 'vitest';
import type { Quotation, QuotationItem } from '@yuva/shared';
import { renderQuotationHtml } from './quotation-document.js';

/**
 * **A pouch job prints the rate each as well as the rate per kilogram.**
 *
 * Asserted on the markup rather than on the bare text: the letterhead is a
 * base64 data URI, and a three-character string like "/pc" turns up inside it
 * by chance. `class="sub"` is emitted by nothing else on the page.
 *
 * The works prices by weight, because that is how the film is bought and what
 * every line of the costing is worked out from. The customer buys pouches, and
 * "what does one cost" is the first question back — so a document that printed
 * only Rs. 281.24 /kg was asking them to do the arithmetic, against a
 * pouches-per-kilogram figure printed three columns away. Two people doing that
 * sum by hand is two chances to get a different answer to the works.
 *
 * It is not a second price. `costPerPouch` is the order total over the number
 * of pouches, so it is exactly what this line works out to per piece.
 *
 * A **roll** gets no such line: there is nothing on a reel to count, and a
 * per-piece rate on one would be an invented unit.
 */
const line = (over: Partial<QuotationItem>): QuotationItem =>
  ({
    id: 'i1',
    position: 1,
    jobId: null,
    jobName: 'Green Peas 500g',
    jobKind: 'POUCH',
    pouchType: 'STANDUP',
    pouchTypeNote: '',
    pricingBasis: 'PER_KG',
    widthMm: 700,
    heightMm: 600,
    filmWidthMm: 700,
    filmHeightMm: 600,
    isGazette: false,
    gazetteBottom: 0,
    gazetteLeft: 0,
    gazetteRight: 0,
    micron: 125,
    pouchesPerKg: 43.13,
    repeatWidth: 1,
    repeatHeight: 1,
    cylinderCount: 7,
    cylinderWidth: 780,
    cylinderCircumference: 600,
    costPerCylinder: 11700,
    totalCylinderCost: 81900,
    transportCost: 0,
    chargeCylinders: true,
    layers: [],
    quantities: [
      {
        id: 'q1',
        position: 1,
        quantityKg: 500,
        ratePerKg: 281.24,
        quantityPouches: 0,
        ratePerPouch: 0,
        totalPouches: 21_565,
        totalAmount: 140_621,
        costPerPouch: 6.52,
      },
    ],
    /* The document prints what a line is printed in, so a stand-in for a line
       has to say — an empty list meaning "not recorded", which is what every
       quotation written before colours were chosen carries. */
    colours: [],
    ...over,
  }) as unknown as QuotationItem;

const document = (item: QuotationItem): Quotation =>
  ({
    id: 'q',
    number: 140,
    date: '2026-09-14',
    status: 'DRAFT',
    customerId: null,
    customerName: 'Rate Display Check',
    itemCount: 1,
    version: 1,
    isLatest: true,
    tierCount: 1,
    selectedQuantity: 1,
    grandWithGst: 0,
    totalAdvance: 0,
    sentAt: null,
    createdAt: '2026-09-14T00:00:00.000Z',
    updatedAt: '2026-09-14T00:00:00.000Z',
    addressLine1: 'Sangamner',
    addressLine2: '',
    addressLine3: '',
    mobile: '',
    email: '',
    gstNumber: 'NA',
    decidedAt: null,
    lostReason: '',
    cylinderRate: 2.5,
    gstPercent: 18,
    materialAdvancePercent: 70,
    cylinderAdvancePercent: 100,
    wonTierId: null,
    rootId: null,
    tiers: [],
    terms: [],
    notes: '',
    items: [item],
    /* No title: the printed document leaves that line out entirely. */
    title: '',
  }) as unknown as Quotation;

describe('the rate column', () => {
  it('prints the rate each under the rate per kilogram on a pouch job', () => {
    const html = renderQuotationHtml(document(line({})));

    expect(html).toContain('281.24');
    expect(html).toContain('Rs. 6.52 a pouch');
  });

  it('leaves the rate each off a roll', () => {
    const html = renderQuotationHtml(
      /* A reel, so no pouches and nothing to price per piece. */
      document(line({ jobKind: 'ROLL', pouchType: null, pouchesPerKg: 0 })),
    );

    expect(html).toContain('281.24');
    /* Named by the phrase rather than by the markup: every line on the printed
       document carries sub-lines — its structure, its cylinders — so the class
       alone no longer says anything about the rate. */
    expect(html).not.toContain('a pouch');
  });

  /*
   * A line genuinely quoted per piece — one written before the form settled on
   * kilograms — still prints the rate it was quoted at, not a derived one.
   */
  it('prints the quoted per-piece rate on a line priced that way', () => {
    const html = renderQuotationHtml(
      document(
        line({
          pricingBasis: 'PER_POUCH',
          quantities: [
            {
              id: 'q1',
              position: 1,
              quantityKg: 500,
              ratePerKg: 281.24,
              quantityPouches: 21_565,
              ratePerPouch: 6.5208,
              totalPouches: 21_565,
              totalAmount: 140_621,
              costPerPouch: 6.52,
            },
          ],
        } as Partial<QuotationItem>),
      ),
    );

    expect(html).toContain('Rs. 6.52 a pouch');
  });

  /*
   * Nothing to divide by yet — a line with no costed structure has no pouch
   * count, and 0.00 /pc under the rate would read as a free pouch.
   */
  it('leaves the rate each off while the line has no pouch count', () => {
    const html = renderQuotationHtml(
      document(
        line({
          quantities: [
            {
              id: 'q1',
              position: 1,
              quantityKg: 500,
              ratePerKg: 281.24,
              quantityPouches: 0,
              ratePerPouch: 0,
              totalPouches: 0,
              totalAmount: 140_621,
              costPerPouch: 0,
            },
          ],
        } as Partial<QuotationItem>),
      ),
    );

    expect(html).not.toContain('a pouch');
    /* The count itself still prints, and reads as the nought it is. */
    expect(html).toContain('0 pouches');
  });
});
