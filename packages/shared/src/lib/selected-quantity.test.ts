import { describe, expect, it } from 'vitest';
import { resolveSelectedQuantity } from './quotation-math.js';

/**
 * Which quantity the customer is actually quoted.
 *
 * The office may price a job at two or three to see what volume does to the
 * margin; one reaches the printed page. This is clamped rather than validated
 * because the selection and the quantities are edited on the same screen and
 * saved together: a quotation cut from three quantities to one arrives still
 * pointing at the third, and rejecting that would make trimming a quotation an
 * error to clear rather than an edit.
 */
describe('resolveSelectedQuantity', () => {
  it('takes the quantity asked for when it exists', () => {
    expect(resolveSelectedQuantity(2, 3)).toBe(2);
    expect(resolveSelectedQuantity(3, 3)).toBe(3);
  });

  it('falls back to the first when the one chosen has been removed', () => {
    // Priced at three, ticked the third, then deleted two of them.
    expect(resolveSelectedQuantity(3, 1)).toBe(1);
    expect(resolveSelectedQuantity(3, 2)).toBe(2);
  });

  it('defaults to the first when nothing was chosen', () => {
    // Every quotation written before the choice existed.
    expect(resolveSelectedQuantity(null, 3)).toBe(1);
    expect(resolveSelectedQuantity(undefined, 2)).toBe(1);
  });

  it('never returns something that could index off the front', () => {
    for (const asked of [0, -1, Number.NaN, 0.5]) {
      expect(resolveSelectedQuantity(asked, 3)).toBe(1);
    }
  });

  it('still answers 1 when there are no quantities at all', () => {
    // A half-built line mid-edit. Returning 0 would index off the array.
    expect(resolveSelectedQuantity(2, 0)).toBe(1);
  });
});
