import { describe, expect, it } from 'vitest';
import {
  NO_POUCH_EXPENSE,
  pouchExpense,
  pouchMakingInForce,
  styleMakingPerPouch,
  type PouchMakingBands,
  type PouchMakingRates,
} from './pouch-making.js';

/**
 * **The works' per-style making rates, November 2026.**
 *
 * The works said the rate was wrong on four styles — standup zipper, zipper,
 * D punch and standup — and gave figures in paise per centimetre of the
 * pouch's mouth. Reading their own sheet back showed why: it charges a
 * standup zipper the ZIPPER FIGURE ALONE. There is no making charge anywhere
 * in its chain, while the app was charging the Rs 20/25/30 band on top of it.
 *
 * Their Royal Khajur sheet, which these tests reproduce, runs:
 *
 *     laminate per pouch   217.4592885 / 89   2.443363
 *     + zipper             17 cm x 3.6 paise  0.612
 *     = price per pouch                       3.055363
 *
 * Nothing else. That 0.612 is the whole pouching expense.
 */

const RATES: PouchMakingRates = {
  makingPerPouch: 0.25,
  dPunchPerPouch: 0.6,
  dPunchLargePerPouch: 0.8,
  dPunchLargeAboveMm: 450,
  /* The old single zipper rate. Still charged on a three side seal zipper. */
  zipperRatePerMetre: 3.6,
  /* The works' November figures, in Rs per metre of mouth. */
  zipperStyleRatePerMetre: 3.5,
  standupZipperRatePerMetre: 4.5,
  standupRatePerMetre: 30,
  spoutPerPouch: 2.7,
};

/** The October bands, which the five styles must now bypass entirely. */
const BANDS: PouchMakingBands = { plainPerKg: 20, gussetPerKg: 25, gussetHandlePerKg: 30 };

/** The Royal Khajur pouch: a 170 mm mouth, 89 to the kilogram. */
const MOUTH_MM = 170;
const PER_KG = 89;

describe('the works’ per-style rates', () => {
  it('charges a zipper pouch 3.5 paise a centimetre of mouth', () => {
    /* 17 cm x 3.5 paise = Rs 0.595. */
    expect(styleMakingPerPouch('ZIPPER', MOUTH_MM, RATES)).toBe(0.595);
  });

  it('charges a standup zipper 4.5', () => {
    expect(styleMakingPerPouch('STANDUP_ZIPPER', MOUTH_MM, RATES)).toBe(0.765);
  });

  /*
   * The one the works was asked about twice, because it is an order of
   * magnitude above the other two: Rs 5.10 of making against Rs 2.44 of
   * laminate on the same pouch. Confirmed, and pinned here so that a change
   * to it is a change somebody made on purpose.
   */
  it('charges a standup 30 paise a centimetre — Rs 5.10 on a 17 cm mouth', () => {
    expect(styleMakingPerPouch('STANDUP', MOUTH_MM, RATES)).toBe(5.1);
  });

  it('charges a standup without a zipper the same, it being the same work', () => {
    expect(styleMakingPerPouch('STANDUP_NO_ZIPPER', MOUTH_MM, RATES)).toBe(5.1);
  });

  /* A part bought in: the spout costs the same whatever mouth it goes into. */
  it('charges a spout flat, not by the centimetre', () => {
    expect(styleMakingPerPouch('SPOUT', MOUTH_MM, RATES)).toBe(2.7);
    expect(styleMakingPerPouch('SPOUT', 600, RATES)).toBe(2.7);
  });

  it('leaves the styles the works did not name to the bands', () => {
    for (const style of ['CENTRE_SEAL', 'THREE_SIDE_SEAL', 'FLAT_BOTTOM'] as const) {
      expect(styleMakingPerPouch(style, MOUTH_MM, RATES)).toBeNull();
    }
  });

  /*
   * Zero is not a rate of nothing, it is "the works has not set this".
   * The shipped defaults are all zero and the real figures live in the dated
   * history, so a rate of 0 has to fall back rather than charge nothing.
   */
  it('treats an unset rate as no rule rather than a free pouch', () => {
    const unset = { ...RATES, standupRatePerMetre: 0 };
    expect(styleMakingPerPouch('STANDUP', MOUTH_MM, unset)).toBeNull();
  });
});

describe('which model is in force', () => {
  it('ignores the per-style rates entirely under BANDS', () => {
    /* Every quotation written before November 2026 comes through here. */
    const expense = pouchExpense('STANDUP_ZIPPER', MOUTH_MM, RATES, false, 'BANDS');
    expect(expense.ownsMaking).toBe(false);
    /* 0.25 to make, plus 17 cm of zipper at the OLD 3.6 rate. */
    expect(expense.making).toBe(0.25);
    expect(expense.zipper).toBe(0.612);
    expect(expense.perPouch).toBe(0.862);
  });

  it('defaults to BANDS when no model is given', () => {
    const quiet = pouchExpense('STANDUP_ZIPPER', MOUTH_MM, RATES);
    const stated = pouchExpense('STANDUP_ZIPPER', MOUTH_MM, RATES, false, 'BANDS');
    expect(quiet).toEqual(stated);
  });

  it('makes the style figure the whole charge under PER_STYLE', () => {
    const expense = pouchExpense('STANDUP_ZIPPER', MOUTH_MM, RATES, false, 'PER_STYLE');
    expect(expense.ownsMaking).toBe(true);
    expect(expense.making).toBe(0.765);
    /* No zipper line of its own: the 4.5 IS the zipper and the making. */
    expect(expense.zipper).toBe(0);
    expect(expense.perPouch).toBe(0.765);
  });
});

describe('the band does not survive a style that owns its making', () => {
  /*
   * This is the over-charge the works was reporting. Under the bands a
   * standup zipper paid the Rs 25 gusset band AND the zipper on top; the
   * works' sheet charges the zipper alone.
   */
  it('drops the Rs 25 gusset band from a standup zipper', () => {
    const line = { isGazette: true, hasDPunch: false };

    const before = pouchMakingInForce(
      line,
      pouchExpense('STANDUP_ZIPPER', MOUTH_MM, RATES, false, 'BANDS'),
      BANDS,
      PER_KG,
    );
    const after = pouchMakingInForce(
      line,
      pouchExpense('STANDUP_ZIPPER', MOUTH_MM, RATES, false, 'PER_STYLE'),
      BANDS,
      PER_KG,
    );

    /* 25 + 0.612 x 89 = 79.468 a kilogram, of which 25 was never charged on
       the works' own sheet. */
    expect(before).toBe(79.468);
    /* 0.765 x 89, and nothing else. */
    expect(after).toBe(68.085);
  });

  it('charges a plain zipper pouch its own rate and no band', () => {
    const line = { isGazette: false, hasDPunch: false };
    const expense = pouchExpense('ZIPPER', MOUTH_MM, RATES, false, 'PER_STYLE');
    /* 0.595 x 89 = 52.955. The Rs 20 plain band does not appear. */
    expect(pouchMakingInForce(line, expense, BANDS, PER_KG)).toBe(52.955);
  });

  /*
   * **Why the D punch read wrong.** Its Rs 0.60 always replaced the making
   * rate, but `pouchMakingInForce` then reached for the band whenever one was
   * set — so a works with bands never charged 0.60 for a punch in its life.
   */
  it('finally charges the D punch its Rs 0.60 instead of the band', () => {
    const line = { isGazette: false, hasDPunch: true };

    const before = pouchMakingInForce(
      line,
      pouchExpense('THREE_SIDE_SEAL', MOUTH_MM, RATES, true, 'BANDS'),
      BANDS,
      PER_KG,
    );
    const after = pouchMakingInForce(
      line,
      pouchExpense('THREE_SIDE_SEAL', MOUTH_MM, RATES, true, 'PER_STYLE'),
      BANDS,
      PER_KG,
    );

    /* The gusset band, the 0.60 nowhere in it. */
    expect(before).toBe(25);
    /* 0.60 x 89. */
    expect(after).toBe(53.4);
  });

  it('steps a wide punch to Rs 0.80 under the new model too', () => {
    const expense = pouchExpense('THREE_SIDE_SEAL', 485, RATES, true, 'PER_STYLE');
    expect(expense.perPouch).toBe(0.8);
    expect(expense.ownsMaking).toBe(true);
  });

  /*
   * A standup with a punch keeps the STANDUP rate. The works priced the
   * style, and the punch rate is for the base styles the tick is used on.
   */
  it('lets the style beat the punch where the works priced the style', () => {
    const expense = pouchExpense('STANDUP', MOUTH_MM, RATES, true, 'PER_STYLE');
    expect(expense.perPouch).toBe(5.1);
  });
});

describe('what the works did not ask to change', () => {
  /*
   * The whole point of the dated model. These are the styles that price the
   * seven 2022 quotations this system reproduces to the paisa.
   */
  it('costs a centre seal exactly as it did, under either model', () => {
    const line = { isGazette: false, hasDPunch: false };
    for (const model of ['BANDS', 'PER_STYLE'] as const) {
      const expense = pouchExpense('CENTRE_SEAL', MOUTH_MM, RATES, false, model);
      expect(expense.ownsMaking).toBe(false);
      expect(pouchMakingInForce(line, expense, BANDS, PER_KG)).toBe(20);
    }
  });

  it('leaves a three side seal zipper on the old zipper rate', () => {
    /* Not one of the five. Still the band plus 3.6 a metre. */
    const expense = pouchExpense('THREE_SIDE_SEAL_ZIPPER', MOUTH_MM, RATES, false, 'PER_STYLE');
    expect(expense.ownsMaking).toBe(false);
    expect(expense.zipper).toBe(0.612);
    expect(pouchMakingInForce({ isGazette: false }, expense, BANDS, PER_KG)).toBe(74.468);
  });

  it('still charges a roll nothing', () => {
    expect(pouchExpense(null, MOUTH_MM, RATES, false, 'PER_STYLE')).toEqual(NO_POUCH_EXPENSE);
    expect(NO_POUCH_EXPENSE.ownsMaking).toBe(false);
  });

  /* A works that has not run the dated figures yet must price as before. */
  it('behaves as the bands do when the rates are all still zero', () => {
    const unset: PouchMakingRates = {
      ...RATES,
      zipperStyleRatePerMetre: 0,
      standupZipperRatePerMetre: 0,
      standupRatePerMetre: 0,
      spoutPerPouch: 0,
    };
    const line = { isGazette: true, hasDPunch: false };
    const expense = pouchExpense('STANDUP_ZIPPER', MOUTH_MM, unset, false, 'PER_STYLE');
    expect(pouchMakingInForce(line, expense, BANDS, PER_KG)).toBe(79.468);
  });
});

/**
 * The works' own Royal Khajur sheet, end to end.
 *
 * Reproduced at the rate the sheet was written on — Rs 3.60 a metre — rather
 * than at the new 3.50, because that is the figure the sheet's 0.612 carries.
 * It is here to pin the SHAPE of the chain: laminate per pouch, plus the
 * pouching expense, and nothing else.
 */
describe('the Royal Khajur sheet', () => {
  it('reproduces its price per pouch to the paisa', () => {
    const netCostPerKg = 217.4592885;
    const laminatePerPouch = netCostPerKg / PER_KG;

    const expense = pouchExpense(
      'ZIPPER',
      MOUTH_MM,
      { ...RATES, zipperStyleRatePerMetre: 3.6 },
      false,
      'PER_STYLE',
    );

    expect(expense.perPouch).toBe(0.612);
    expect(laminatePerPouch + expense.perPouch).toBeCloseTo(3.055362793, 6);
  });
});
