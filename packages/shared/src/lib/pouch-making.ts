import type { PouchType } from '../constants/job.js';
import { round } from './quotation-math.js';

/**
 * What it costs to turn printed laminate into pouches, **per pouch**.
 *
 * The works' own pouch workbook — four sheets, one per style, nine costed jobs
 * — charges this per piece and not per kilogram, and the difference is not
 * arithmetic tidiness. A small pouch packs 130 to a kilogram and a large one
 * 14, so one flat rate per kilogram reads as anything from Rs 11 to Rs 64 a
 * kilogram across those same nine jobs. The app charged a single Rs 15.
 *
 * Three figures, each with a plain meaning, rather than a rate per style:
 *
 * | | |
 * | --- | --- |
 * | `makingPerPouch` | forming, sealing and cutting — every pouch pays it |
 * | `zipperRatePerMetre` | the zipper, charged across the pouch's mouth |
 * | `dPunchPerPouch` | the punch, on top of making |
 *
 * A rate per style would have been four numbers that cannot be reasoned about
 * — nobody could say why a standup zipper costs what it does. These three
 * compose, and they reproduce the workbook where the workbook is consistent:
 * its standup pouches cost 0.25, which is `makingPerPouch`; its D punch costs
 * 0.60, which is 0.25 + 0.35.
 *
 * **The zipper is charged by the metre**, which is the workbook's own rule:
 * `(width in cm × 3.8) ÷ 100` is a 13 cm pouch paying Rs 0.494 for 0.13 m of
 * zipper at Rs 3.80 a metre. Written here in millimetres because that is what
 * the rest of the app measures a pouch in.
 *
 * **A zipper pouch pays making as well.** The workbook does not — its whole
 * pouch expense on a standup zipper is the zipper figure alone — but a zipper
 * pouch still has to be formed, sealed and cut, so the sheet under-charges it
 * by the making rate. Confirmed with the works before it was written this way.
 */
export interface PouchMakingRates {
  /** Forming, sealing and cutting. Every pouch pays it. */
  makingPerPouch: number;
  /** Rupees per metre of zipper, charged across the pouch's width. */
  zipperRatePerMetre: number;
  /** What the D punch adds, on top of making. */
  dPunchPerPouch: number;
}

/** The charge, in the parts it is made of, so a quotation can show its working. */
export interface PouchExpense {
  making: number;
  zipper: number;
  punch: number;
  /** Rupees on one pouch. */
  perPouch: number;
}

const NOTHING: PouchExpense = { making: 0, zipper: 0, punch: 0, perPouch: 0 };

/** The styles that carry a zipper across the mouth. */
export const ZIPPERED_POUCHES: readonly PouchType[] = ['STANDUP_ZIPPER', 'ZIPPER'];

/**
 * What one pouch of this style costs to make.
 *
 * A roll never reaches here — it is not made into anything — and neither does a
 * line whose style has not been chosen yet, because guessing one would put a
 * charge on a quotation nobody entered.
 *
 * The **finished pouch width** is what the zipper crosses, not the flat film
 * width: a standup's bottom gusset lengthens the film it is cut from without
 * widening the mouth the zipper is sewn into.
 */
export function pouchExpense(
  pouchType: PouchType | null | undefined,
  pouchWidthMm: number,
  rates: PouchMakingRates | null | undefined,
): PouchExpense {
  if (!pouchType || !rates) return NOTHING;

  /*
   * Every figure floored at zero and defaulted, because this is reached from a
   * request body as well as from the form. A negative rate would pay the
   * customer to have pouches made; a missing one would make the whole rate NaN,
   * which is worse than charging nothing — a quotation shows a price either
   * way, and only one of them is obviously wrong.
   */
  const at = (value: number | undefined) =>
    Number.isFinite(value) && (value as number) > 0 ? (value as number) : 0;

  const making = at(rates.makingPerPouch);

  const zipper = ZIPPERED_POUCHES.includes(pouchType)
    ? round((at(pouchWidthMm) / 1000) * at(rates.zipperRatePerMetre), 4)
    : 0;

  const punch = pouchType === 'D_PUNCH' ? at(rates.dPunchPerPouch) : 0;

  return { making, zipper, punch, perPouch: round(making + zipper + punch, 4) };
}
