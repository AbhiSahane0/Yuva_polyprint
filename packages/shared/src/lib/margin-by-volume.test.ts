import { describe, expect, it } from 'vitest';
import {
  defaultMarginFor,
  MARGIN_ABOVE_BREAK,
  MARGIN_BELOW_BREAK,
  MARGIN_VOLUME_BREAK_KG,
} from './margin-by-volume.js';

/**
 * **The boundary is the whole of this rule, and the client's own document
 * contradicted itself about it.**
 *
 * A table and a worked example said 500 kg takes the small-order margin; a
 * later line said it takes the large-order one. Five per cent of a 500 kg order
 * is not a rounding question, so the case is pinned here rather than left to
 * whoever reads the code next.
 */
describe('the margin a quantity is quoted at', () => {
  it('asks more of a small order', () => {
    for (const kg of [1, 100, 300, 499]) {
      expect(defaultMarginFor(kg), `${kg} kg`).toBe(MARGIN_BELOW_BREAK);
    }
  });

  it('includes 500 kg itself in the small-order band', () => {
    /* Their table reads "less than equal 500 kg" and their example says
       "500 kg → 15%". Confirmed against the line that said otherwise. */
    expect(defaultMarginFor(MARGIN_VOLUME_BREAK_KG)).toBe(15);
    expect(defaultMarginFor(500)).toBe(15);
  });

  it('drops the moment the order passes it', () => {
    for (const kg of [500.001, 501, 1000, 5000]) {
      expect(defaultMarginFor(kg), `${kg} kg`).toBe(MARGIN_ABOVE_BREAK);
    }
    expect(defaultMarginFor(1000)).toBe(10);
  });

  it('gives a line being typed the small-order figure, not nothing', () => {
    /* Starting low would walk the rate UP as the quantity is typed, which
       reads as the screen changing its mind about the price. */
    for (const nothing of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(defaultMarginFor(nothing)).toBe(MARGIN_BELOW_BREAK);
    }
  });
});
