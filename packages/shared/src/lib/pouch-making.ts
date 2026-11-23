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
  /** And what a wide one costs, the punch being made across the top. */
  dPunchLargePerPouch: number;
  /**
   * The width, in millimetres, at which a D punch becomes the larger job.
   *
   * The works' figure is 450. Above it the punch is a different operation, not
   * a bigger one — which is why this steps rather than scaling with the width.
   */
  dPunchLargeAboveMm: number;
  /** Rupees per metre of zipper, charged across the pouch's width. */
  zipperRatePerMetre: number;

  /* ---- the works' per-style figures, November 2026 ----------------------
   *
   * Given as paise per centimetre of the pouch's MOUTH, and held here per
   * metre because that is the unit the zipper above already uses and mixing
   * two would be a bug waiting to happen: 3.5 paise/cm is Rs 3.50 a metre.
   *
   * Each is the WHOLE making charge for its style, not an addition to the
   * per-kilogram bands. That is the works' own sheet: a standup zipper's
   * entire pouching expense on it is the zipper figure alone, with no making
   * charge anywhere in the chain. See `POUCH_MAKING_MODELS`.
   */

  /** A zipper pouch, per metre of mouth. The works' figure is Rs 3.50. */
  zipperStyleRatePerMetre: number;
  /** A standup zipper, per metre of mouth. Rs 4.50. */
  standupZipperRatePerMetre: number;
  /**
   * A standup, per metre of mouth. Rs 30.00.
   *
   * An order of magnitude above the two zipper rates, and deliberately so:
   * the works gave 30 paise a centimetre where the zipper styles are 3.5 and
   * 4.5. On a 170 mm pouch it is Rs 5.10 of making against Rs 2.44 of
   * laminate. Confirmed before it was written, and the Costing screen shows
   * what it comes to per kilogram so a slip is visible rather than quiet.
   */
  standupRatePerMetre: number;
  /**
   * A spout pouch, per POUCH.
   *
   * Flat rather than per centimetre, because a spout and cap is a part bought
   * in: it costs the same whatever the mouth it is welded into.
   */
  spoutPerPouch: number;
}

/** The charge, in the parts it is made of, so a quotation can show its working. */
export interface PouchExpense {
  /** Making one of this style. */
  making: number;
  /** The zipper across its mouth, where it has one. */
  zipper: number;
  /** Rupees on one pouch. */
  perPouch: number;
  /**
   * Whether this figure is the whole making charge for the style.
   *
   * True and the per-kilogram bands do not apply at all; false and the band
   * is charged with the zipper on top, which is how everything was costed
   * before November 2026. It is carried on the expense rather than worked out
   * again by the caller because two readings of one rule cannot be kept in
   * step by care — the same reason `pouchMakingInForce` exists.
   */
  ownsMaking: boolean;
}

export const NO_POUCH_EXPENSE: PouchExpense = {
  making: 0,
  zipper: 0,
  perPouch: 0,
  ownsMaking: false,
};

/**
 * **How making is charged.**
 *
 * `BANDS` is how everything was costed from October 2026: a per-kilogram band
 * — plain, gusset, gusset with handle — with the zipper by the metre on top.
 *
 * `PER_STYLE` is the works' own sheet, and is what they asked for in November
 * 2026. Five styles carry their own figure, and that figure is the WHOLE
 * making charge: the band is not applied at all. Everything else — centre
 * seal, three side seal, flat bottom — goes on being costed by the band.
 *
 * **It is a dated switch rather than a rewrite** for the usual reason: a
 * quotation written in October asks what the works held then, finds `BANDS`,
 * and reprices exactly as it was sold. Nothing already sent moves.
 */
export const POUCH_MAKING_MODELS = ['BANDS', 'PER_STYLE'] as const;
export type PouchMakingModel = (typeof POUCH_MAKING_MODELS)[number];

/**
 * Floors a rate at zero and survives a missing one.
 *
 * This is reached from a request body as well as from the form. A negative
 * rate would pay the customer to have pouches made; a missing one would make
 * the whole rate NaN, which is worse than charging nothing — a quotation
 * shows a price either way, and only one of them is obviously wrong.
 */
const at = (value: number | undefined): number =>
  Number.isFinite(value) && (value as number) > 0 ? (value as number) : 0;

/**
 * **What one pouch of this style costs to make, where the style has its own
 * figure** — and `null` where it does not, which sends the line back to the
 * per-kilogram bands.
 *
 * Four of the five are the works' November 2026 rates. The zipper styles and
 * the standup are quoted per centimetre of the pouch's MOUTH, which is what
 * the rest of this file calls the finished width: a standup's bottom gusset
 * lengthens the film it is cut from without widening the mouth. The spout is
 * flat per pouch, being a part bought in.
 *
 * A rate left at 0 returns `null` rather than 0. That is the difference
 * between "the works has not set this yet" and "the works charges nothing",
 * and it is what lets the real figures live in the dated history while the
 * shipped default stays at zero.
 */
export function styleMakingPerPouch(
  pouchType: PouchType | null | undefined,
  pouchWidthMm: number,
  rates: PouchMakingRates | null | undefined,
): number | null {
  if (!pouchType || !rates) return null;

  const perMouthMetre = (ratePerMetre: number): number | null => {
    const rate = at(ratePerMetre);
    if (rate <= 0) return null;
    return round((at(pouchWidthMm) / 1000) * rate, 4);
  };

  switch (pouchType) {
    case 'ZIPPER':
      return perMouthMetre(rates.zipperStyleRatePerMetre);
    case 'STANDUP_ZIPPER':
      return perMouthMetre(rates.standupZipperRatePerMetre);
    /*
     * Both names for the same work. "Standup" and "Standup without zipper" sit
     * in the dropdown together — the second arrived in October 2026 to say
     * plainly what the first already meant — and the works gave one rate for
     * "only standup". Charging them differently would price the same pouch two
     * ways depending on which row the office happened to pick.
     */
    case 'STANDUP':
    case 'STANDUP_NO_ZIPPER':
      return perMouthMetre(rates.standupRatePerMetre);
    case 'SPOUT': {
      const rate = at(rates.spoutPerPouch);
      return rate > 0 ? round(rate, 4) : null;
    }
    default:
      return null;
  }
}

/** The styles that carry a zipper across the mouth. */
export const ZIPPERED_POUCHES: readonly PouchType[] = [
  'STANDUP_ZIPPER',
  'ZIPPER',
  'THREE_SIDE_SEAL_ZIPPER',
];

/**
 * The styles the works' pouch workbook costs.
 *
 * **This is what "a pouch job" means**, and it is narrower than "not a roll".
 * The works has two costing documents and they split by style, not by whether
 * something is technically a pouch:
 *
 * | | covers | wastage | ink GSM |
 * | --- | --- | ---: | ---: |
 * | Estimation sheet | centre seal, three side seal, spout | 8% | 1.8 |
 * | Pouch workbook | the four below | 7% | 1.2 |
 *
 * Getting this wrong is not a rounding error. Every one of the seven 2022
 * quotations verified to the paisa is a CENTRE SEAL pouch — so a rule reading
 * "any pouch" would have moved all seven onto the pouch workbook's figures,
 * which were never used to price them.
 */
export const WORKBOOK_POUCHES: readonly PouchType[] = [
  'STANDUP',
  'STANDUP_ZIPPER',
  'ZIPPER',
  'D_PUNCH',
  /*
   * The three added in October 2026 follow their base style, because that is
   * the machine that makes them: a standup with a zipper and a flat bottom are
   * both standup work, and a three side seal with a zipper is still a three
   * side seal, costed on the Estimation sheet like the plain one.
   *
   * **This decides the ink laydown and the wastage, so it moves the price.**
   * It is a reading of the works' two documents, not something either of them
   * states, and it is the one thing here worth putting to the works directly.
   */
  'STANDUP_NO_ZIPPER',
  'FLAT_BOTTOM',
];

/**
 * Whether this line is costed on the pouch workbook rather than the Estimation
 * sheet.
 *
 * **A D punch pulls the line onto the workbook whatever its base style**, and
 * that is the client's own filing: "D Punch Pouch" is a sheet of that workbook
 * in their own file, sitting beside Only Standup and Standup Zipper. It stopped
 * being read that way when the punch became a tick on a base style — a three
 * side seal with a punch is still a three side seal, so it fell back to the
 * Estimation sheet and was costed on the wrong document's ink, wastage and
 * weight. The old `D_PUNCH` style is still in the list below, so a line written
 * either way lands on the same sheet.
 */
export function isWorkbookPouch(
  pouchType: PouchType | null | undefined,
  line?: { hasDPunch?: boolean | null },
): boolean {
  if (line?.hasDPunch === true) return true;
  return pouchType !== null && pouchType !== undefined && WORKBOOK_POUCHES.includes(pouchType);
}

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
  /** Ticked on the line. A punched handle is extra work, not another style. */
  hasDPunch = false,
  /**
   * Which way making is charged, as at this quotation's date.
   *
   * Defaults to the bands so that every caller written before November 2026 —
   * and every document priced before it — behaves exactly as it did.
   */
  model: PouchMakingModel = 'BANDS',
): PouchExpense {
  if (!pouchType || !rates) return NO_POUCH_EXPENSE;

  /*
   * **The style's own figure, where the works has given one.**
   *
   * First, and it ends the matter: under this model the figure IS the making
   * charge, so there is no band to reach and no zipper to add. A zipper pouch
   * charged 3.5 paise a centimetre is charged that and nothing else, which is
   * what the works' own sheet does — its whole pouching expense on a standup
   * zipper is the zipper line, with no making charge anywhere in the chain.
   */
  if (model === 'PER_STYLE') {
    const styled = styleMakingPerPouch(pouchType, pouchWidthMm, rates);
    if (styled !== null) {
      return { making: styled, zipper: 0, perPouch: styled, ownsMaking: true };
    }
  }

  /*
   * A D punch is made differently, so it is made at its own rate — and a wide
   * one at a dearer rate again, the punch being made across the top. The
   * workbook shows both: 0.60 on a 190 mm pouch and 0.80 on a 485 mm one.
   */
  /*
   * The punch REPLACES the ordinary making charge rather than adding to it,
   * which is how the workbook's 0.60 and 0.80 are written: they are what a
   * punched pouch costs to make, not a surcharge on top of one.
   *
   * Reached two ways now. `D_PUNCH` as a style is the old way and is no longer
   * offered; the tick is the new one. Both land here so a quotation written
   * last year and one written today cost the same pouch the same.
   */
  const punched = hasDPunch || pouchType === 'D_PUNCH';
  const making = punched
    ? at(pouchWidthMm) > at(rates.dPunchLargeAboveMm) && at(rates.dPunchLargePerPouch) > 0
      ? at(rates.dPunchLargePerPouch)
      : at(rates.dPunchPerPouch)
    : at(rates.makingPerPouch);

  /*
   * **A punched pouch pays the punch and nothing else.**
   *
   * The rate above already REPLACES ordinary making — Rs 0.60 is what a
   * punched pouch costs to make, not a surcharge on one — but under the bands
   * it was then thrown away: `pouchMakingInForce` reached for the gusset band
   * whenever one was set, so a works with bands never charged 0.60 for a punch
   * in its life. That is why the D punch read wrong, and it is fixed by the
   * punch owning its making the way the five styles above do.
   *
   * Only the styles with no figure of their own get here. A standup with a
   * punch keeps the standup rate, because the works priced the style.
   */
  if (model === 'PER_STYLE' && punched) {
    return { making, zipper: 0, perPouch: making, ownsMaking: true };
  }

  const zipper = ZIPPERED_POUCHES.includes(pouchType)
    ? round((at(pouchWidthMm) / 1000) * at(rates.zipperRatePerMetre), 4)
    : 0;

  return { making, zipper, perPouch: round(making + zipper, 4), ownsMaking: false };
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
  /** The style. Anything outside the pouch workbook is on the Estimation sheet. */
  pouchType: PouchType | null | undefined;
  /** Ticked on the line. A punched pouch is costed on the workbook. */
  hasDPunch?: boolean | null;
  /** What this quotation sets for itself, or null to follow the works. */
  override?: number | null;
  defaultWastagePercent: number;
  pouchWastagePercent: number;
}): number {
  if (input.override !== null && input.override !== undefined && Number.isFinite(input.override)) {
    return input.override;
  }
  return isWorkbookPouch(input.pouchType, input)
    ? input.pouchWastagePercent
    : input.defaultWastagePercent;
}

/**
 * How much ink the laminate is weighed with, g/m².
 *
 * The same split, and it matters twice over: the ink GSM decides what a pouch
 * WEIGHS, so it moves the count per kilogram and therefore the price each, as
 * well as what the ink costs. The Estimation sheet holds 1.8 and the pouch
 * workbook 1.2 — on a 105 GSM laminate that is a little over half a per cent of
 * the weight, which is half a per cent on every per-pouch price.
 */
export function inkGsmFor(input: {
  pouchType: PouchType | null | undefined;
  hasDPunch?: boolean | null;
  inkGsm: number;
  pouchInkGsm: number;
}): number {
  return isWorkbookPouch(input.pouchType, input) ? input.pouchInkGsm : input.inkGsm;
}

/**
 * **What making a kilogram of pouches costs.**
 *
 * The works priced this per POUCH until October 2026 — Rs 0.25 to form, seal
 * and cut one — and then gave three figures by the kilogram instead:
 *
 * | | |
 * | --- | --- |
 * | plain pouch | Rs 20 a kg |
 * | gusset | Rs 25 a kg |
 * | gusset with handle | Rs 30 a kg |
 *
 * "Gusset" and "gusset with handle" are the two ticks on the line, not styles:
 * a gazette pouch gussets at the sides and base, and the handle is the D punch.
 * So the band is read off what the line says it is rather than off the style
 * list, which is why a centre seal and a three side seal share the first band
 * exactly as the client wrote them.
 *
 * **Two cases the client did not state**, both decided here and both worth
 * putting back to them:
 *
 * - A **punch with no gusset**. Taken as the middle band: it is one operation
 *   more than a plain pouch and one less than a gusseted one.
 * - A **standup**, which gussets at the base by definition but is not ticked as
 *   a gazette unless the office ticks it. Read off the tick, not the style, so
 *   an unticked standup is charged as plain. Ticking the gusset is what the
 *   office already does when the depths matter to the weight.
 *
 * The zipper is unchanged and still charged by the metre on top: the client's
 * three figures say nothing about it, and a zipper is a part bought in rather
 * than an operation.
 */
export interface PouchMakingBands {
  plainPerKg: number;
  gussetPerKg: number;
  gussetHandlePerKg: number;
}

export function pouchMakingPerKgFor(
  line: { isGazette?: boolean; hasDPunch?: boolean },
  bands: PouchMakingBands | null | undefined,
): number {
  if (!bands) return 0;
  const at = (value: number) => (Number.isFinite(value) && value > 0 ? value : 0);

  if (line.isGazette && line.hasDPunch) return at(bands.gussetHandlePerKg);
  if (line.isGazette || line.hasDPunch) return at(bands.gussetPerKg);
  return at(bands.plainPerKg);
}

/**
 * **What a kilogram of these pouches is charged at when nobody has overridden
 * it** — band where the works has set one, per-pouch rate where it has not,
 * and the zipper by the metre on top either way.
 *
 * This is the rule `costRate` applies, lifted out of it so that it has exactly
 * one definition. The quotation form needs the same answer: its costing
 * section fills the override box in with "the works' own figure", and an
 * override is an override — if the figure it writes is not to the paisa what
 * the line was already costed at, then merely opening that section moves the
 * cost, the suggested rate follows, and a saved quotation reprices itself
 * because somebody looked at it. It did exactly that, with a second copy of
 * this rule that still read the per-pouch rate after the bands arrived.
 *
 * Two readings of the same thing cannot be kept in step by care. One can.
 */
export function pouchMakingInForce(
  line: { isGazette?: boolean; hasDPunch?: boolean },
  expense: PouchExpense,
  bands: PouchMakingBands | null | undefined,
  piecesPerKg: number,
): number {
  /*
   * A style that owns its making is the whole answer. Reaching for a band here
   * would charge the works' Rs 20/25/30 on top of a figure that already covers
   * forming, sealing and cutting — which is exactly the over-charge the
   * November 2026 rates were given to remove.
   */
  if (expense.ownsMaking) return round(expense.perPouch * piecesPerKg, 4);

  const banded = pouchMakingPerKgFor(line, bands);
  return banded > 0
    ? round(banded + expense.zipper * piecesPerKg, 4)
    : round(expense.perPouch * piecesPerKg, 4);
}
