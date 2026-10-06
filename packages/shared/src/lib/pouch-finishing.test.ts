import { describe, expect, it } from 'vitest';
import {
  POUCH_TYPES,
  POUCH_TYPES_OFFERED,
  POUCH_TYPES_RETIRED,
  POUCH_TYPE_LABELS,
} from '../constants/job.js';
import { pouchExpense, WORKBOOK_POUCHES, ZIPPERED_POUCHES } from './pouch-making.js';

/**
 * **A punched handle is finishing, not a style.**
 *
 * `D_PUNCH` used to be an entry in the style list, which asked the office to
 * choose between "D punch" and "Standup" for a pouch that is plainly both. It
 * is a tick on the line now — but the value stays in the enum, because eleven
 * quotations already chose a style and a document has to go on reading the way
 * it was sent.
 *
 * The two routes must cost the same pouch the same, or a quotation reopened
 * next year reprices itself.
 */
const RATES = {
  makingPerPouch: 0.25,
  dPunchPerPouch: 0.6,
  dPunchLargePerPouch: 0.8,
  dPunchLargeAboveMm: 450,
  zipperRatePerMetre: 3.6,
};

describe('the punch, reached either way', () => {
  it('costs the same ticked as it did chosen', () => {
    const ticked = pouchExpense('THREE_SIDE_SEAL', 190, RATES, true);
    const chosen = pouchExpense('D_PUNCH', 190, RATES, false);
    expect(ticked.making).toBe(chosen.making);
    expect(ticked.making).toBe(0.6);
  });

  it('charges the wide rate on a wide pouch, either way', () => {
    expect(pouchExpense('STANDUP', 485, RATES, true).making).toBe(0.8);
    expect(pouchExpense('D_PUNCH', 485, RATES, false).making).toBe(0.8);
  });

  it('replaces the making charge rather than adding to it', () => {
    /* The workbook's 0.60 is what a punched pouch costs to make, not a
       surcharge on top of one — so the plain rate is not also paid. */
    const punched = pouchExpense('CENTRE_SEAL', 190, RATES, true);
    expect(punched.making).toBe(0.6);
    expect(punched.making).not.toBe(0.25 + 0.6);
  });

  it('leaves an unticked pouch at the ordinary rate', () => {
    expect(pouchExpense('CENTRE_SEAL', 190, RATES, false).making).toBe(0.25);
  });

  it('adds the zipper on top of either, because that is a separate part', () => {
    const zipped = pouchExpense('STANDUP_ZIPPER', 200, RATES, true);
    expect(zipped.making).toBe(0.6);
    expect(zipped.zipper).toBeCloseTo(0.72, 4);
    expect(zipped.perPouch).toBeCloseTo(1.32, 4);
  });
});

describe('the style list the office is offered', () => {
  it('is the works own order, with nothing selected by default', () => {
    expect([...POUCH_TYPES_OFFERED]).toEqual([
      'THREE_SIDE_SEAL',
      'CENTRE_SEAL',
      'STANDUP_ZIPPER',
      'STANDUP',
      'THREE_SIDE_SEAL_ZIPPER',
      'STANDUP_NO_ZIPPER',
      'FLAT_BOTTOM',
    ]);
  });

  it('no longer offers the punch, the notch, or the three nobody picked', () => {
    expect([...POUCH_TYPES_RETIRED].sort()).toEqual(['D_PUNCH', 'OTHER', 'SPOUT', 'ZIPPER'].sort());
  });

  it('keeps every retired value readable, so old documents still open', () => {
    for (const style of POUCH_TYPES_RETIRED) {
      expect(POUCH_TYPES).toContain(style);
      expect(POUCH_TYPE_LABELS[style]).toBeTruthy();
    }
  });

  it('gives every offered style a label', () => {
    for (const style of POUCH_TYPES_OFFERED) expect(POUCH_TYPE_LABELS[style]).toBeTruthy();
  });

  /*
   * These two lists move the PRICE: the first decides whether a zipper is
   * charged, the second decides the ink laydown and the wastage. A new style
   * missing from both is costed as though it were neither zippered nor pouch
   * work, silently.
   */
  it('charges a zipper on the styles that have one, and only those', () => {
    expect(ZIPPERED_POUCHES).toContain('THREE_SIDE_SEAL_ZIPPER');
    expect(pouchExpense('THREE_SIDE_SEAL_ZIPPER', 200, RATES).zipper).toBeGreaterThan(0);
    /*
     * "Standup without zipper" was briefly called "standup WITH zipper" and sat
     * in this list, which charged every one of them for a zipper it does not
     * have. The name and the costing moved together.
     */
    expect(ZIPPERED_POUCHES).not.toContain('STANDUP_NO_ZIPPER');
    expect(pouchExpense('STANDUP_NO_ZIPPER', 200, RATES).zipper).toBe(0);
    expect(pouchExpense('FLAT_BOTTOM', 200, RATES).zipper).toBe(0);
  });

  it('puts the standup-family newcomers on the pouch workbook', () => {
    expect(WORKBOOK_POUCHES).toContain('STANDUP_NO_ZIPPER');
    expect(WORKBOOK_POUCHES).toContain('FLAT_BOTTOM');
    /* A three side seal with a zipper is still a three side seal, and the
       plain one is costed on the Estimation sheet. */
    expect(WORKBOOK_POUCHES).not.toContain('THREE_SIDE_SEAL_ZIPPER');
    expect(WORKBOOK_POUCHES).not.toContain('THREE_SIDE_SEAL');
  });
});
