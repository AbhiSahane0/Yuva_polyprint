/**
 * **What the quantity adds to, or takes off, a kilogram.**
 *
 * The works prices a small order up and a large one down, and until this
 * existed neither reached the rate. The margin falls once, at 500 kg — see
 * `margin-by-volume` — and above that a 1,000 kg order and a 5,000 kg one were
 * quoted at the same percentage. They are not the same job: the small one ties
 * the press up for a morning to make a morning's film, and the large one is
 * what the works would rather be running.
 *
 * Two adjustments, both the works' own:
 *
 * - **Below the minimum order**, a premium. The order still has to be set up,
 *   and under a certain weight the works would rather be paid for the trouble.
 * - **At or above the bulk break**, a discount. Four tons is the figure the
 *   works quoted, at a rupee a kilogram off.
 *
 * Both are per kilogram and both are figures on the Costing screen, so they are
 * dated like every other rate: a quotation written last month goes on reading
 * what was in force when it was written.
 *
 * Zero switches either off, which is how a works that has not set its minimum
 * order yet carries the bulk discount and nothing else.
 */

export interface VolumePricing {
  /** Below this many kilograms the order carries a premium. 0 is off. */
  moqKg: number;
  /** Rupees a kilogram added below the minimum. */
  belowMoqPerKg: number;
  /** At or above this many kilograms the order earns a discount. 0 is off. */
  bulkBreakKg: number;
  /** Rupees a kilogram taken off at or above the break. */
  bulkDiscountPerKg: number;
}

export const NO_VOLUME_PRICING: VolumePricing = {
  moqKg: 0,
  belowMoqPerKg: 0,
  bulkBreakKg: 0,
  bulkDiscountPerKg: 0,
};

/**
 * The adjustment this quantity carries. Positive adds, negative takes off.
 *
 * **The premium is tested first and wins outright.** The two bands cannot both
 * apply to an honest pair of figures — a minimum order above the bulk break is
 * a works quoting a premium and a discount for the same weight — but a mis-keyed
 * pair must not silently produce the sum of the two. Taking the premium and
 * stopping is the safe way round: it quotes high, which somebody notices, where
 * quoting low goes out of the door.
 *
 * A quantity of zero carries nothing. A line being typed has no quantity yet,
 * and charging a small-order premium against a blank box would walk the rate up
 * while somebody was still filling it in.
 */
export function volumeAdjustmentPerKg(quantityKg: number, pricing: VolumePricing): number {
  if (!Number.isFinite(quantityKg) || quantityKg <= 0) return 0;

  const { moqKg, belowMoqPerKg, bulkBreakKg, bulkDiscountPerKg } = pricing;

  if (moqKg > 0 && quantityKg < moqKg && Number.isFinite(belowMoqPerKg)) {
    return belowMoqPerKg;
  }
  if (bulkBreakKg > 0 && quantityKg >= bulkBreakKg && Number.isFinite(bulkDiscountPerKg)) {
    return -bulkDiscountPerKg;
  }
  return 0;
}

/** How the quotation says which band a quantity fell in, or nothing. */
export function volumeAdjustmentLabel(quantityKg: number, pricing: VolumePricing): string | null {
  const adjustment = volumeAdjustmentPerKg(quantityKg, pricing);
  if (adjustment === 0) return null;
  return adjustment > 0
    ? `Below the ${pricing.moqKg} kg minimum`
    : `${pricing.bulkBreakKg} kg and over`;
}
