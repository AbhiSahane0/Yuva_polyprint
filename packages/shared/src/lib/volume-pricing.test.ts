import { describe, expect, it } from 'vitest';
import {
  NO_VOLUME_PRICING,
  volumeAdjustmentLabel,
  volumeAdjustmentPerKg,
  type VolumePricing,
} from './volume-pricing.js';

/**
 * The works' own two bands: a premium under the minimum order, a rupee off at
 * four tons. Before these, 1,000 kg and 5,000 kg were quoted the same.
 */
const WORKS: VolumePricing = {
  moqKg: 500,
  belowMoqPerKg: 3,
  bulkBreakKg: 4000,
  bulkDiscountPerKg: 1,
};

describe('the quantity adjustment', () => {
  it('charges a premium under the minimum order', () => {
    expect(volumeAdjustmentPerKg(250, WORKS)).toBe(3);
    expect(volumeAdjustmentPerKg(499.99, WORKS)).toBe(3);
  });

  /* The minimum is the smallest order the works takes at the plain rate, so an
     order OF the minimum is not under it. */
  it('does not charge it at exactly the minimum', () => {
    expect(volumeAdjustmentPerKg(500, WORKS)).toBe(0);
  });

  it('leaves everything between the two bands alone', () => {
    expect(volumeAdjustmentPerKg(1000, WORKS)).toBe(0);
    expect(volumeAdjustmentPerKg(3999, WORKS)).toBe(0);
  });

  it('discounts at the bulk break and above', () => {
    expect(volumeAdjustmentPerKg(4000, WORKS)).toBe(-1);
    expect(volumeAdjustmentPerKg(5000, WORKS)).toBe(-1);
  });

  /* The complaint this exists for: the two quantities now differ by a rupee a
     kilogram, where the margin band alone gave them the same figure. */
  it('separates 1,000 kg from 5,000 kg', () => {
    expect(volumeAdjustmentPerKg(1000, WORKS)).not.toBe(volumeAdjustmentPerKg(5000, WORKS));
  });

  it('carries nothing on a line with no quantity yet', () => {
    expect(volumeAdjustmentPerKg(0, WORKS)).toBe(0);
    expect(volumeAdjustmentPerKg(Number.NaN, WORKS)).toBe(0);
  });

  it('is off until the works sets a figure', () => {
    expect(volumeAdjustmentPerKg(10, NO_VOLUME_PRICING)).toBe(0);
    expect(volumeAdjustmentPerKg(99_999, NO_VOLUME_PRICING)).toBe(0);
  });

  /* A works that has not set its minimum order still gets the bulk discount. */
  it('runs one band without the other', () => {
    const bulkOnly = { ...WORKS, moqKg: 0 };
    expect(volumeAdjustmentPerKg(100, bulkOnly)).toBe(0);
    expect(volumeAdjustmentPerKg(4000, bulkOnly)).toBe(-1);
  });

  /*
   * Mis-keyed figures. A minimum above the bulk break makes both bands true at
   * once; it must quote high rather than net the two off, because a rate that
   * came out too low goes out of the door and one that came out too high gets
   * queried.
   */
  it('takes the premium and stops when the two bands overlap', () => {
    const wrong = { ...WORKS, moqKg: 9000 };
    expect(volumeAdjustmentPerKg(5000, wrong)).toBe(3);
  });

  it('says which band a quantity fell in', () => {
    expect(volumeAdjustmentLabel(250, WORKS)).toBe('Below the 500 kg minimum');
    expect(volumeAdjustmentLabel(5000, WORKS)).toBe('4000 kg and over');
    expect(volumeAdjustmentLabel(1000, WORKS)).toBeNull();
  });
});
