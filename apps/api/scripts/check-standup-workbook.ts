/**
 * The works' standup workbook, block by block, against the app's engine.
 *
 * Run with `npm run check:standup`. The companion to `seed:old-quotations`,
 * which does the same for the Estimation sheet's seven: that one must read
 * "7 of 7 exact" and this one must keep every pouch count on the nose, or the
 * two documents have drifted apart again.
 *
 * **The adhesive comes from the app, not the sheet.** It used to be fed in,
 * because the two disagreed: every block writes a flat 2 on its ADHESIVE row
 * whatever the structure, where the app worked a coat out per lamination and
 * reached 6 on a three-ply. The client has confirmed the flat 2, so the app
 * now answers for itself and this check tests it rather than being told.
 *
 * Only the parts that are directly comparable are compared. The sheet replaces
 * the whole of labour, power and machine time with a flat "LIGHT AND LABOUR"
 * of Rs 40-50 a kilogram, so its "basic amount" and the app's rate are not the
 * same quantity and lining them up would prove nothing. What IS the same
 * question on both sides:
 *
 *   - pouches per kilogram, which is pure geometry
 *   - what a pouch costs to make, which is the style's own charge
 *   - the wastage the line is grossed up by
 */
import {
  computeItemGeometry,
  pouchExpense,
  wastagePercentFor,
  adhesiveGsmFor,
  isWorkbookPouch,
  workbookStructureGsm,
  type PouchType,
} from '@yuva/shared';

interface Ply {
  micron: number;
  density: number;
  rate: number;
}

interface Block {
  sheet: string;
  name: string;
  pouchType: PouchType;
  hasDPunch?: boolean;
  isGazette?: boolean;
  kg: number;
  plies: Ply[];
  inkMicron: number;
  adhesiveMicron: number;
  /** Centimetres, as the sheet holds them. */
  widthCm: number;
  heightCm: number;
  sheetPouchesPerKg: number;
  sheetPerPouchExpense: number;
  /** What the sheet's own formula grosses the material by. */
  sheetWastagePercent: number;
}

const BLOCKS: Block[] = [
  {
    sheet: 'Standup Zipper',
    name: 'Shamali Tea 250g',
    pouchType: 'STANDUP_ZIPPER',
    kg: 250,
    plies: [
      { micron: 12, density: 1.4, rate: 200 },
      { micron: 12, density: 1.4, rate: 210 },
      { micron: 75, density: 0.92, rate: 210 },
    ],
    inkMicron: 1.2,
    adhesiveMicron: 2,
    widthCm: 13,
    heightCm: 51,
    sheetPouchesPerKg: 130,
    sheetPerPouchExpense: 0.494,
    sheetWastagePercent: 10,
  },
  {
    sheet: 'Standup Zipper',
    name: 'Balaji Super Bazar',
    pouchType: 'STANDUP_ZIPPER',
    kg: 250,
    plies: [
      { micron: 12, density: 1.4, rate: 180 },
      { micron: 90, density: 0.92, rate: 190 },
    ],
    inkMicron: 1.2,
    adhesiveMicron: 2,
    widthCm: 13,
    heightCm: 52,
    sheetPouchesPerKg: 131,
    sheetPerPouchExpense: 0.468,
    sheetWastagePercent: 10,
  },
  {
    sheet: 'Only Standup',
    name: 'Agasti Ghee 500g',
    pouchType: 'STANDUP',
    kg: 300,
    plies: [
      { micron: 12, density: 1.4, rate: 160 },
      { micron: 12, density: 1.4, rate: 160 },
      { micron: 70, density: 0.92, rate: 200 },
    ],
    inkMicron: 1.2,
    adhesiveMicron: 2,
    widthCm: 12,
    heightCm: 37,
    sheetPouchesPerKg: 203,
    sheetPerPouchExpense: 0.25,
    sheetWastagePercent: 10,
  },
  {
    sheet: 'Only Standup',
    name: 'Biryani Premix',
    pouchType: 'STANDUP',
    kg: 200,
    plies: [
      { micron: 12, density: 1.4, rate: 160 },
      { micron: 110, density: 0.92, rate: 260 },
    ],
    inkMicron: 1.2,
    adhesiveMicron: 2,
    widthCm: 19,
    heightCm: 61,
    sheetPouchesPerKg: 64,
    sheetPerPouchExpense: 0.25,
    sheetWastagePercent: 10,
  },
  {
    sheet: 'Only Standup',
    name: 'Lacpro 1 Kg',
    pouchType: 'STANDUP',
    kg: 250,
    plies: [
      { micron: 12, density: 1.4, rate: 180 },
      { micron: 100, density: 0.92, rate: 280 },
    ],
    inkMicron: 1.2,
    adhesiveMicron: 2,
    widthCm: 71,
    heightCm: 21,
    sheetPouchesPerKg: 54,
    sheetPerPouchExpense: 0.25,
    sheetWastagePercent: 10,
  },
  {
    sheet: 'D Punch Pouch',
    name: 'Humza Veg Samosa 1500kg',
    pouchType: 'THREE_SIDE_SEAL',
    hasDPunch: true,
    kg: 1500,
    plies: [
      { micron: 12, density: 1.4, rate: 152 },
      { micron: 75, density: 0.92, rate: 155 },
    ],
    inkMicron: 1.2,
    adhesiveMicron: 2,
    widthCm: 19,
    heightCm: 82.4,
    sheetPouchesPerKg: 66,
    sheetPerPouchExpense: 0.6,
    sheetWastagePercent: 10,
  },
  {
    sheet: 'D Punch Pouch',
    name: 'Humza Veg Samosa 500kg',
    pouchType: 'THREE_SIDE_SEAL',
    hasDPunch: true,
    kg: 500,
    plies: [
      { micron: 12, density: 1.4, rate: 152 },
      { micron: 135, density: 0.92, rate: 155 },
    ],
    inkMicron: 1.2,
    adhesiveMicron: 2,
    widthCm: 48.5,
    heightCm: 96.5,
    sheetPouchesPerKg: 14,
    sheetPerPouchExpense: 0.8,
    sheetWastagePercent: 10,
  },
];

/** The works' per-pouch rates, as the Costing screen holds them. */
const RATES = {
  makingPerPouch: 0.25,
  dPunchPerPouch: 0.6,
  dPunchLargePerPouch: 0.8,
  dPunchLargeAboveMm: 450,
  zipperRatePerMetre: 3.8,
};

/** The sheet's own pouches/kg: average density across rows × total micron. */
function sheetYield(b: Block): number {
  const rows = [...b.plies.map((p) => p.density), 1, 1];
  const avgDensity = rows.reduce((a, d) => a + d, 0) / rows.length;
  const totalMicron = b.plies.reduce((a, p) => a + p.micron, 0) + b.inkMicron + b.adhesiveMicron;
  const grams = (b.widthCm * b.heightCm * avgDensity * totalMicron) / 10000;
  return Math.ceil(1000 / grams);
}

const pad = (s: string, n: number) => s.padEnd(n);
const num = (v: number, dp = 2) => v.toFixed(dp).padStart(9);

let yieldMatches = 0;
let expenseMatches = 0;
let wastageMatches = 0;

console.log(
  `\n${pad('Sheet / block', 34)}${pad('style', 18)}  ` +
    `${'pouches/kg'.padStart(21)}   ${'pouch expense'.padStart(21)}   wastage`,
);
console.log(
  `${pad('', 34)}${pad('', 18)}  ${'sheet'.padStart(9)}${'app'.padStart(12)}   ` +
    `${'sheet'.padStart(9)}${'app'.padStart(12)}   sheet  app`,
);
console.log('-'.repeat(130));

for (const b of BLOCKS) {
  /* The app's geometry, from the structure's real GSM. */
  /* Whatever the app says this style's coat is — the thing being checked. */
  const adhesive = adhesiveGsmFor({
    pouchType: b.pouchType,
    hasDPunch: b.hasDPunch ?? false,
    plies: b.plies,
    thinGsm: 2,
    thickGsm: 3,
    thickPlyMicron: 40,
    pouchAdhesiveGsm: 2,
  });
  const gsm = b.plies.reduce((a, p) => a + p.micron * p.density, 0) + b.inkMicron * 1 + adhesive;
  const micron = b.plies.reduce((a, p) => a + p.micron, 0) + b.inkMicron + b.adhesiveMicron;

  const geo = computeItemGeometry(
    {
      layerCount: b.plies.length,
      micron,
      gsm,
      workbookGsm: isWorkbookPouch(b.pouchType, b)
        ? workbookStructureGsm(
            b.plies.map((p) => ({ micron: p.micron, density: p.density })),
            { inkGsm: b.inkMicron, adhesiveGsm: adhesive },
          )
        : 0,
      widthMm: b.widthCm * 10,
      heightMm: b.heightCm * 10,
      makesPouches: true,
      repeatWidth: 1,
      repeatHeight: 1,
      cylinderCount: 0,
      mountingMm: 80,
    } as never,
    2.5,
  );

  const expense = pouchExpense(b.pouchType, b.widthCm * 10, RATES, b.hasDPunch ?? false);

  const appWastage = wastagePercentFor({
    pouchType: b.pouchType,
    hasDPunch: b.hasDPunch ?? false,
    defaultWastagePercent: 8,
    pouchWastagePercent: 7,
  });

  /* The sheet's own yield formula, re-run here to prove the gap is the METHOD
     and not a typo in the figure the sheet printed. */
  const reYield = sheetYield(b);

  const yieldOk = Math.abs(geo.pouchesPerKg - b.sheetPouchesPerKg) <= 1;
  const expenseOk = Math.abs(expense.perPouch - b.sheetPerPouchExpense) <= 0.005;
  const wastageOk = appWastage === b.sheetWastagePercent;
  if (yieldOk) yieldMatches += 1;
  if (expenseOk) expenseMatches += 1;
  if (wastageOk) wastageMatches += 1;

  const style = `${b.pouchType}${b.hasDPunch ? '+punch' : ''}`;
  console.log(
    `${yieldOk && expenseOk && wastageOk ? ' OK ' : ' XX '}` +
      `${pad(`${b.sheet} / ${b.name}`, 30)}${pad(style, 18)}  ` +
      `${num(b.sheetPouchesPerKg)}${num(geo.pouchesPerKg)}   ` +
      `${num(b.sheetPerPouchExpense, 4)}${num(expense.perPouch, 4)}   ` +
      `${String(b.sheetWastagePercent).padStart(4)}%${String(appWastage).padStart(5)}%` +
      (reYield !== b.sheetPouchesPerKg ? `   [sheet formula re-run: ${reYield}]` : ''),
  );
}

console.log('-'.repeat(130));
console.log(
  `\n  pouches/kg   ${yieldMatches} of ${BLOCKS.length}` +
    `\n  pouch expense ${expenseMatches} of ${BLOCKS.length}` +
    `\n  wastage      ${wastageMatches} of ${BLOCKS.length}\n`,
);

console.log('  isWorkbookPouch:');
for (const t of ['STANDUP', 'STANDUP_ZIPPER', 'THREE_SIDE_SEAL', 'CENTRE_SEAL'] as PouchType[]) {
  console.log(
    `    ${pad(t, 20)} ${isWorkbookPouch(t) ? 'pouch workbook (7%)' : 'Estimation sheet (8%)'}`,
  );
}
