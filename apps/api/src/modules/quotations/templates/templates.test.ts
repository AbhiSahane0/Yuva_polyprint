import { describe, expect, it } from 'vitest';
import type { Quotation, QuotationItem } from '@yuva/shared';
import { renderFolio } from './folio.js';
import { renderDossier } from './dossier.js';
import { renderStatement } from './statement.js';
import { filmName, phone, styleOf, termLines } from './shared.js';

const line = (over: Partial<QuotationItem> = {}): QuotationItem =>
  ({
    id: 'i1',
    position: 1,
    jobId: null,
    jobName: 'Green Peas 1 kg',
    jobKind: 'POUCH',
    pouchType: 'STANDUP_ZIPPER',
    pouchTypeNote: '',
    pricingBasis: 'PER_KG',
    widthMm: 600,
    heightMm: 440,
    filmWidthMm: 600,
    filmHeightMm: 440,
    isGazette: false,
    gazetteBottom: 0,
    gazetteLeft: 0,
    gazetteRight: 0,
    micron: 64,
    pouchesPerKg: 55.22,
    compositeGsm: 0,
    materialCostPerKg: null,
    repeatWidth: 1,
    repeatHeight: 1,
    cylinderCount: 7,
    cylinderWidth: 780,
    cylinderCircumference: 600,
    costPerCylinder: 7480,
    totalCylinderCost: 52_360,
    transportCost: 0,
    chargeCylinders: true,
    layers: [
      { position: 1, materialName: 'PET 12µm', micron: 12 },
      { position: 2, materialName: 'W/O Poly 110µm', micron: 50 },
    ],
    colours: [],
    quantities: [
      {
        position: 1,
        quantityKg: 1000,
        ratePerKg: 284.2,
        quantityPouches: 0,
        ratePerPouch: 0,
        totalPouches: 55_220,
        totalAmount: 284_200,
        costPerPouch: 5.15,
      },
    ],
    ...over,
  }) as unknown as QuotationItem;

const document = (over: Partial<Quotation> = {}): Quotation =>
  ({
    id: 'q',
    number: 143,
    date: '2026-03-23',
    status: 'DRAFT',
    customerName: 'Prince Green Peas',
    addressLine1: 'Sangamner',
    addressLine2: '',
    addressLine3: '',
    mobile: '9999999999',
    gstNumber: 'NA',
    gstPercent: 18,
    materialAdvancePercent: 70,
    cylinderAdvancePercent: 100,
    selectedQuantity: 1,
    tiers: [
      {
        id: 't1',
        position: 1,
        materialSubtotal: 284_200,
        materialWithGst: 335_356,
        cylinderSubtotal: 52_360,
        cylinderWithGst: 61_785,
        grandSubtotal: 336_560,
        grandWithGst: 397_141,
        materialAdvance: 234_749,
        cylinderAdvance: 61_785,
        totalAdvance: 296_534,
        totalQuantityKg: 1000,
        totalPouches: 55_220,
      },
    ],
    terms: [],
    items: [line()],
    ...over,
  }) as unknown as Quotation;

const TEMPLATES = [
  ['Folio', renderFolio],
  ['Dossier', renderDossier],
  ['Statement', renderStatement],
] as const;

/**
 * **Nothing on a quotation is set large.**
 *
 * The works asked for this in as many words — "avoid showing big size text or
 * number" — and it is not a matter of taste. A price set at 30pt is a poster,
 * and a customer who opens a poster reads it as a pitch; the same figure at
 * 12pt under a rule reads as a statement of account. The whole family therefore
 * lives between 6.6pt and 12.4pt, and emphasis is carried by weight, colour and
 * the rule above a figure.
 *
 * A ceiling is the kind of decision that erodes one template at a time — a
 * total nudged up for a customer meeting, a heading enlarged to fill a gap —
 * and nobody notices until the three documents no longer look related. So it is
 * asserted rather than written down: any font-size in any template, in points
 * or in millimetres, has to be at or under the top of the scale.
 */
describe('the type ceiling', () => {
  const CEILING_PT = 12.4;

  for (const [name, render] of TEMPLATES) {
    it(`${name} sets nothing above ${CEILING_PT}pt`, () => {
      const html = render(document());
      /* Only the stylesheet, so a base64 data URI cannot match by chance. */
      const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));

      const oversized = [...css.matchAll(/font-size:\s*([\d.]+)(pt|mm)/g)]
        .map((match) => ({
          declaration: match[0],
          pt: match[2] === 'mm' ? Number(match[1]) * 2.8346 : Number(match[1]),
        }))
        .filter((found) => found.pt > CEILING_PT);

      expect(oversized.map((found) => found.declaration)).toEqual([]);
    });

    /* The scale is shared, so a template must not quietly re-invent it. */
    it(`${name} takes its sizes from the scale`, () => {
      const html = render(document());
      expect(html).toContain('--t-lead: 12.4pt');
    });
  }
});

describe('every template', () => {
  for (const [name, render] of TEMPLATES) {
    it(`${name} carries the figures the customer checks`, () => {
      const html = render(document());
      expect(html).toContain('Prince Green Peas');
      expect(html).toContain('284.20'); // the rate per kg
      expect(html).toContain('3,97,141'); // the total payable
      expect(html).toContain('55,220'); // the pouches they receive
      expect(html).toContain('PET 12µ + W/O Poly 50µ');
    });

    /*
     * A roll has nothing to count, so a per-piece rate on one is an invented
     * unit — and a "0 pouches" line is worse than no line at all.
     */
    it(`${name} prints no pouch figures on a roll`, () => {
      const html = render(
        document({
          items: [
            line({
              jobKind: 'ROLL',
              pouchType: null,
              pouchesPerKg: 0,
              quantities: [
                {
                  position: 1,
                  quantityKg: 1000,
                  ratePerKg: 284.2,
                  quantityPouches: 0,
                  ratePerPouch: 0,
                  totalPouches: 0,
                  totalAmount: 284_200,
                  costPerPouch: 0,
                },
              ],
            } as Partial<QuotationItem>),
          ],
        }),
      );
      const body = html.slice(html.indexOf('</style>'));
      expect(body).not.toContain('pouches');
      expect(body).not.toContain('a pouch');
    });
  }
});

/**
 * The gauge in a film's catalogue name is not the gauge of the ply.
 *
 * "W/O Poly 110µm" is what the works buys the film as; the quotation says the
 * job uses 50µ of it. Printing both told the customer their 50 micron poly was
 * 110 — a specification error on a document they may hold the works to.
 */
describe('the structure line', () => {
  it('drops the catalogue gauge and keeps the ply’s', () => {
    expect(filmName('W/O Poly 110µm')).toBe('W/O Poly');
    expect(filmName('PET 12 micron')).toBe('PET');
    expect(filmName('BOPP')).toBe('BOPP');
  });
});

describe('a mobile number', () => {
  it('is spaced the way a person writes one', () => {
    expect(phone('9999999999')).toBe('+91 99999 99999');
    expect(phone('919822012345')).toBe('+91 98220 12345');
  });

  /* Anything that is not a plain mobile is the office's own text, left alone. */
  it('leaves anything else exactly as typed', () => {
    expect(phone('02425 226699')).toBe('02425 226699');
    expect(phone('9822012345 / 9876543210')).toBe('9822012345 / 9876543210');
    expect(phone('9822012345 ext 4')).toBe('9822012345 ext 4');
    expect(phone('NA')).toBe('');
    expect(phone(null)).toBe('');
  });
});

describe('what a line is', () => {
  it('names the pouch style', () => {
    expect(styleOf(line())).toBe('Standup zipper pouch');
    expect(styleOf(line({ pouchType: 'D_PUNCH' }))).toBe('D punch pouch');
    expect(styleOf(line({ pouchType: 'SPOUT' }))).toBe('Spout pouch');
  });

  it('uses the note the office typed on an odd one', () => {
    expect(styleOf(line({ pouchType: 'OTHER', pouchTypeNote: 'Flat bottom box pouch' }))).toBe(
      'Flat bottom box pouch',
    );
  });

  it('calls a reel a reel', () => {
    expect(styleOf(line({ jobKind: 'ROLL', pouchType: null }))).toBe('Printed roll');
  });
});

/**
 * The cylinder rule appears once, whoever says it.
 *
 * The works' standing terms already carry a cylinder sentence. The document
 * carries its own because the rule is the thing customers query and it deserves
 * plain words — but printing both puts two versions of one rule three lines
 * apart, and a customer reading carefully starts hunting for the difference.
 */
describe('the terms', () => {
  it('keeps the office’s own cylinder sentence over the written-in one', () => {
    const lines = termLines(
      document({ terms: ['Cylinder charges are one-time and reusable for repeat orders.'] }),
      true,
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('one-time and reusable');
  });

  it('adds the written-in one when no term mentions cylinders', () => {
    const lines = termLines(document({ terms: ['Quotation valid for 15 days.'] }), true);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('Cylinders are charged once');
  });

  /*
   * The other direction never yields. No standing term says the cylinders are
   * already paid for, and a customer who is not told assumes they are being
   * charged again.
   */
  it('always says so when nothing is charged for cylinders', () => {
    const lines = termLines(
      document({ terms: ['Cylinder charges are one-time and reusable for repeat orders.'] }),
      false,
    );
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('No cylinder charge');
  });
});
