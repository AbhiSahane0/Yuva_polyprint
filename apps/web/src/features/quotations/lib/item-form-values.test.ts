import { describe, expect, it } from 'vitest';
import { quotationItemSchema, type Quotation } from '@yuva/shared';
import { itemFormValues } from './item-form-values';

/**
 * **Opening a draft must not quietly edit it.**
 *
 * A field left out of the copy is not a blank box on the screen — it is an
 * edit the office did not make. The form opens without the field, they save
 * something unrelated, and the save writes the form's idea of the line back
 * over the document.
 *
 * The reported case: a quotation written in CMYK reopened with no colours
 * chosen at all. The structure asks for a white base, so the one effect that
 * still ran added a single white special — and the line read "1 colour, so 1
 * cylinder and 1 station" on a document sold with four colours, four cylinders
 * and four stations. Saving made it true.
 */

/** A line with every field set to something recognisable. */
const STORED = {
  id: 'qi1',
  jobId: 'job1',
  jobName: 'Royal Khajur 250g',
  jobKind: 'POUCH',
  pouchType: 'ZIPPER',
  pouchTypeNote: null,
  pricingBasis: 'PER_KG',
  widthMm: 170,
  heightMm: 600,
  isGazette: true,
  gazetteBottom: 40,
  gazetteLeft: 30,
  gazetteRight: 30,
  hasDPunch: true,
  hasVNotch: true,
  layers: [{ materialId: 'm1', micron: 12, rateOverride: 185 }],
  colours: [
    {
      id: 'c1',
      position: 0,
      name: 'Cyan',
      kind: 'PROCESS',
      materialId: 'i1',
      laydownGsm: 1.8,
      solidsPercent: 40,
      ratePerKg: 450,
    },
    {
      id: 'c2',
      position: 1,
      name: 'Magenta',
      kind: 'PROCESS',
      materialId: 'i2',
      laydownGsm: 1.8,
      solidsPercent: 40,
      ratePerKg: 450,
    },
    {
      id: 'c3',
      position: 2,
      name: 'Yellow',
      kind: 'PROCESS',
      materialId: 'i3',
      laydownGsm: 1.8,
      solidsPercent: 40,
      ratePerKg: 450,
    },
    {
      id: 'c4',
      position: 3,
      name: 'Black',
      kind: 'PROCESS',
      materialId: 'i4',
      laydownGsm: 1.8,
      solidsPercent: 40,
      ratePerKg: 450,
    },
    {
      id: 'c5',
      position: 4,
      name: 'White',
      kind: 'SPECIAL',
      materialId: null,
      laydownGsm: 1.8,
      solidsPercent: 40,
      ratePerKg: 235,
    },
  ],
  quantities: [{ quantityKg: 250, ratePerKg: 239, quantityPouches: 22250, ratePerPouch: 3.74 }],
  repeatWidth: 350,
  repeatHeight: 600,
  cylinderCount: 5,
  transportCost: 0,
  chargeCylinders: true,
  repairCylinders: false,
  repairs: [],
  cylinderManufacturer: null,
  cylinderDesign: null,
} as unknown as Quotation['items'][number];

describe('a saved line coming back into the form', () => {
  /*
   * **The test that stops this happening a fourth time.**
   *
   * Read over by eye, a copy of twenty-seven fields looks complete whichever
   * twenty-four it has. So it is checked against the schema instead: anything
   * the form accepts must be carried back, and a field added next year fails
   * here on the day it is added rather than on the day a quotation is wrong.
   */
  it('carries back every field the form accepts', () => {
    /* Asked of the schema itself rather than of a list kept by hand, and
       through `parse` rather than zod's internals, so the check survives the
       next zod upgrade as readily as the next field. */
    const accepted = quotationItemSchema.parse({
      id: 'qi1',
      jobId: 'job1',
      jobName: 'Royal Khajur 250g',
      jobKind: 'POUCH',
      pouchType: 'ZIPPER',
      pricingBasis: 'PER_KG',
      widthMm: 170,
      heightMm: 600,
      isGazette: true,
      gazetteBottom: 40,
      gazetteLeft: 30,
      gazetteRight: 30,
      hasDPunch: true,
      hasVNotch: true,
      layers: [
        { materialId: 'm1', micron: 12 },
        { materialId: 'm2', micron: 70 },
      ],
      colours: [
        {
          name: 'Cyan',
          kind: 'PROCESS',
          materialId: 'i1',
          laydownGsm: 1.8,
          solidsPercent: 40,
          ratePerKg: 450,
        },
      ],
      quantities: [{ quantityKg: 250, ratePerKg: 239 }],
      cylinderCount: 5,
      repeatWidth: 350,
      repeatHeight: 600,
    });

    const copied = Object.keys(itemFormValues(STORED));
    const missing = Object.keys(accepted).filter((field) => !copied.includes(field));

    expect(missing, `dropped on reopening: ${missing.join(', ')}`).toEqual([]);
  });

  /* The reported bug, named. */
  it('brings the colours back, in the order they were stored', () => {
    const colours = itemFormValues(STORED).colours;
    expect(colours).toHaveLength(5);
    expect(colours.map((colour) => colour.name)).toEqual([
      'Cyan',
      'Magenta',
      'Yellow',
      'Black',
      'White',
    ]);
  });

  it('prices each colour as it was sold, not as the list reads today', () => {
    const [cyan] = itemFormValues(STORED).colours;
    expect(cyan).toMatchObject({ kind: 'PROCESS', materialId: 'i1', ratePerKg: 450 });
    /* The special carries no ink and the dearest rate. */
    expect(itemFormValues(STORED).colours[4]).toMatchObject({
      kind: 'SPECIAL',
      materialId: null,
      ratePerKg: 235,
    });
  });

  /* Position and id belong to the row, not to the form. */
  it('leaves the stored row’s own keys behind', () => {
    for (const colour of itemFormValues(STORED).colours) {
      expect(colour).not.toHaveProperty('id');
      expect(colour).not.toHaveProperty('position');
    }
  });

  /*
   * The punch decides the making rate, the wastage and the ink laydown. It
   * went the same way the colours did, and cost more.
   */
  it('brings both finishing ticks back', () => {
    const copied = itemFormValues(STORED);
    expect(copied.hasDPunch).toBe(true);
    expect(copied.hasVNotch).toBe(true);
  });

  it('keeps the basis it was sold on rather than re-deriving it', () => {
    /* A ZIPPER line sold by the kilogram stays by the kilogram. */
    expect(itemFormValues(STORED).pricingBasis).toBe('PER_KG');
  });

  it('survives a line with nothing on it', () => {
    const bare = {
      ...STORED,
      colours: [],
      layers: [],
      quantities: [],
      repairs: [],
      hasDPunch: false,
      hasVNotch: false,
    } as unknown as Quotation['items'][number];

    const copied = itemFormValues(bare);
    expect(copied.colours).toEqual([]);
    expect(copied.hasDPunch).toBe(false);
  });
});
