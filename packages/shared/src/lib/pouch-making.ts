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
 * Three figures, all read off that workbook:
 *
 * | | |
 * | --- | --- |
 * | `makingPerPouch` | forming, sealing and cutting one — Rs 0.25 |
 * | `dPunchPerPouch` | what a D punch costs to make instead — Rs 0.60 flat |
 * | `zipperRatePerMetre` | the zipper, across the mouth — Rs 3.60 a metre |
 *
 * **A D punch is not making plus a punch.** It is its own flat charge, which is
 * how the workbook states it and how the works confirmed it. Modelling it as
 * 0.25 + 0.35 would have been a decomposition nobody uses, and it would have
 * invited somebody to raise the making rate one day and silently move the D
 * punch with it.
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
  /** Forming, sealing and cutting one. What every style but a D punch pays. */
  makingPerPouch: number;
  /** What a D punch costs to make — a flat charge, not an addition. */
  dPunchPerPouch: number;
  /** Rupees per metre of zipper, charged across the pouch's width. */
  zipperRatePerMetre: number;
}

/** The charge, in the parts it is made of, so a quotation can show its working. */
export interface PouchExpense {
  /** Making one of this style. */
  making: number;
  /** The zipper across its mouth, where it has one. */
  zipper: number;
  /** Rupees on one pouch. */
  perPouch: number;
}

export const NO_POUCH_EXPENSE: PouchExpense = { making: 0, zipper: 0, perPouch: 0 };

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
  if (!pouchType || !rates) return NO_POUCH_EXPENSE;

  /*
   * Every figure floored at zero and defaulted, because this is reached from a
   * request body as well as from the form. A negative rate would pay the
   * customer to have pouches made; a missing one would make the whole rate NaN,
   * which is worse than charging nothing — a quotation shows a price either
   * way, and only one of them is obviously wrong.
   */
  const at = (value: number | undefined) =>
    Number.isFinite(value) && (value as number) > 0 ? (value as number) : 0;

  /* A D punch is made differently, so it is made at its own rate. */
  const making = pouchType === 'D_PUNCH' ? at(rates.dPunchPerPouch) : at(rates.makingPerPouch);

  const zipper = ZIPPERED_POUCHES.includes(pouchType)
    ? round((at(pouchWidthMm) / 1000) * at(rates.zipperRatePerMetre), 4)
    : 0;

  return { making, zipper, perPouch: round(making + zipper, 4) };
}

/**
 * Which wastage figure this line is costed at.
 *
 * **The works has two, from two of its own documents.** Its Estimation sheet
 * carries 8% and everything is costed on that; its pouch workbook, which costs
 * the standup, zipper and D punch work, carries 7%. One number could hold only
 * one of them.
 *
 * Written as a function with a test rather than inline where it is used,
 * because of what it moves. Wastage inflates the film bought, and film is about
 * four-fifths of a rate — so one percentage point is roughly Rs 2 a kilogram on
 * every quotation in the system, arriving silently.
 *
 * **The quotation's own figure beats both**, which is how the seven 2022
 * quotations rebuilt from the Estimation sheet hold 8% while being pouches. A
 * rule keyed on "is it a pouch" alone would have moved all seven off the sheets
 * they reproduce to the paisa.
 */
export function wastagePercentFor(input: {
  /** False on a roll, which is costed on the Estimation sheet's figure. */
  makesPouches: boolean;
  /** What this quotation sets for itself, or null to follow the works. */
  override?: number | null;
  defaultWastagePercent: number;
  pouchWastagePercent: number;
}): number {
  if (input.override !== null && input.override !== undefined && Number.isFinite(input.override)) {
    return input.override;
  }
  return input.makesPouches ? input.pouchWastagePercent : input.defaultWastagePercent;
}
