import { describe, expect, it } from 'vitest';
import { adhesiveRequirements, inkRequirements } from './consumable-requirements.js';

/* The works' own thinning and their four process inks. */
const THINNING = {
  inkParts: 100,
  solventParts: 80,
  ethylAcetatePercent: 50,
  ethylAcetateMaterialId: 'ethyl',
  ethylAcetateName: 'Solvent — Ethyl Acetate',
  tolueneMaterialId: 'tol',
  tolueneName: 'Solvent — Toluene',
};

const cmyk = [
  { materialId: 'cyan', name: 'Cyan', laydownGsm: 0.14, solidsPercent: 23 },
  { materialId: 'mag', name: 'Magenta', laydownGsm: 0.13, solidsPercent: 23 },
  { materialId: 'yel', name: 'Yellow', laydownGsm: 0.13, solidsPercent: 23 },
  { materialId: 'blk', name: 'Black', laydownGsm: 0.15, solidsPercent: 23 },
];

describe('the ink a run takes off the shelf', () => {
  /* 200 kg of printed PET at 16.8 gsm is 11,904.76 square metres. */
  const run = { printedLayerKg: 200, printedLayerGsm: 16.8 };

  it('claims the WET weight, not what stays on the film', () => {
    /*
     * The laydown is what is left once it has dried. The tin is bought wet, and
     * claiming the dry figure would under-claim every job by the solids —
     * four times over on an ink at 23%.
     */
    const out = inkRequirements({ ...run, ...THINNING, colours: [cmyk[0]!] });
    const cyan = out.find((line) => line.materialId === 'cyan')!;
    const area = (200 * 1000) / 16.8;
    const dry = (area * 0.14) / 1000;
    expect(cyan.quantity).toBeCloseTo((dry * 100) / 23, 2);
    expect(cyan.quantity).toBeGreaterThan(dry * 4);
  });

  it('claims each colour against its own drum', () => {
    const out = inkRequirements({ ...run, ...THINNING, colours: cmyk });
    expect(out.filter((l) => ['cyan', 'mag', 'yel', 'blk'].includes(l.materialId)).length).toBe(4);
  });

  it('claims the solvent the ink is let down with, split between the two', () => {
    const out = inkRequirements({ ...run, ...THINNING, colours: cmyk });
    const ethyl = out.find((l) => l.materialId === 'ethyl')!;
    const toluene = out.find((l) => l.materialId === 'tol')!;
    /* 80 parts solvent to 100 of ink, then half and half. */
    const wet = out
      .filter((l) => !['ethyl', 'tol'].includes(l.materialId))
      .reduce((sum, l) => sum + l.quantity, 0);
    expect(ethyl.quantity + toluene.quantity).toBeCloseTo(wet * (80 / 180), 1);
    expect(ethyl.quantity).toBeCloseTo(toluene.quantity, 2);
  });

  it('counts a special’s solvent but holds no drum for it', () => {
    /*
     * A special nobody has chosen the ink for still gets mixed — the works
     * thins SOMETHING — but there is no drum to claim. Its solvent counts and
     * its pigment does not, which is the honest half of what is known.
     */
    const special = {
      materialId: null,
      name: 'Special colour',
      laydownGsm: 0.2,
      solidsPercent: 23,
    };
    const withSpecial = inkRequirements({ ...run, ...THINNING, colours: [...cmyk, special] });
    const withoutSpecial = inkRequirements({ ...run, ...THINNING, colours: cmyk });

    expect(withSpecial.some((l) => l.name === 'Special colour')).toBe(false);
    const ethylWith = withSpecial.find((l) => l.materialId === 'ethyl')!.quantity;
    const ethylWithout = withoutSpecial.find((l) => l.materialId === 'ethyl')!.quantity;
    expect(ethylWith).toBeGreaterThan(ethylWithout);
  });

  it('claims a special against its drum once the works has chosen one', () => {
    // By job-card time the spot ink is known, even if the quotation guessed.
    const chosen = {
      materialId: 'orange',
      name: 'Mango Orange',
      laydownGsm: 0.2,
      solidsPercent: 23,
    };
    const out = inkRequirements({ ...run, ...THINNING, colours: [...cmyk, chosen] });
    expect(out.find((l) => l.materialId === 'orange')!.quantity).toBeGreaterThan(0);
  });

  it('asks for nothing when the job prints nothing', () => {
    expect(inkRequirements({ ...run, ...THINNING, colours: [] })).toEqual([]);
    expect(inkRequirements({ ...run, ...THINNING, printedLayerKg: 0, colours: cmyk })).toEqual([]);
  });

  it('never asks for a reel width — ink does not come on one', () => {
    const out = inkRequirements({ ...run, ...THINNING, colours: cmyk });
    for (const line of out) expect(line.needsWidthMm).toBe(0);
  });
});

describe('the adhesive a run takes off the shelf', () => {
  const batch = {
    adhesiveGsm: 3,
    substrateGsm: 63.8,
    consumedKg: 1070,
    splitRatio: '100:146:15',
    adhesiveMaterialId: 'pu',
    adhesiveName: 'Adhesive — PU',
    ethylAcetateMaterialId: 'ethyl',
    ethylAcetateName: 'Solvent — Ethyl Acetate',
    hardenerMaterialId: 'hard',
    hardenerName: 'Adhesive — Hardener',
  };

  it('leaves the store as three drums, not one', () => {
    /*
     * Adhesive is mixed, not poured. 100 parts adhesive to 146 of ethyl acetate
     * to 15 of hardener — a claim on "the adhesive" alone would miss more than
     * half of what actually goes.
     */
    const out = adhesiveRequirements(batch);
    expect(out.map((l) => l.materialId).sort()).toEqual(['ethyl', 'hard', 'pu']);
  });

  it('splits on the works’ own ratio', () => {
    const out = adhesiveRequirements(batch);
    const by = (id: string) => out.find((l) => l.materialId === id)!.quantity;
    expect(by('ethyl') / by('pu')).toBeCloseTo(146 / 100, 3);
    expect(by('hard') / by('pu')).toBeCloseTo(15 / 100, 3);
  });

  it('spreads it over the films, not over the whole laminate', () => {
    /*
     * It goes between the plies — not over itself and not over the ink. Using
     * the laminate's weight would under-claim it on every job.
     */
    const overSubstrate = adhesiveRequirements(batch);
    const overLaminate = adhesiveRequirements({ ...batch, substrateGsm: 68.6 });
    expect(overSubstrate[0]!.quantity).toBeGreaterThan(overLaminate[0]!.quantity);
  });

  it('asks for nothing on a job with no lamination', () => {
    expect(adhesiveRequirements({ ...batch, adhesiveGsm: 0 })).toEqual([]);
  });
});
