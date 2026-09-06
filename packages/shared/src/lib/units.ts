import { round } from './quotation-math.js';

/**
 * The units a delivery can arrive in, and how they relate to the unit stock is
 * held in.
 *
 * A material is *stocked* in one unit — the one its rate is quoted in, because
 * value and costing both multiply a quantity by that rate. It may be *bought*
 * in another: film comes by the tonne, and typing 2,000 when the note says 2 is
 * a thousand-fold error nothing on the screen would question.
 *
 * **Only conversions within one family are offered.** Grams to kilograms is
 * arithmetic; litres to kilograms is a property of the substance, and the four
 * inks in the master have no density recorded. Offering it would mean guessing
 * at a figure that decides what the stock is worth.
 */

/** What a unit measures. Two units convert only if these match. */
export type UnitFamily = 'MASS' | 'VOLUME' | 'COUNT';

/**
 * How many of the family's base unit one of these is.
 *
 * Base is the kilogram and the litre — the units the works actually prices in —
 * so the common case converts by 1 and cannot drift.
 */
const UNITS: Record<string, { family: UnitFamily; inBase: number; label: string }> = {
  G: { family: 'MASS', inBase: 0.001, label: 'g' },
  KG: { family: 'MASS', inBase: 1, label: 'kg' },
  TON: { family: 'MASS', inBase: 1000, label: 'ton' },
  ML: { family: 'VOLUME', inBase: 0.001, label: 'ml' },
  L: { family: 'VOLUME', inBase: 1, label: 'L' },
  KL: { family: 'VOLUME', inBase: 1000, label: 'kL' },
};

/** Normalised, because the master holds 'KG' and a form may send 'kg'. */
function key(unit: string): string {
  return unit.trim().toUpperCase();
}

export function unitFamily(unit: string): UnitFamily | null {
  return UNITS[key(unit)]?.family ?? null;
}

/** How a unit is written on screen. Unknown units are shown as given. */
export function unitLabel(unit: string): string {
  return UNITS[key(unit)]?.label ?? unit;
}

/**
 * The units a delivery of this material may be entered in.
 *
 * Always includes the stock unit itself, first — that is what most deliveries
 * are in, and it is the one that needs no conversion. A material stocked in
 * something this does not recognise (pieces, say) can only be received in that,
 * which is correct: there is nothing to convert it to.
 */
export function purchaseUnitsFor(stockUnit: string): string[] {
  const family = unitFamily(stockUnit);
  if (!family) return [key(stockUnit)];

  const stocked = key(stockUnit);
  const siblings = Object.keys(UNITS).filter(
    (unit) => UNITS[unit]!.family === family && unit !== stocked,
  );
  return [stocked, ...siblings];
}

/**
 * A quantity moved from one unit to another, or null when it cannot be.
 *
 * Null rather than a guess whenever the families differ. A caller that quietly
 * treated litres as kilograms would put a wrong weight into stock and a wrong
 * figure into the inventory value, with nothing on any screen to contradict it.
 */
export function convertQuantity(value: number, from: string, to: string): number | null {
  if (!Number.isFinite(value)) return null;

  const source = UNITS[key(from)];
  const target = UNITS[key(to)];

  // Same unit, recognised or not. Nothing to do, and nothing that can go wrong.
  if (key(from) === key(to)) return round(value, 3);

  if (!source || !target || source.family !== target.family) return null;
  return round((value * source.inBase) / target.inBase, 3);
}

/**
 * A price moved from one unit to another.
 *
 * The inverse of a quantity: Rs. 205,000 per tonne is Rs. 205 per kilogram, not
 * Rs. 205,000,000. Getting this the wrong way round would overstate the stock
 * value by a factor of a million, which is exactly the sort of figure that gets
 * believed because it is too large to be a typo.
 */
export function convertRate(rate: number, from: string, to: string): number | null {
  if (!Number.isFinite(rate)) return null;
  if (key(from) === key(to)) return round(rate, 4);

  const source = UNITS[key(from)];
  const target = UNITS[key(to)];
  if (!source || !target || source.family !== target.family) return null;

  return round((rate * target.inBase) / source.inBase, 4);
}
