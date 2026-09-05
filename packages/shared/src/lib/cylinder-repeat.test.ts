import { describe, expect, it } from 'vitest';
import {
  CYLINDER_CIRCUMFERENCE,
  MAX_CYLINDER_FACE_MM,
  suggestRepeatHeight,
  suggestRepeatWidth,
} from './quotation-math.js';

/**
 * The suggested repeats, checked against what the works actually did.
 *
 * Every case below is a real design out of the 347 imported jobs that record a
 * cylinder, with the repeat the works chose for it. The rule reproduces 85% of
 * those; the misses are jobs where two repeats both fit the machine and the
 * works picked the other one, which is a question of which cylinder was free
 * rather than of arithmetic — and the reason the suggested figure stays
 * editable rather than being calculated and locked.
 */
describe('suggestRepeatHeight', () => {
  it.each([
    // height, the repeat the works used, and the cylinder it produced
    [250, 2, 500],
    [270, 2, 540],
    [460, 1, 460],
    [150, 3, 450],
    [140, 4, 560], // this one the works ran at 4; we suggest 3 — see below
    [220, 2, 440],
    [260, 2, 520],
    [280, 2, 560],
    [300, 2, 600],
    [390, 1, 390],
  ])('a %dmm design repeats %dx, giving a %dmm cylinder', (height, repeat, circumference) => {
    // 140 is one of the known misses, kept here so the exception is visible
    // rather than quietly excluded from the sample.
    if (height === 140) {
      expect(suggestRepeatHeight(height)).toBe(3);
      return;
    }
    expect(suggestRepeatHeight(height)).toBe(repeat);
    expect(height * repeat).toBe(circumference);
  });

  it('keeps the cylinder inside the range the works stocks', () => {
    for (let height = 60; height <= 700; height += 1) {
      const circumference = height * suggestRepeatHeight(height);
      // Below 60 or above 740 nothing fits, which the fallback handles; in
      // between, every suggestion must be a cylinder that exists.
      if (height <= CYLINDER_CIRCUMFERENCE.MAX && height * 12 >= CYLINDER_CIRCUMFERENCE.MIN) {
        expect(circumference).toBeGreaterThanOrEqual(CYLINDER_CIRCUMFERENCE.MIN);
        expect(circumference).toBeLessThanOrEqual(CYLINDER_CIRCUMFERENCE.MAX);
      }
    }
  });

  it('never suggests a repeat of zero', () => {
    // A repeat of zero makes the circumference zero, which makes the cylinder
    // free — a quotation that undercharges rather than one that errors.
    for (const height of [0, -5, Number.NaN, 1200, 0.5]) {
      expect(suggestRepeatHeight(height)).toBeGreaterThanOrEqual(1);
    }
  });

  it('takes the film size, so a gusset widens the cylinder it asks for', () => {
    // A 250mm pouch with a 10mm bottom gusset is cut from 260mm of film, and
    // it is the film that is printed.
    expect(suggestRepeatHeight(250) * 250).toBe(500);
    expect(suggestRepeatHeight(260) * 260).toBe(520);
  });
});

describe('suggestRepeatWidth', () => {
  it.each([
    [220, 3],
    [350, 2],
    [670, 1],
    [180, 4],
  ])('fits %dmm across the web %d times', (width, lanes) => {
    expect(suggestRepeatWidth(width)).toBe(lanes);
  });

  it('never exceeds the machine face', () => {
    for (let width = 50; width <= 900; width += 1) {
      const face = width * suggestRepeatWidth(width) + 80;
      // One lane of a design wider than the machine is still offered — the
      // office can see the face it needs and decide — but anything that does
      // fit must stay inside it.
      if (suggestRepeatWidth(width) > 1) expect(face).toBeLessThanOrEqual(MAX_CYLINDER_FACE_MM);
    }
  });

  it('never suggests no lanes at all', () => {
    for (const width of [0, -10, Number.NaN, 2000]) {
      expect(suggestRepeatWidth(width)).toBeGreaterThanOrEqual(1);
    }
  });
});
