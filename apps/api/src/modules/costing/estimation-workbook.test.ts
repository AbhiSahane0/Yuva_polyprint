import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { costRate, type CostingInput } from '@yuva/shared';
import { buildEstimationWorkbook } from './estimation-workbook.js';

/**
 * The download is the works' own Estimation sheet, not a report about it.
 *
 * They have costed on that layout for years and check quotations against it, so
 * what matters is that the headings are theirs, the figures are theirs, and the
 * formulas are **live** — a works that wants to try a different wage or film
 * rate does it in the copy and watches the total move, which is exactly what
 * they do today.
 */
const INPUT: CostingInput = {
  job: {
    orderQtyKg: 500,
    wastagePercent: 8,
    filmWidthMm: 700,
    filmHeightMm: 600,
    ups: 1,
    trimMm: 15,
    layers: [
      { name: 'Pet', micron: 12, density: 1.4, ratePerKg: 185 },
      { name: 'W/O Poly', micron: 110, density: 0.94, ratePerKg: 163 },
    ],
    colours: [
      { name: 'Black', laydownGsm: 0.15, solidsPercent: 23, ratePerKg: 202 },
      { name: 'Cyan', laydownGsm: 0.14, solidsPercent: 19.5, ratePerKg: 217 },
      { name: 'Magenta', laydownGsm: 0.13, solidsPercent: 19.5, ratePerKg: 235 },
      { name: 'Yellow', laydownGsm: 0.13, solidsPercent: 19.5, ratePerKg: 202 },
    ],
    flatInk: { ratePerKg: 800 },
    adhesive: {
      gsm: 3,
      ratio: '100:146:15',
      flatRatePerKg: 400,
      adhesiveRatePerKg: 165,
      ethylAcetateRatePerKg: 125,
      hardenerRatePerKg: 365,
    },
    solvent: {
      inkParts: 100,
      solventParts: 80,
      ethylAcetatePercent: 50,
      ethylAcetateRatePerKg: 125,
      tolueneRatePerKg: 95,
    },
    makesPouches: true,
    inkGsmOverride: 1.8,
    adhesiveSplitRatio: '100:189:15',
    stationCount: 7,
  },
  machines: [
    {
      name: 'Press',
      kind: 'PRINTING',
      horsepower: 66,
      powerRatePerHpHour: 9,
      speedMPerMin: 65,
      setupMinutes: 60,
      setupPowerFactor: 0,
    },
    {
      name: 'Laminator',
      kind: 'LAMINATION',
      horsepower: 6,
      powerRatePerHpHour: 35,
      speedMPerMin: 70,
      setupMinutes: 30,
      setupPowerFactor: 0,
    },
    {
      name: 'Slitter',
      kind: 'SLITTING',
      horsepower: 3,
      powerRatePerHpHour: 60,
      speedMPerMin: 80,
      setupMinutes: 30,
      setupPowerFactor: 0,
    },
  ],
  labour: [
    { role: 'Printing Operator', process: 'PRINTING', monthlySalary: 25000 },
    { role: 'Slitting Operator', process: 'SLITTING', monthlySalary: 12000 },
  ],
  overheads: {
    workingDaysPerMonth: 26,
    hoursPerDay: 8,
    transportPerKg: 10,
    packingPerKg: 5,
    otherPerJob: 250,
    emiPerMonth: 4166.66,
    emiHoursPerMonth: 24,
    emiBasis: 'RUN_TIME',
    pouchMakingPerKg: 15,
    stationSurcharges: [5.5, 7.5, 9],
    marginPercent: 9,
    marginBasis: 'MATERIAL_ONLY',
    inkCostModel: 'FLAT_GSM',
    adhesiveCostModel: 'FLAT_GSM',
  },
};

async function build() {
  const result = costRate(INPUT)!;
  const buffer = await buildEstimationWorkbook(INPUT, result, {
    quotationNumber: 133,
    customerName: 'Anupriya',
    jobName: '5 kg ata packaging',
    date: new Date('2026-09-09'),
  });
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(buffer as unknown as ArrayBuffer);
  return { sheet: book.getWorksheet('Estimation')!, result };
}

/** Every label in column A, so a row can be found by what it says. */
function labelled(sheet: ExcelJS.Worksheet): Map<string, number> {
  const rows = new Map<string, number>();
  sheet.eachRow((row, number) => {
    const label = row.getCell(1).value;
    if (typeof label === 'string' && label.trim()) rows.set(label.trim(), number);
  });
  return rows;
}

describe('the costing as a spreadsheet', () => {
  it('is laid out with the works’ own headings', async () => {
    const { sheet } = await build();
    const rows = labelled(sheet);
    /*
     * Their wording, not a tidied version. "Westage" is spelled the way the
     * sheet spells it; somebody scanning for it will look for that.
     */
    for (const heading of [
      'Party name',
      'Job Name',
      'Order Qty. Kg.',
      'MATERIAL',
      'TOTAL GSM',
      'Pouches in 1 kg.',
      ' Material Cost - Total',
      ' Profit Margin Cost',
      ' Cost With Profit Margin',
      ' 1 Kg Cost',
      'Calculated Final Cost ',
      'Per Pouch Cost',
    ]) {
      expect(rows.has(heading.trim())).toBe(true);
    }
    expect(sheet.getCell('E1').value).toBe('Profit Margin in %');
  });

  it('carries live formulas, not pasted numbers', async () => {
    /*
     * The point of the download. Verified separately by evaluating the file:
     * the chain recalculates to Rs 263.40 a kilogram and Rs 13.83 a pouch,
     * which are the workbook's own figures.
     */
    const { sheet } = await build();
    const rows = labelled(sheet);
    const formulaAt = (label: string, column: string) => {
      const row = rows.get(label.trim());
      expect(row, `no row labelled "${label.trim()}"`).toBeDefined();
      const cell = sheet.getCell(`${column}${row}`);
      return (cell.value as { formula?: string } | null)?.formula;
    };

    expect(formulaAt('TOTAL GSM', 'D')).toMatch(/^SUM\(/);
    expect(formulaAt('1 Pouch Wt. (g)', 'B')).toContain('/1000000');
    expect(formulaAt('Pouches in 1 kg.', 'B')).toMatch(/^1000\//);
    expect(formulaAt(' 1 Kg Cost', 'F')).toMatch(/\//);
    expect(formulaAt('Calculated Final Cost', 'F')).toMatch(/^SUM\(/);
    expect(formulaAt('Per Pouch Cost', 'F')).toMatch(/\//);
  });

  it('takes the margin on the basis the works chose', async () => {
    const { sheet } = await build();
    const rows = labelled(sheet);
    const margin = sheet.getCell(`F${rows.get('Profit Margin Cost')!}`);
    /* MATERIAL_ONLY: nine per cent of B alone, as Estimation!G55 does. */
    expect((margin.value as { formula: string }).formula).toMatch(/\*\$F\$1$/);
    expect((margin.value as { formula: string }).formula).not.toContain('+');

    const wholeCost = await (async () => {
      const result = costRate({
        ...INPUT,
        overheads: { ...INPUT.overheads, marginBasis: 'TOTAL_COST' },
      })!;
      const buffer = await buildEstimationWorkbook(
        { ...INPUT, overheads: { ...INPUT.overheads, marginBasis: 'TOTAL_COST' } },
        result,
        { customerName: 'x', jobName: 'y', date: new Date() },
      );
      const book = new ExcelJS.Workbook();
      await book.xlsx.load(buffer as unknown as ArrayBuffer);
      return book.getWorksheet('Estimation')!;
    })();
    const other = labelled(wholeCost);
    expect(
      (wholeCost.getCell(`F${other.get('Profit Margin Cost')!}`).value as { formula: string })
        .formula,
    ).toContain('+');
  });

  it('marks the cells the works is meant to edit', async () => {
    // "Edit in Yellow colours cells only" is the first thing their sheet says.
    const { sheet } = await build();
    expect(sheet.getCell('A1').value).toContain('Yellow');
    const orderQty = sheet.getCell('B7');
    expect((orderQty.fill as ExcelJS.FillPattern)?.fgColor?.argb).toBe('FFFFFF00');
  });

  it('names every ply and every wage it costed', async () => {
    const { sheet } = await build();
    const rows = labelled(sheet);
    expect(rows.has('Pet')).toBe(true);
    expect(rows.has('W/O Poly')).toBe(true);
    expect(rows.has('PRINTING')).toBe(true);
    expect(rows.has('SLITTING')).toBe(true);
    expect([...rows.keys()].some((key) => key.startsWith('Printing Operator'))).toBe(true);
  });
});
