import { describe, expect, it } from 'vitest';
import { computeItemGeometry, structureGsm, workbookStructureGsm } from './quotation-math.js';
import { adhesiveGsmFor } from './rate-costing.js';
import { inkGsmFor, isWorkbookPouch, wastagePercentFor } from './pouch-making.js';

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

/**
 * **A D punch is costed on the pouch workbook, whatever it is punched into.**
 *
 * The client files it that way: "D Punch Pouch" is a sheet of that workbook,
 * beside Only Standup and Standup Zipper. It stopped being read that way when
 * the punch became a tick on a base style — a three side seal with a punch is
 * still a three side seal, so it fell back to the Estimation sheet and was
 * costed on the wrong document's ink, wastage and adhesive. The punch now
 * carries the line across.
 */
describe('a punched pouch', () => {
  const PUNCHED = { pouchType: 'THREE_SIDE_SEAL' as const, hasDPunch: true };
  const PLAIN = { pouchType: 'THREE_SIDE_SEAL' as const, hasDPunch: false };

  it('is read off the workbook although its style is not', () => {
    expect(isWorkbookPouch(PLAIN.pouchType)).toBe(false);
    expect(isWorkbookPouch(PUNCHED.pouchType, PUNCHED)).toBe(true);
  });

  it('takes the workbook’s wastage and ink with it', () => {
    const wastage = (line: typeof PLAIN) =>
      wastagePercentFor({ ...line, defaultWastagePercent: 8, pouchWastagePercent: 7 });
    expect(wastage(PLAIN)).toBe(8);
    expect(wastage(PUNCHED)).toBe(7);

    const ink = (line: typeof PLAIN) => inkGsmFor({ ...line, inkGsm: 1.8, pouchInkGsm: 1.2 });
    expect(ink(PLAIN)).toBe(1.8);
    expect(ink(PUNCHED)).toBe(1.2);
  });

  it('still reaches the workbook through the old style, for a line written before the tick', () => {
    expect(isWorkbookPouch('D_PUNCH')).toBe(true);
  });
});

/**
 * **The glue, and which of the two documents states it.**
 *
 * The Estimation sheet works a coat out per lamination and takes a heavier one
 * under a thick ply, so a three-ply reaches 6. Every block of the pouch
 * workbook writes a flat 2 whatever the structure, and the client has
 * confirmed that is what the works lays.
 *
 * Unlike the pouch WEIGHT basis, this is a physical quantity — so it is the
 * figure production draws the shelf down on as well as the one the quotation
 * is priced with, and these pin that it is one number, not two.
 */
describe('which adhesive a line carries', () => {
  const OPTS = { thinGsm: 2, thickGsm: 3, thickPlyMicron: 40, pouchAdhesiveGsm: 2 };
  const THREE_PLY = [{ micron: 12 }, { micron: 12 }, { micron: 75 }];

  it('works it out per lamination on the Estimation sheet', () => {
    // Two joins, and the 75µ ply is thick, so 3 a coat.
    expect(adhesiveGsmFor({ pouchType: 'CENTRE_SEAL', plies: THREE_PLY, ...OPTS })).toBe(6);
  });

  it('lays the workbook’s flat coat on a workbook style', () => {
    expect(adhesiveGsmFor({ pouchType: 'STANDUP', plies: THREE_PLY, ...OPTS })).toBe(2);
    expect(adhesiveGsmFor({ pouchType: 'STANDUP_ZIPPER', plies: THREE_PLY, ...OPTS })).toBe(2);
  });

  it('follows the punch across, like the wastage and the ink', () => {
    expect(
      adhesiveGsmFor({ pouchType: 'THREE_SIDE_SEAL', hasDPunch: true, plies: THREE_PLY, ...OPTS }),
    ).toBe(2);
  });

  it('charges nothing on a single ply, on either document', () => {
    // Nothing is stuck to anything, and the flat figure is the weight of a bond.
    expect(adhesiveGsmFor({ pouchType: 'STANDUP', plies: [{ micron: 12 }], ...OPTS })).toBe(0);
    expect(adhesiveGsmFor({ pouchType: 'CENTRE_SEAL', plies: [{ micron: 12 }], ...OPTS })).toBe(0);
  });
});
