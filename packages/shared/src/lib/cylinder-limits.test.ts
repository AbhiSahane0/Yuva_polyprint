import { describe, expect, it } from 'vitest';
import {
  CYLINDER_CIRCUMFERENCE,
  CYLINDER_FACE,
  MAX_CYLINDER_FACE_MM,
  cylinderWarnings,
} from './quotation-math.js';

/**
 * **What the engraver can cut, said on the screen rather than on the phone.**
 *
 * Both cylinder sizes are worked out from the design and the repeats, so a
 * cylinder the works cannot have engraved is something the office would
 * otherwise discover from the engraver — after the quotation went out, at a
 * price built on a cylinder that does not exist.
 *
 * The limits are the works' own: **450 to 1060 mm** across the face, **400 to
 * 600 mm** around. Both are warnings and neither blocks. An enquiry is allowed
 * to describe something the works cannot make — that is half of what an enquiry
 * is for — and the fix is two boxes above, the lanes and the repeats.
 *
 * Measured against the imported register on 2026-09-14, which is why this is
 * worth having:
 *
 *   46 of 395 jobs with a height (12%) have NO repeat 1..12 inside 400–600;
 *      43 of those sit between 301 and 399 mm, where one repeat is short of
 *      400 and two is already past 600
 *   29 of 411 implied faces are under 450 mm, and 1 is over 1060
 */
describe('cylinder limits', () => {
  const ok = { cylinderWidth: 780, cylinderCircumference: 460 };

  it('says nothing about a cylinder that can be cut', () => {
    expect(cylinderWarnings(ok)).toEqual([]);
  });

  it.each([
    ['a face under the minimum', { cylinderWidth: 280 }, 'width'],
    ['a face over the maximum', { cylinderWidth: 1200 }, 'width'],
    ['a circumference under the minimum', { cylinderCircumference: 350 }, 'circumference'],
    ['a circumference over the maximum', { cylinderCircumference: 700 }, 'circumference'],
  ])('warns about %s', (_label, override, field) => {
    const warnings = cylinderWarnings({ ...ok, ...override });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.field).toBe(field);
  });

  it('warns about both at once, each under its own box', () => {
    const warnings = cylinderWarnings({ cylinderWidth: 200, cylinderCircumference: 900 });
    expect(warnings.map((w) => w.field)).toEqual(['width', 'circumference']);
  });

  /*
   * The message has to name the box that fixes it. Neither size is typed — they
   * are worked out — so "450 to 1060" under a figure nobody can edit leaves the
   * office looking for the control.
   */
  it('names the figure and the box that changes it', () => {
    const [face] = cylinderWarnings({ ...ok, cylinderWidth: 1200 });
    expect(face?.message).toContain('1200');
    expect(face?.message).toContain('450');
    expect(face?.message).toContain('1060');
    expect(face?.message).toContain('lanes across');

    const [around] = cylinderWarnings({ ...ok, cylinderCircumference: 700 });
    expect(around?.message).toContain('700');
    expect(around?.message).toContain('repeats around');
  });

  /*
   * A line still being typed has no size yet. A form that complains before
   * anything has been entered is one people learn to click past, and by then it
   * is not warning about anything.
   */
  it('stays quiet on a line with no size yet', () => {
    expect(cylinderWarnings({ cylinderWidth: 0, cylinderCircumference: 0 })).toEqual([]);
  });

  /**
   * **`CYLINDER_FACE.MAX` and `MAX_CYLINDER_FACE_MM` are different numbers on
   * purpose**, and merging them would move the price of every job.
   *
   * 800 is what the works actually runs, and the lane suggestion is built on
   * it — `floor((800 − 80) ÷ width)` reproduces the lanes the works chose on
   * 82% of the imported jobs. 1060 is what the engraver can cut. Raising the
   * suggestion to 1060 would put more lanes across every web, which changes the
   * running metres, the machine minutes and therefore the rate.
   */
  it('keeps what the works runs apart from what the engraver can cut', () => {
    expect(MAX_CYLINDER_FACE_MM).toBeLessThan(CYLINDER_FACE.MAX);
    // So a suggested face is never itself a warning.
    expect(MAX_CYLINDER_FACE_MM).toBeGreaterThan(CYLINDER_FACE.MIN);
    expect(CYLINDER_CIRCUMFERENCE.PREFERRED).toBeGreaterThanOrEqual(CYLINDER_CIRCUMFERENCE.MIN);
    expect(CYLINDER_CIRCUMFERENCE.PREFERRED).toBeLessThanOrEqual(CYLINDER_CIRCUMFERENCE.MAX);
  });
});
