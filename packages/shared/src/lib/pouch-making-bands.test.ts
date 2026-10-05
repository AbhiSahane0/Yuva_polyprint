import { describe, expect, it } from 'vitest';
import { pouchMakingPerKgFor } from './pouch-making.js';

/**
 * **The works stopped pricing pouch making by the pouch and started pricing it
 * by the kilogram**, in three bands the client wrote out: plain Rs 20, gusset
 * Rs 25, gusset with handle Rs 30.
 *
 * The band is read off the TICKS on the line — gazette, and D punch — rather
 * than off the style list, because "gusset" and "handle" are what those ticks
 * mean. A centre seal and a three side seal are both plain pouches and share
 * the first band, which is how the client wrote them.
 */
const BANDS = { plainPerKg: 20, gussetPerKg: 25, gussetHandlePerKg: 30 };

describe('what making a kilogram of pouches costs', () => {
  it('charges the plain band for a pouch with neither', () => {
    expect(pouchMakingPerKgFor({}, BANDS)).toBe(20);
    expect(pouchMakingPerKgFor({ isGazette: false, hasDPunch: false }, BANDS)).toBe(20);
  });

  it('charges the gusset band for a gazette pouch', () => {
    expect(pouchMakingPerKgFor({ isGazette: true }, BANDS)).toBe(25);
  });

  it('charges the top band only for a gusset AND a handle', () => {
    expect(pouchMakingPerKgFor({ isGazette: true, hasDPunch: true }, BANDS)).toBe(30);
  });

  it('puts a punch with no gusset in the middle band', () => {
    /* Not stated by the client. One operation more than a plain pouch and one
       less than a gusseted one — worth putting back to them. */
    expect(pouchMakingPerKgFor({ hasDPunch: true }, BANDS)).toBe(25);
  });

  it('charges nothing when the works has set no figures', () => {
    /* A missing band must not become NaN, which would take the whole rate with
       it — a quotation shows a price either way and only one is obviously wrong. */
    expect(pouchMakingPerKgFor({ isGazette: true }, null)).toBe(0);
    expect(pouchMakingPerKgFor({}, { plainPerKg: 0, gussetPerKg: 0, gussetHandlePerKg: 0 })).toBe(
      0,
    );
  });

  it('refuses a negative figure rather than paying the customer to have them made', () => {
    expect(
      pouchMakingPerKgFor({}, { plainPerKg: -20, gussetPerKg: 25, gussetHandlePerKg: 30 }),
    ).toBe(0);
  });
});
