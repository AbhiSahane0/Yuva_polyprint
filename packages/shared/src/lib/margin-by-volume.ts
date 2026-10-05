/**
 * **The margin falls as the order grows.**
 *
 * A small order carries the same setup as a large one over a fraction of the
 * film, so the works asks more of it — fifteen per cent up to and including
 * 500 kg, ten above. This replaces the single works-wide figure, which was nine
 * per cent whatever the order.
 *
 * The boundary is inclusive on purpose: the client's own table reads "less than
 * equal 500 kg" and their worked example says 500 kg → 15%. A later line in the
 * same document said the opposite, and Abhi confirmed the table.
 *
 * It applies **per quantity**, not per quotation. A document priced at 250,
 * 500 and 1,000 kg carries 15%, 15% and 10% — one margin for the whole thing
 * would make at least one of its own tiers wrong.
 */
export const MARGIN_VOLUME_BREAK_KG = 500;
export const MARGIN_BELOW_BREAK = 15;
export const MARGIN_ABOVE_BREAK = 10;

/**
 * What this quantity is quoted at, before any override.
 *
 * A quantity of zero gets the small-order figure rather than nothing: a line
 * being typed has no quantity yet, and showing the cheaper margin until a
 * number arrives would walk the rate up as the office types, which reads as the
 * screen changing its mind.
 */
export function defaultMarginFor(quantityKg: number): number {
  if (!Number.isFinite(quantityKg) || quantityKg <= 0) return MARGIN_BELOW_BREAK;
  return quantityKg <= MARGIN_VOLUME_BREAK_KG ? MARGIN_BELOW_BREAK : MARGIN_ABOVE_BREAK;
}
