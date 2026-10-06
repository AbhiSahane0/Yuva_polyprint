import { describe, expect, it } from 'vitest';
import { computeItemGeometry, structureGsm, workbookStructureGsm } from './quotation-math.js';

/**
 * **The works weighs a pouch two different ways, and both are kept.**
 *
 * Its Estimation sheet sums each ply's own GSM, which is the physical weight
 * and what the seven 2022 quotations reproduce to the paisa. Its pouch
 * workbook takes a flat average of the row densities — every film ply, then
 * INKS and ADHESIVE at density 1 — and multiplies by the total micron.
 *
 * The second is arithmetically wrong: a flat mean of 1.4, 1.4, 0.92, 1, 1
 * over-weights the thick low-density poly, so the same structure comes out
 * about ten per cent heavy and therefore about ten per cent dearer a pouch.
 * The works has quoted that way for years and asked for it kept. These pin
 * both, and pin that they stay apart.
 */

/** Shamali Tea 250g, from the works' Standup Zipper sheet. */
const SHAMALI = [
  { micron: 12, density: 1.4 },
  { micron: 12, density: 1.4 },
  { micron: 75, density: 0.92 },
];
const COATS = { inkGsm: 1.2, adhesiveGsm: 2 };

describe('workbookStructureGsm', () => {
  it('reads the sheet’s own average density and total micron', () => {
    // (1.4 + 1.4 + 0.92 + 1 + 1) / 5 = 1.144, over 12 + 12 + 75 + 1.2 + 2 = 102.2.
    expect(workbookStructureGsm(SHAMALI, COATS)).toBeCloseTo(1.144 * 102.2, 3);
  });

  it('is about a tenth heavier than the structure really is', () => {
    const real = structureGsm(SHAMALI, COATS);
    const sheet = workbookStructureGsm(SHAMALI, COATS);
    expect(real).toBeCloseTo(105.8, 3);
    expect(sheet / real).toBeGreaterThan(1.09);
    expect(sheet / real).toBeLessThan(1.12);
  });

  it('leaves out a ply the structure does not have', () => {
    // A row at zero microns is not a row on the sheet, so it must not drag the
    // average down — the two-ply reading has to be the two-ply reading.
    expect(workbookStructureGsm([...SHAMALI, { micron: 0, density: 1.4 }], COATS)).toBeCloseTo(
      workbookStructureGsm(SHAMALI, COATS),
      6,
    );
  });

  it('gives nothing when a ply has no density, like the real one', () => {
    expect(workbookStructureGsm([{ micron: 12, density: null }], COATS)).toBe(0);
  });
});

describe('what a pouch weighs', () => {
  const geometry = (workbookGsm: number) =>
    computeItemGeometry(
      {
        layerCount: 3,
        micron: 102.2,
        gsm: structureGsm(SHAMALI, COATS),
        workbookGsm,
        widthMm: 130,
        heightMm: 510,
        makesPouches: true,
        repeatWidth: 1,
        repeatHeight: 1,
        cylinderCount: 0,
      } as never,
      2.5,
    );

  it('counts a workbook pouch exactly as the sheet does', () => {
    /*
     * 130 to the kilogram on the works' own sheet, and the ROUNDUP is theirs
     * too: the arithmetic lands on 129.01 and the sheet quotes 130.
     */
    expect(geometry(workbookStructureGsm(SHAMALI, COATS)).pouchesPerKg).toBe(130);
  });

  it('counts everything else on the real weight, to the paisa', () => {
    // No workbook basis, so the physical GSM and no rounding — this is the
    // path the seven 2022 quotations are costed on.
    expect(geometry(0).pouchesPerKg).toBeCloseTo(142.56, 2);
  });

  it('keeps the two apart', () => {
    // The whole risk of carrying two: substituted for one another, production
    // would reserve film against a weight nobody is buying.
    expect(geometry(workbookStructureGsm(SHAMALI, COATS)).pouchesPerKg).toBeLessThan(
      geometry(0).pouchesPerKg,
    );
  });
});
