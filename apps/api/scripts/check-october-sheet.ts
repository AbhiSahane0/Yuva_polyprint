/**
 * **The works' October costing sheet, typed in reel by reel and costed here.**
 *
 * Their `October Manoth 2026.xlsx` is one job — Radhey Murmura, Sr. No. 851 —
 * in the form they actually fill in: a weight for every reel that went on the
 * machine, a weight for every roll that came off it, and a final rate at the
 * foot of the page. This script is that page, entered the way the operator
 * enters it, through the SAME service the screen calls, and checked against
 * the figure their sheet reaches.
 *
 * It is the job sheet's equivalent of `seed:old-quotations`: if it stops
 * saying 261.82, the system has stopped agreeing with the paper the office
 * costs from.
 *
 *     npm run check:october -w @yuva/api
 *
 * It leaves nothing behind — the sheet it builds is deleted at the end.
 */
import { prisma } from '../src/lib/prisma.js';
import {
  costSheet,
  createJobSheet,
  getJobSheet,
  updateJobSheet,
} from '../src/modules/job-sheets/job-sheet.service.js';

const DATE = '2026-09-13';
const sheet = await createJobSheet(
  {
    date: DATE,
    jobName: 'Radhey Murmura 500gm',
    operatorName: 'Anil Patel',
    notes: '[october-check]',
  } as never,
  'check',
);

/** Reel weights straight off the works' own page. */
const reels = (...weights: number[]) =>
  weights.map((weightKg) => ({ weightKg, coreKg: 0, reelNumber: '' }));

/** By POSITION on the works' form — two rows are both called Ethyl Acetate. */
const SPEC: Record<
  number,
  { issue?: number[]; ret?: number; mix?: [number, number]; rate: number }
> = {
  1: { issue: [257.3, 250.25], ret: 210, rate: 165 }, // 12 PET Polyester
  2: { issue: [20, 21.5, 21.4, 20], ret: 20, mix: [124, 107.2], rate: 145 }, // Ethyl (printing)
  3: { issue: [9, 20.1], ret: 8, mix: [124, 107.2], rate: 165 }, // Toluene
  4: { rate: 180 }, // MIBK
  5: { rate: 252 }, // Cyan
  6: { rate: 252 }, // Magenta
  7: { rate: 240 }, // Yellow
  8: { mix: [21, 15.5], rate: 230 }, // Black
  9: { issue: [15, 22], mix: [25, 24.9], rate: 240 }, // White
  10: { mix: [39, 19], rate: 270 }, // Red
  11: { rate: 200 },
  12: { rate: 270 },
  13: { mix: [18, 26], rate: 250 }, // Dark Green
  14: { rate: 510 },
  15: { rate: 250 },
  16: { issue: [20], ret: 18.6, mix: [21, 21.8], rate: 270 }, // Violet
  17: { rate: 135 }, // Met PET — none on this job
  18: { issue: [166.7, 165, 164.7, 166, 106], ret: 34.5, rate: 170 }, // LDPE (N) GP
  19: { issue: [20.04], rate: 260 }, // Adhesive NCO
  20: { issue: [12.07], rate: 260 }, // Hardener OH
  21: { issue: [4], rate: 145 }, // Ethyl (lamination)
};

await updateJobSheet(
  sheet.id,
  {
    /* Printing: two rolls off the press with their cores. Lamination: three. */
    outputReels: [
      { stage: 'PRINTING', weightKg: 172, coreKg: 2, reelNumber: '' },
      { stage: 'PRINTING', weightKg: 145.1, coreKg: 2.5, reelNumber: '' },
      { stage: 'LAMINATION_1', weightKg: 401, coreKg: 4, reelNumber: '' },
      { stage: 'LAMINATION_1', weightKg: 324, coreKg: 0, reelNumber: '' },
      { stage: 'LAMINATION_1', weightKg: 338, coreKg: 0, reelNumber: '' },
    ],
    finalOutputKg: 1026,
    pouchingWeightKg: 0,
    packagingCost: 1200,
    transportPerKg: 6.8,
    electricityPerDay: 6000,
    emiPerDay: 10000,
    profitPercent: 10,
    expectedWastagePercent: 5,
    productionDays: 1.2,
    makeReadyDays: 1,
    stages: [
      { stage: 'PRINTING', sharePercent: 60, days: 1.2, shifts: 1 },
      { stage: 'LAMINATION_1', sharePercent: 20, days: 1.2, shifts: 1 },
      { stage: 'LAMINATION_2', sharePercent: 20, days: 0, shifts: 1 },
      { stage: 'SLITTING', sharePercent: 10, days: 1.2, shifts: 1 },
      { stage: 'POUCHING', sharePercent: 10, days: 0, shifts: 1 },
    ],
    labour: [
      ['office 1', 3, 576],
      ['Office 2', 1, 550],
      ['Operator 1', 1, 1200],
      ['Lamination operattor 2', 2, 1200],
      ['Slitting operator 3', 1, 596],
      ['Pouch operator', 0, 800],
      ['helper g', 6, 540],
      ['helper l', 1, 270],
    ].map(([role, headcount, ratePerDay], index) => ({
      position: index + 1,
      role: role as string,
      headcount: headcount as number,
      ratePerDay: ratePerDay as number,
      days: 1.2,
    })),
    lines: sheet.lines.map((line) => {
      const spec = SPEC[line.position];
      if (!spec) return { ...line, issueReels: [], returnReels: [] };
      return {
        ...line,
        ratePerKg: spec.rate,
        issueReels: reels(...(spec.issue ?? [])),
        returnReels: spec.ret ? reels(spec.ret) : [],
        mixIssuedKg: spec.mix?.[0] ?? 0,
        mixReturnedKg: spec.mix?.[1] ?? 0,
      };
    }),
  } as never,
  'check',
);

const costed = await costSheet(sheet.id);
const fresh = await getJobSheet(sheet.id);

const WANT: Record<number, number> = {
  1: 297.55,
  2: 69.62,
  3: 24.46,
  4: 0,
  5: 0,
  6: 0,
  7: 0,
  8: 2.2,
  9: 37.04,
  10: 8,
  11: 0,
  12: 0,
  13: -3.2,
  14: 0,
  15: 0,
  16: 1.08,
  17: 0,
  18: 733.9,
  19: 20.04,
  20: 12.07,
  21: 4,
};
console.log('line by line:');
for (const l of fresh.lines) {
  const want = WANT[l.position];
  const ok = want !== undefined && Math.abs(l.consumedKg - want) < 0.005;
  if (!ok)
    console.log(
      `   ${ok ? ' ' : '✗'} ${String(l.position).padStart(2)} ${l.name.padEnd(20)} ours ${l.consumedKg.toFixed(3).padStart(10)}  sheet ${(want ?? 0).toFixed(3).padStart(10)}`,
    );
}

const SHEET = {
  materialKg: 1206.76,
  materialCost: 207965.35,
  effectivePrice: 268628.653,
  costPerKg: 261.8213,
};
const line = (what: string, ours: number, theirs: number, p = 2) => {
  const ok = Math.abs(ours - theirs) < 0.02;
  console.log(
    `  ${ok ? '✓' : '✗'} ${what.padEnd(18)} ours ${ours.toFixed(p).padStart(13)}  sheet ${theirs.toFixed(p).padStart(13)}`,
  );
  return ok;
};

console.log('\nTyped reel by reel, costed by the service:\n');
console.log(`  printed rolls   ${fresh.printedGrossKg} gross − ${fresh.printedCoreKg} core`);
console.log(
  `  laminated rolls ${fresh.producedGrossKg} gross − ${fresh.producedCoreKg} core = ${fresh.producedKg}`,
);
const pet = fresh.lines.find((l) => l.name.includes('PET Polyester'))!;
console.log(
  `  polyester       ${pet.issueReels.length} reels → ${pet.issuedKg} issued, ${pet.returnedKg} back, ${pet.consumedKg} consumed\n`,
);
let all = true;
all = line('material kg', costed.materialKg, SHEET.materialKg, 3) && all;
all = line('material cost', costed.materialCost, SHEET.materialCost) && all;
all = line('effective price', costed.effectivePrice, SHEET.effectivePrice, 2) && all;
all = line('COST A KILOGRAM', costed.costPerKg, SHEET.costPerKg, 4) && all;
console.log(
  all
    ? '\nThe system reaches the figure their October sheet reaches.'
    : '\nMISMATCH — the system no longer agrees with the works\u2019 own sheet.',
);
if (!all) process.exitCode = 1;

await prisma.jobSheet.delete({ where: { id: sheet.id } });
await prisma.$disconnect();
