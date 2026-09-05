import { describe, expect, it } from 'vitest';
import type { Quotation, QuotationItem, QuotationTier } from '@yuva/shared';
import { renderQuotationHtml } from './quotation-document.js';

/**
 * **One quantity reaches the customer.**
 *
 * A job may be priced at two or three while the office decides what to charge —
 * the margin at 5,000 against the margin at 50,000 — but that is working, not
 * an offer. Printing all of them turns one price into a menu and invites the
 * customer to negotiate against the office's own arithmetic.
 *
 * Tested against the rendered document rather than the selection helper alone,
 * because the failure worth catching is a second column surviving on the page:
 * everything upstream can be right and the customer still sees three prices.
 */
const tier = (position: number, amount: number): QuotationTier =>
  ({
    id: `t${position}`,
    position,
    materialSubtotal: amount,
    materialWithGst: amount * 1.18,
    cylinderSubtotal: 39000,
    cylinderWithGst: 46020,
    grandSubtotal: amount + 39000,
    grandWithGst: (amount + 39000) * 1.18,
    materialAdvance: amount * 0.7,
    cylinderAdvance: 39000,
    totalAdvance: amount * 0.7 + 39000,
    totalQuantityKg: 100,
    totalPouches: amount / 10,
  }) as QuotationTier;

const item: QuotationItem = {
  id: 'i1',
  position: 1,
  jobId: null,
  jobName: 'Quantity choice',
  jobKind: 'POUCH',
  pouchType: 'STANDUP',
  pouchTypeNote: '',
  pricingBasis: 'PER_POUCH',
  widthMm: 350,
  heightMm: 250,
  filmWidthMm: 350,
  filmHeightMm: 250,
  isGazette: false,
  gazetteBottom: 0,
  gazetteLeft: 0,
  gazetteRight: 0,
  micron: 64,
  pouchesPerKg: 162.34,
  repeatWidth: 2,
  repeatHeight: 2,
  cylinderCount: 4,
  cylinderWidth: 780,
  cylinderCircumference: 500,
  costPerCylinder: 9750,
  totalCylinderCost: 39000,
  transportCost: 0,
  chargeCylinders: true,
  materialCostPerKg: 213.45,
  compositeGsm: 67.1,
  layers: [
    {
      id: 'l1',
      position: 1,
      materialId: 'm1',
      materialName: 'PET 12µm',
      micron: 12,
      density: 1.4,
      ratePerKg: 210,
      gsm: 16.8,
    },
    {
      id: 'l2',
      position: 2,
      materialId: 'm2',
      materialName: 'PE 50µm',
      micron: 50,
      density: 0.94,
      ratePerKg: 185,
      gsm: 47,
    },
  ],
  quantities: [
    {
      id: 'q1',
      position: 1,
      quantityKg: 30.8,
      ratePerKg: 1948,
      quantityPouches: 5000,
      ratePerPouch: 12,
      totalPouches: 5000,
      totalAmount: 60000,
      costPerPouch: 12,
    },
    {
      id: 'q2',
      position: 2,
      quantityKg: 154,
      ratePerKg: 1623,
      quantityPouches: 25000,
      ratePerPouch: 10,
      totalPouches: 25000,
      totalAmount: 250000,
      costPerPouch: 10,
    },
    {
      id: 'q3',
      position: 3,
      quantityKg: 616,
      ratePerKg: 1461,
      quantityPouches: 100000,
      ratePerPouch: 9,
      totalPouches: 100000,
      totalAmount: 900000,
      costPerPouch: 9,
    },
  ],
} as unknown as QuotationItem;

const quotation = (selectedQuantity: number, tierCount = 3): Quotation =>
  ({
    id: 'q',
    number: 130,
    date: '2026-09-05',
    status: 'DRAFT',
    customerId: null,
    customerName: 'Family And Quantity Check',
    itemCount: 1,
    version: 1,
    isLatest: true,
    tierCount,
    selectedQuantity,
    grandWithGst: 341020,
    totalAdvance: 252520,
    sentAt: null,
    createdAt: '2026-09-05T00:00:00.000Z',
    updatedAt: '2026-09-05T00:00:00.000Z',
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
    tiers: [tier(1, 60000), tier(2, 250000), tier(3, 900000)].slice(0, tierCount),
    terms: ['18% GST applicable on total value.'],
    notes: '',
    items: [item],
  }) as unknown as Quotation;

/** Rupee figures as they are printed, so a column can be looked for by amount. */
const shows = (html: string, amount: string) => html.includes(amount);

describe('the printed quotation', () => {
  it('prints only the quantity that was chosen', () => {
    const html = renderQuotationHtml(quotation(2));

    expect(shows(html, '2,50,000')).toBe(true);
    // The other two were the office's working and must not reach the page.
    expect(shows(html, '60,000')).toBe(false);
    expect(shows(html, '9,00,000')).toBe(false);
  });

  it('prints the first when that is the one chosen', () => {
    const html = renderQuotationHtml(quotation(1));

    expect(shows(html, '60,000')).toBe(true);
    expect(shows(html, '2,50,000')).toBe(false);
  });

  it('prints the third when that is the one chosen', () => {
    const html = renderQuotationHtml(quotation(3));

    expect(shows(html, '9,00,000')).toBe(true);
    expect(shows(html, '60,000')).toBe(false);
  });

  it('falls back rather than printing nothing when the chosen quantity is gone', () => {
    /*
     * Priced at three, ticked the third, then trimmed to one. The selection is
     * saved alongside the quantities, so it can outlive them by a moment — and
     * a document that renders an empty column is worse than one that renders
     * the quantity that certainly exists.
     */
    const html = renderQuotationHtml(quotation(3, 1));
    expect(shows(html, '60,000')).toBe(true);
  });

  it('still prints a quotation written before the choice existed', () => {
    // Every existing row defaults to 1 in the database.
    const html = renderQuotationHtml(quotation(1, 1));
    expect(shows(html, '60,000')).toBe(true);
  });
});
