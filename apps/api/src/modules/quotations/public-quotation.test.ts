import { describe, expect, it } from 'vitest';
import type { Quotation, QuotationItem, QuotationTier } from '@yuva/shared';
import { quotedTier, toPublicQuotation } from './public-quotation.js';

/**
 * **What a stranger with a link is allowed to see.**
 *
 * The first test in this file is the one that matters. Everything the office
 * knows about a quotation is in the object this projects from — what the film
 * costs, what the works makes on it, and the two quantities it priced while
 * deciding what to offer. One forgotten spread puts all of it in the browser
 * of every customer who opens the network tab, and nothing on the screen would
 * look any different.
 */

const EXPIRES = new Date('2026-12-14T06:30:00.000Z');

function tier(position: number, overrides: Partial<QuotationTier> = {}): QuotationTier {
  return {
    id: `tier-${position}`,
    position,
    materialSubtotal: 100000 * position,
    materialWithGst: 118000 * position,
    cylinderSubtotal: 36480,
    cylinderWithGst: 43046,
    grandSubtotal: 136480 * position,
    grandWithGst: 161046 * position,
    materialAdvance: 70000,
    cylinderAdvance: 36480,
    totalAdvance: 106480,
    totalQuantityKg: 500 * position,
    totalPouches: 20000 * position,
    ...overrides,
  };
}

function item(position: number, overrides: Partial<QuotationItem> = {}): QuotationItem {
  return {
    id: `item-${position}`,
    position,
    jobId: null,
    jobName: `Lokratna Besan ${position}00gm`,
    jobKind: 'POUCH',
    pouchType: 'STANDUP',
    pouchTypeNote: '',
    widthMm: 170,
    heightMm: 240,
    micron: 82,
    pricingBasis: 'PER_KG',
    totalCylinderCost: 36480,
    colours: [{ name: 'Cyan' }, { name: 'Magenta' }, { name: 'Yellow' }, { name: 'Black' }],
    /* The works' own working, which must not reach the customer. */
    quantities: [
      {
        position: 1,
        quantityKg: 500,
        ratePerKg: 240,
        quantityPouches: 20000,
        ratePerPouch: 6,
        totalPouches: 20000,
        totalAmount: 120000,
        costPerPouch: 4.1,
        materialCost: 82000,
        marginPercent: 31.5,
      },
      {
        position: 2,
        quantityKg: 1000,
        ratePerKg: 228,
        quantityPouches: 40000,
        ratePerPouch: 5.7,
        totalPouches: 40000,
        totalAmount: 228000,
        costPerPouch: 3.9,
        materialCost: 156000,
        marginPercent: 29.2,
      },
    ],
    ...overrides,
  } as unknown as QuotationItem;
}

function quotation(overrides: Partial<Quotation> = {}): Quotation {
  return {
    id: 'quo-1',
    number: 124,
    version: 1,
    date: '2026-11-24',
    customerName: 'A S Agro',
    title: 'Besan range',
    status: 'SENT',
    selectedQuantity: 1,
    wonTierId: null,
    gstPercent: 18,
    terms: ['Quotation valid for 15 days.'],
    notes: '',
    tiers: [tier(1), tier(2)],
    items: [item(1)],
    grandWithGst: 161046,
    /* Costing the office sees and the customer must not. */
    marginPercent: 31.5,
    cylinderRate: 2.5,
    transportPerKg: 6,
    pouchMakingPerKg: 14,
    wastagePercent: 7,
    ...overrides,
  } as unknown as Quotation;
}

describe('what reaches the customer', () => {
  /*
   * Written against the serialised payload rather than against the object,
   * because that is what crosses the wire. A getter, a spread or a field added
   * to `QuotationItem` next year all show up here.
   */
  it('carries none of the works’ own costing', () => {
    const payload = JSON.stringify(toPublicQuotation(quotation(), { expiresAt: EXPIRES }, null));

    for (const field of [
      'costPerPouch',
      'materialCost',
      'marginPercent',
      'cylinderRate',
      'transportPerKg',
      'pouchMakingPerKg',
      'wastagePercent',
    ]) {
      expect(payload).not.toContain(field);
    }

    /* And the figures themselves, in case a field is ever renamed. */
    expect(payload).not.toContain('82000');
    expect(payload).not.toContain('31.5');
  });

  it('quotes one quantity — the one that was sent', () => {
    const view = toPublicQuotation(quotation(), { expiresAt: EXPIRES }, null);

    expect(view.grandWithGst).toBe(161046);
    expect(view.items[0]?.quantityKg).toBe(500);
    expect(view.items[0]?.ratePerKg).toBe(240);
    /* The second column was the office's working and was never offered. */
    expect(JSON.stringify(view)).not.toContain('228000');
  });

  /*
   * The office picks which quantity the customer is quoted. Falling back to
   * the first would show a price that was never sent — on the page where the
   * customer agrees to it.
   */
  it('follows the quantity the office chose, not the cheapest', () => {
    const view = toPublicQuotation(
      quotation({ selectedQuantity: 2 }),
      { expiresAt: EXPIRES },
      null,
    );

    expect(view.grandWithGst).toBe(322092);
    expect(view.items[0]?.quantityKg).toBe(1000);
  });

  it('prefers the quantity they have already accepted', () => {
    const chosen = quotedTier(quotation({ selectedQuantity: 1, wonTierId: 'tier-2' }));
    expect(chosen?.position).toBe(2);
  });

  it('lists the jobs in the order the document prints them', () => {
    const view = toPublicQuotation(
      quotation({ items: [item(3), item(1), item(2)] }),
      { expiresAt: EXPIRES },
      null,
    );

    expect(view.items.map((line) => line.position)).toEqual([1, 2, 3]);
  });

  it('describes a line the way the document words it', () => {
    const view = toPublicQuotation(
      quotation({
        items: [
          item(1),
          item(2, { jobKind: 'ROLL', pouchType: null }),
          item(3, { pouchType: 'OTHER', pouchTypeNote: 'Four side seal' }),
        ],
      }),
      { expiresAt: EXPIRES },
      null,
    );

    expect(view.items.map((line) => line.description)).toEqual([
      'Standup pouch',
      'Printed roll',
      'Four side seal',
    ]);
  });

  /*
   * A line with nothing priced at the quoted quantity is still a line the
   * customer is agreeing to. Leaving it out would show them a shorter
   * quotation than the one they were sent.
   */
  it('keeps a job that has no figures at this quantity', () => {
    const view = toPublicQuotation(
      quotation({ items: [item(1, { quantities: [] as never })] }),
      { expiresAt: EXPIRES },
      null,
    );

    expect(view.items).toHaveLength(1);
    expect(view.items[0]?.totalAmount).toBe(0);
  });

  it('shows what is charged for cylinders, including nothing', () => {
    const view = toPublicQuotation(
      quotation({ items: [item(1, { totalCylinderCost: 0 })] }),
      { expiresAt: EXPIRES },
      null,
    );

    expect(view.items[0]?.cylinderCost).toBe(0);
  });

  /*
   * A customer who accepts and then reopens the link must see their own
   * acceptance rather than the buttons again — and the colleague they
   * forwarded it to must see that somebody has already answered.
   */
  it('shows an answer that has already been given', () => {
    const view = toPublicQuotation(
      quotation(),
      { expiresAt: EXPIRES },
      {
        decision: 'ACCEPTED',
        personName: 'Sunil Kale',
        personRole: 'Purchase',
        note: 'Please start the cylinders.',
        respondedAt: '2026-11-24T09:00:00.000Z',
      },
    );

    expect(view.response?.personName).toBe('Sunil Kale');
  });

  it('says when the link stops accepting an answer', () => {
    const view = toPublicQuotation(quotation(), { expiresAt: EXPIRES }, null);
    expect(view.expiresAt).toBe('2026-12-14T06:30:00.000Z');
  });
});
