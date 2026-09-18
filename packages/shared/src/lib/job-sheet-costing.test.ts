import { describe, expect, it } from 'vitest';
import { JOB_SHEET_STAGE_DEFAULTS, JOB_SHEET_STAGE_SHARE_TOTAL } from '../constants/job-sheet.js';
import {
  consumedKg,
  costJobSheet,
  JOB_SHEET_STAGES,
  labourAmount,
  mixDrumFor,
  stageElectricity,
  type JobSheetCostInput,
  type JobSheetLineInput,
} from './job-sheet-costing.js';

/**
 * **The works' own September 2026 job sheets, costed by this module.**
 *
 * Fourteen real runs, lifted cell by cell out of `September 2026 Job Sheet.xlsx`
 * — every issue, every return, every rate, and the answers the spreadsheet
 * reaches. Nothing here was typed by hand; it was extracted from the workbook,
 * which is the only way a golden master is worth having. If a figure below
 * looks wrong, the works' spreadsheet says it, and that is the point: this
 * module has to agree with the document the office is already using, including
 * where that document does something surprising.
 *
 * Three of those surprises are load-bearing, and each has a test of its own
 * further down:
 *
 * 1. **Two sheets carry a hand-typed consumption** over the formula — White
 *    ink, 14.5 where the arithmetic said 23.52. Honouring it is worth
 *    Rs 2,164.80 on a Rs 65,000 job; ignoring it makes this module wrong on
 *    two of fourteen sheets and right in a way nobody asked for.
 * 2. **Some consumptions are negative** — a drum came back fuller than it went
 *    out, because it was topped up from an earlier job. Flooring those at zero
 *    would overstate this job by the amount the last one was overstated by.
 * 3. **Profit is ten per cent of the material**, not of the loaded cost.
 *
 * The tolerance on money is **one paisa**, and it is that tight deliberately:
 * the office will run a job through both this and the spreadsheet on the first
 * day, and a difference of any size is a difference somebody has to explain.
 *
 * One paisa rather than nothing, because three of the fourteen land on a
 * rounding tie — Rs 769,372.245 — where Excel and JavaScript disagree about
 * which way a half goes. Chasing that to zero would mean adopting Excel's
 * rounding for its own sake, and the works does not care which side of a paisa
 * a Rs 769,372 job falls on.
 */

/** `[name, issued, returned, mixIssued, mixReturned, share%, override, rate]` */
type Line = [string, number, number, number, number, number, number | null, number];
/** `[role, headcount, ratePerDay, days]` */
type Labour = [string, number, number, number];

interface Sheet {
  sheet: string;
  job: string;
  lines: Line[];
  labour: Labour[];
  overheads: {
    electricity: number;
    salary: number;
    transport: number;
    pouching: number;
    packaging: number;
    emi: number;
    profit: number;
  };
  producedKg: number;
  finalOutputKg: number;
  pouchingWeightKg: number;
  expect: {
    materialKg: number;
    materialCost: number;
    basicValuePerKg: number;
    effectivePrice: number;
    costPerKg: number;
  };
}

/** Paise apart, with the float noise of the subtraction itself taken off. */
const paiseApart = (a: number, b: number): number => Number(Math.abs(a - b).toFixed(2)) * 100;

const SHEETS: Sheet[] = [
  {
    sheet: 'Kothmire Mutton Masala',
    job: 'Kothmire Mutton masala ',
    lines: [
      ['12 PET Polyester', 186.19, 116, 0, 0, 0, null, 149],
      ['Ethyl Acetate (printing)', 78.4, 12, 140.1, 154.1, 40, null, 125],
      ['Toluene', 18.4, 0, 140.1, 154.1, 20, null, 145],
      ['MIBK', 2, 0, 0, 0, 0, null, 180],
      ['Cyan', 2, 2, 18.5, 21, 40, null, 252],
      ['Magenta', 14.5, 9.8, 13, 17.4, 40, null, 252],
      ['Yellow', 14.3, 6.3, 17.2, 21.8, 40, null, 240],
      ['Black', 8.8, 7.3, 11.7, 17, 40, null, 230],
      ['White', 35, 11.2, 16.2, 16.9, 40, 14.5, 240],
      ['Red', 20, 18.6, 38.3, 39, 40, null, 270],
      ['Medium', 37.6, 19.3, 0, 0, 40, null, 200],
      ['Orange', 1.7, 1.7, 0, 0, 40, null, 270],
      ['Dark Green', 0, 0, 0, 0, 40, null, 250],
      ['Gold', 0, 0, 0, 0, 40, null, 510],
      ['Pink', 0, 0, 25.2, 21, 40, null, 250],
      ['Violet', 0, 0, 0, 0, 40, null, 270],
      ['Met PET', 194.68, 130.7, 0, 0, 0, null, 163],
      ['LDPE', 135.4, 4, 0, 0, 0, null, 160],
      ['Adhesive (NCO)', 8.85, 0, 0, 0, 40, null, 260],
      ['Hardener (OH)', 5.75, 0, 0, 0, 5, null, 260],
      ['Ethyl Acetate (lamination)', 2, 0, 0, 0, 60, null, 135],
    ],
    labour: [
      ['office 1', 2, 576, 0.5],
      ['Office 2', 2, 550, 0.5],
      ['Operator 1', 1, 1200, 0.5],
      ['Printing operattor 2', 1, 1000, 0.5],
      ['Slitting operator 3', 1, 596, 0.5],
      ['Pouch operator', 0, 800, 0.5],
      ['helper g', 8, 700, 0.5],
      ['helper l', 1, 290, 0.5],
    ],
    overheads: {
      electricity: 2500,
      salary: 5469,
      transport: 1533.87,
      pouching: 0,
      packaging: 400,
      emi: 5000,
      profit: 6588.613,
    },
    producedKg: 272,
    finalOutputKg: 261.12,
    pouchingWeightKg: 0,
    expect: {
      materialKg: 403.65,
      materialCost: 65886.13,
      basicValuePerKg: 163.23,
      effectivePrice: 87377.61,
      costPerKg: 334.63,
    },
  },
  {
    sheet: 'Copy of Kothmire Mutton Masala',
    job: 'Kothmire Mutton masala ',
    lines: [
      ['12 PET Polyester', 186.19, 116, 0, 0, 0, null, 170],
      ['Ethyl Acetate (printing)', 78.4, 12, 140.1, 154.1, 40, null, 145],
      ['Toluene', 18.4, 0, 140.1, 154.1, 20, null, 165],
      ['MIBK', 2, 0, 0, 0, 0, null, 180],
      ['Cyan', 2, 2, 18.5, 21, 40, null, 252],
      ['Magenta', 14.5, 9.8, 13, 17.4, 40, null, 252],
      ['Yellow', 14.3, 6.3, 17.2, 21.8, 40, null, 240],
      ['Black', 8.8, 7.3, 11.7, 17, 40, null, 230],
      ['White', 35, 11.2, 16.2, 16.9, 40, 14.5, 240],
      ['Red', 20, 18.6, 38.3, 39, 40, null, 270],
      ['Medium', 37.6, 19.3, 0, 0, 40, null, 200],
      ['Orange', 1.7, 1.7, 0, 0, 40, null, 270],
      ['Dark Green', 0, 0, 0, 0, 40, null, 250],
      ['Gold', 0, 0, 0, 0, 40, null, 510],
      ['Pink', 0, 0, 25.2, 21, 40, null, 250],
      ['Violet', 0, 0, 0, 0, 40, null, 270],
      ['Met PET', 194.68, 130.7, 0, 0, 0, null, 190],
      ['LDPE', 135.4, 4, 0, 0, 0, null, 175],
      ['Adhesive (NCO)', 8.85, 0, 0, 0, 40, null, 260],
      ['Hardener (OH)', 5.75, 0, 0, 0, 5, null, 260],
      ['Ethyl Acetate (lamination)', 2, 0, 0, 0, 60, null, 145],
    ],
    labour: [
      ['office 1', 2, 576, 0.55],
      ['Office 2', 2, 550, 0.55],
      ['Operator 1', 1, 1200, 0.55],
      ['Printing operattor 2', 1, 1000, 0.55],
      ['Slitting operator 3', 1, 596, 0.55],
      ['Pouch operator', 0, 800, 0.55],
      ['helper g', 8, 700, 0.55],
      ['helper l', 1, 290, 0.55],
    ],
    overheads: {
      electricity: 2750,
      salary: 6015.9,
      transport: 1533.87,
      pouching: 0,
      packaging: 400,
      emi: 5500,
      profit: 7260.658,
    },
    producedKg: 272,
    finalOutputKg: 261.12,
    pouchingWeightKg: 0,
    expect: {
      materialKg: 403.65,
      materialCost: 72606.58,
      basicValuePerKg: 179.88,
      effectivePrice: 96067.01,
      costPerKg: 367.9,
    },
  },
  {
    sheet: 'Amruta Family Tea Rs5 & 10Rs.',
    job: 'Amruta Family Tea Rs-5/rs10',
    lines: [
      ['12 PET Polyester', 1117.045, 142, 0, 0, 0, null, 149],
      ['Ethyl Acetate (printing)', 249, 50, 255.1, 183.6, 40, null, 130],
      ['Toluene', 80, 15, 255.1, 183.6, 20, null, 145],
      ['MIBK', 25, 11.3, 0, 0, 0, null, 180],
      ['Cyan', 13.1, 0, 20.1, 20.8, 40, null, 252],
      ['Magenta', 26.7, 0, 71.6, 17.1, 40, null, 252],
      ['Yellow', 27.9, 0, 21.9, 21.7, 40, null, 240],
      ['Black', 7.3, 0, 16, 19.8, 40, null, 230],
      ['White', 255.5, 4, 19.1, 24, 40, null, 240],
      ['Red', 93.1, 0, 38.2, 39, 40, null, 270],
      ['Medium', 61.3, 18.2, 38.2, 0, 40, null, 200],
      ['Orange', 40, 4.3, 9.9, 19.4, 40, null, 270],
      ['Dark Green', 0, 0, 0, 0, 40, null, 250],
      ['Gold', 0, 0, 0, 0, 40, null, 510],
      ['Pink', 0, 0, 20.1, 21.8, 40, null, 250],
      ['Violet', 0, 0, 0, 0, 40, null, 270],
      ['Met PET', 977.2, 0, 0, 0, 0, null, 169],
      ['LDPE', 1318.6, 42.5, 0, 0, 0, null, 160],
      ['Adhesive (NCO)', 186.46, 0, 0, 0, 40, null, 260],
      ['Hardener (OH)', 123.67, 0, 0, 0, 5, null, 260],
      ['Ethyl Acetate (lamination)', 15, 0, 0, 0, 60, null, 135],
    ],
    labour: [
      ['office 1', 2, 576, 3],
      ['Office 2', 2, 550, 3],
      ['Operator 1', 1, 1200, 3],
      ['Printing operattor 2', 1, 1000, 3],
      ['Slitting operator 3', 1, 596, 3],
      ['Pouch operator', 0, 800, 3],
      ['helper g', 11, 700, 3],
      ['helper l', 1, 290, 3],
    ],
    overheads: {
      electricity: 15000,
      salary: 39114,
      transport: 25526.235,
      pouching: 0,
      packaging: 2500,
      emi: 30000,
      profit: 76937.2245,
    },
    producedKg: 3433.9,
    finalOutputKg: 3313,
    pouchingWeightKg: 0,
    expect: {
      materialKg: 4401.075,
      materialCost: 769372.24,
      basicValuePerKg: 174.81,
      effectivePrice: 958449.7,
      costPerKg: 289.3,
    },
  },
  {
    sheet: 'swaraj green pease 1kg',
    job: 'Swaraj Green Pease 1kg',
    lines: [
      ['12 PET Polyester', 140, 31, 0, 0, 0, null, 149],
      ['Ethyl Acetate (printing)', 35.7, 25, 101.6, 91.7, 40, null, 130],
      ['Toluene', 21.4, 7, 101.6, 91.7, 20, null, 145],
      ['MIBK', 6.3, 6, 0, 0, 0, null, 180],
      ['Cyan', 29, 3.5, 17.8, 17.2, 40, null, 252],
      ['Magenta', 17.3, 16, 19.1, 15, 40, null, 252],
      ['Yellow', 35.4, 19.2, 17, 18, 40, null, 240],
      ['Black', 12.8, 6.2, 26.7, 22, 40, null, 230],
      ['White', 0, 0, 0, 0, 40, null, 240],
      ['Red', 0, 0, 0, 0, 40, null, 270],
      ['Medium', 26.4, 18.4, 0, 0, 40, null, 200],
      ['Orange', 0, 0, 0, 0, 40, null, 270],
      ['Dark Green', 0, 0, 21, 19.5, 40, null, 250],
      ['Gold', 0, 0, 0, 0, 40, null, 510],
      ['Pink', 0, 0, 0, 0, 40, null, 250],
      ['Violet', 0, 0, 0, 0, 40, null, 270],
      ['Met PET', 0, 0, 0, 0, 0, null, 135],
      ['LDPE', 382.9, 0, 0, 0, 0, null, 180],
      ['Adhesive (NCO)', 8.11, 0, 0, 0, 40, null, 260],
      ['Hardener (OH)', 4.89, 0, 0, 0, 5, null, 260],
      ['Ethyl Acetate (lamination)', 3, 0, 0, 0, 60, null, 135],
    ],
    labour: [
      ['office 1', 2, 576, 0.75],
      ['Office 2', 2, 550, 0.75],
      ['Operator 1', 1, 1200, 0.75],
      ['Printing operattor 2', 1, 1000, 0.75],
      ['Slitting operator 3', 1, 596, 0.75],
      ['Pouch operator', 2, 800, 0.75],
      ['helper g', 9, 540, 0.75],
      ['helper l', 1, 270, 0.75],
    ],
    overheads: {
      electricity: 4950,
      salary: 8833.5,
      transport: 4085.44,
      pouching: 4776,
      packaging: 300,
      emi: 7500,
      profit: 10800.266,
    },
    producedKg: 497.5,
    finalOutputKg: 477.6,
    pouchingWeightKg: 477.6,
    expect: {
      materialKg: 600.8,
      materialCost: 108002.66,
      basicValuePerKg: 179.76,
      effectivePrice: 149247.87,
      costPerKg: 312.5,
    },
  },
  {
    sheet: 'Malpani Lime',
    job: 'Lime',
    lines: [
      ['12 PET Polyester', 972.01, 0, 0, 0, 0, null, 172],
      ['Ethyl Acetate (printing)', 89.7, 0, 22, 18, 40, null, 135],
      ['Toluene', 0, 0, 22, 18, 20, null, 175],
      ['MIBK', 0, 0, 0, 0, 0, null, 190],
      ['Cyan', 0, 0, 0, 0, 40, null, 252],
      ['Magenta', 0, 0, 0, 0, 40, null, 252],
      ['Yellow', 0, 0, 0, 0, 40, null, 240],
      ['Black', 0, 0, 0, 0, 40, null, 230],
      ['White', 0, 0, 0, 0, 40, null, 240],
      ['Red', 0, 0, 0, 0, 40, null, 270],
      ['Medium', 0, 0, 0, 0, 40, null, 200],
      ['Orange', 0, 0, 0, 0, 40, null, 270],
      ['Dark Green', 0, 0, 0, 0, 40, null, 250],
      ['Gold', 0, 0, 0, 0, 40, null, 510],
      ['Pink', 0, 0, 0, 0, 40, null, 250],
      ['Violet', 0, 0, 22, 18, 40, null, 270],
      ['Met PET', 0, 0, 0, 0, 0, null, 135],
      ['LDPE', 2432.3, 118, 0, 0, 0, null, 183],
      ['Adhesive (NCO)', 71.11, 0, 0, 0, 40, null, 260],
      ['Hardener (OH)', 41.88, 0, 0, 0, 5, null, 260],
      ['Ethyl Acetate (lamination)', 5, 0, 0, 0, 60, null, 135],
    ],
    labour: [
      ['office 1', 2, 576, 2],
      ['Office 2', 2, 550, 2],
      ['Operator 1', 2, 1200, 2],
      ['Printing operattor 2', 1, 1000, 2],
      ['Slitting operator 3', 1, 596, 2],
      ['Pouch operator', 0, 800, 2],
      ['helper g', 6, 540, 2],
      ['helper l', 1, 270, 2],
    ],
    overheads: {
      electricity: 10800,
      salary: 19516,
      transport: 24486,
      pouching: 0,
      packaging: 4000,
      emi: 20000,
      profit: 63365.252,
    },
    producedKg: 3387.5,
    finalOutputKg: 3285,
    pouchingWeightKg: 0,
    expect: {
      materialKg: 3498,
      materialCost: 633652.52,
      basicValuePerKg: 181.15,
      effectivePrice: 775819.77,
      costPerKg: 236.17,
    },
  },
  {
    sheet: 'Copy of Malpani Lime',
    job: 'Lime',
    lines: [
      ['12 PET Polyester', 972.01, 0, 0, 0, 0, null, 172],
      ['Ethyl Acetate (printing)', 89.7, 0, 22, 18, 40, null, 135],
      ['Toluene', 0, 0, 22, 18, 20, null, 175],
      ['MIBK', 0, 0, 0, 0, 0, null, 190],
      ['Cyan', 0, 0, 0, 0, 40, null, 252],
      ['Magenta', 0, 0, 0, 0, 40, null, 252],
      ['Yellow', 0, 0, 0, 0, 40, null, 240],
      ['Black', 0, 0, 0, 0, 40, null, 230],
      ['White', 0, 0, 0, 0, 40, null, 240],
      ['Red', 0, 0, 0, 0, 40, null, 270],
      ['Medium', 0, 0, 0, 0, 40, null, 200],
      ['Orange', 0, 0, 0, 0, 40, null, 270],
      ['Dark Green', 0, 0, 0, 0, 40, null, 250],
      ['Gold', 0, 0, 0, 0, 40, null, 510],
      ['Pink', 0, 0, 0, 0, 40, null, 250],
      ['Violet', 0, 0, 22, 18, 40, null, 270],
      ['Met PET', 0, 0, 0, 0, 0, null, 135],
      ['LDPE', 2432.3, 118, 0, 0, 0, null, 183],
      ['Adhesive (NCO)', 71.11, 0, 0, 0, 40, null, 260],
      ['Hardener (OH)', 41.88, 0, 0, 0, 5, null, 260],
      ['Ethyl Acetate (lamination)', 5, 0, 0, 0, 60, null, 135],
    ],
    labour: [
      ['office 1', 2, 576, 2],
      ['Office 2', 2, 550, 2],
      ['Operator 1', 2, 1200, 2],
      ['Printing operattor 2', 1, 1000, 2],
      ['Slitting operator 3', 1, 596, 2],
      ['Pouch operator', 0, 800, 2],
      ['helper g', 6, 540, 2],
      ['helper l', 1, 270, 2],
    ],
    overheads: {
      electricity: 10800,
      salary: 19516,
      transport: 24486,
      pouching: 0,
      packaging: 4000,
      emi: 20000,
      profit: 63365.252,
    },
    producedKg: 3387.5,
    finalOutputKg: 3285,
    pouchingWeightKg: 0,
    expect: {
      materialKg: 3498,
      materialCost: 633652.52,
      basicValuePerKg: 181.15,
      effectivePrice: 775819.77,
      costPerKg: 236.17,
    },
  },
  {
    sheet: 'Copy of Copy of Malpani Lime',
    job: 'Lime',
    lines: [
      ['12 PET Polyester', 1479.01, 0, 0, 0, 0, null, 167],
      ['Ethyl Acetate (printing)', 136.7, 0, 22, 18, 40, null, 135],
      ['Toluene', 0, 0, 22, 18, 20, null, 175],
      ['MIBK', 0, 0, 0, 0, 0, null, 190],
      ['Cyan', 0, 0, 0, 0, 40, null, 252],
      ['Magenta', 0, 0, 0, 0, 40, null, 252],
      ['Yellow', 0, 0, 0, 0, 40, null, 240],
      ['Black', 0, 0, 0, 0, 40, null, 230],
      ['White', 0, 0, 0, 0, 40, null, 240],
      ['Red', 0, 0, 0, 0, 40, null, 270],
      ['Medium', 0, 0, 0, 0, 40, null, 200],
      ['Orange', 0, 0, 0, 0, 40, null, 270],
      ['Dark Green', 0, 0, 0, 0, 40, null, 250],
      ['Gold', 0, 0, 0, 0, 40, null, 510],
      ['Pink', 0, 0, 0, 0, 40, null, 250],
      ['Violet', 4.5, 0, 22, 18, 40, null, 270],
      ['Met PET', 0, 0, 0, 0, 0, null, 135],
      ['LDPE', 3639.3, 118, 0, 0, 0, null, 183],
      ['Adhesive (NCO)', 108.11, 0, 0, 0, 40, null, 260],
      ['Hardener (OH)', 63.88, 0, 0, 0, 5, null, 260],
      ['Ethyl Acetate (lamination)', 9, 0, 0, 0, 60, null, 135],
    ],
    labour: [
      ['office 1', 2, 576, 3],
      ['Office 2', 2, 550, 3],
      ['Operator 1', 2, 1200, 3],
      ['Printing operattor 2', 1, 1000, 3],
      ['Slitting operator 3', 1, 596, 3],
      ['Pouch operator', 0, 800, 3],
      ['helper g', 6, 540, 3],
      ['helper l', 1, 270, 3],
    ],
    overheads: {
      electricity: 16200,
      salary: 29274,
      transport: 37285.5,
      pouching: 0,
      packaging: 4000,
      emi: 30000,
      profit: 95778.247,
    },
    producedKg: 5153.5,
    finalOutputKg: 5000,
    pouchingWeightKg: 0,
    expect: {
      materialKg: 5326.5,
      materialCost: 957782.47,
      basicValuePerKg: 179.81,
      effectivePrice: 1170320.22,
      costPerKg: 234.06,
    },
  },
  {
    sheet: 'Radhey Murmura 24.03.2026',
    job: 'Radhey Murmura 500gm',
    lines: [
      ['12 PET Polyester', 507.55, 210, 0, 0, 0, null, 125],
      ['Ethyl Acetate (printing)', 82.9, 20, 124, 107.2, 40, null, 120],
      ['Toluene', 29.1, 8, 124, 107.2, 20, null, 145],
      ['MIBK', 0, 0, 0, 0, 0, null, 180],
      ['Cyan', 0, 0, 0, 0, 40, null, 240],
      ['Magenta', 0, 0, 0, 0, 40, null, 240],
      ['Yellow', 0, 0, 0, 0, 40, null, 240],
      ['Black', 0, 0, 21, 15.5, 40, null, 210],
      ['White', 37, 0, 25, 24.9, 40, null, 190],
      ['Red', 0, 0, 39, 19, 40, null, 260],
      ['Medium', 0, 0, 0, 0, 40, null, 180],
      ['Orange', 0, 0, 0, 0, 40, null, 234],
      ['Dark Green', 0, 0, 18, 26, 40, null, 230],
      ['Gold', 0, 0, 0, 0, 40, null, 447],
      ['Pink', 0, 0, 0, 0, 40, null, 234],
      ['Violet', 20, 18.6, 21, 21.8, 40, null, 235],
      ['Met PET', 0, 0, 0, 0, 0, null, 133],
      ['LDPE', 768.4, 34.5, 0, 0, 0, null, 163],
      ['Adhesive (NCO)', 20.04, 0, 0, 0, 40, null, 250],
      ['Hardener (OH)', 12.07, 0, 0, 0, 5, null, 250],
      ['Ethyl Acetate (lamination)', 4, 0, 0, 0, 60, null, 100],
    ],
    labour: [
      ['office 1', 3, 576, 0.9],
      ['Office 2', 1, 550, 0.9],
      ['Operator 1', 1, 1200, 0.9],
      ['Lamination operattor 2', 2, 1200, 0.9],
      ['Slitting operator 3', 1, 596, 0.9],
      ['Pouch operator', 0, 800, 0.9],
      ['helper g', 5, 540, 0.9],
      ['helper l', 1, 270, 0.9],
    ],
    overheads: {
      electricity: 4500,
      salary: 8499.6,
      transport: 3861.632,
      pouching: 0,
      packaging: 2000,
      emi: 9000,
      profit: 18624.545,
    },
    producedKg: 1059,
    finalOutputKg: 1027,
    pouchingWeightKg: 0,
    expect: {
      materialKg: 1206.76,
      materialCost: 186245.45,
      basicValuePerKg: 154.34,
      effectivePrice: 232731.23,
      costPerKg: 226.61,
    },
  },
  {
    sheet: 'Radhey Murmura 16.09.2026',
    job: 'Radhey Murmura 500gm',
    lines: [
      ['12 PET Polyester', 507.55, 210, 0, 0, 0, null, 170],
      ['Ethyl Acetate (printing)', 82.9, 20, 124, 107.2, 40, null, 145],
      ['Toluene', 29.1, 8, 124, 107.2, 20, null, 165],
      ['MIBK', 0, 0, 0, 0, 0, null, 180],
      ['Cyan', 0, 0, 0, 0, 40, null, 252],
      ['Magenta', 0, 0, 0, 0, 40, null, 252],
      ['Yellow', 0, 0, 0, 0, 40, null, 240],
      ['Black', 0, 0, 21, 15.5, 40, null, 230],
      ['White', 37, 0, 25, 24.9, 40, null, 240],
      ['Red', 0, 0, 39, 19, 40, null, 270],
      ['Medium', 0, 0, 0, 0, 40, null, 200],
      ['Orange', 0, 0, 0, 0, 40, null, 270],
      ['Dark Green', 0, 0, 18, 26, 40, null, 250],
      ['Gold', 0, 0, 0, 0, 40, null, 510],
      ['Pink', 0, 0, 0, 0, 40, null, 250],
      ['Violet', 20, 18.6, 21, 21.8, 40, null, 270],
      ['Met PET', 0, 0, 0, 0, 0, null, 135],
      ['LDPE', 768.4, 34.5, 0, 0, 0, null, 175],
      ['Adhesive (NCO)', 20.04, 0, 0, 0, 40, null, 260],
      ['Hardener (OH)', 12.07, 0, 0, 0, 5, null, 260],
      ['Ethyl Acetate (lamination)', 4, 0, 0, 0, 60, null, 145],
    ],
    labour: [
      ['office 1', 3, 576, 1],
      ['Office 2', 1, 550, 1],
      ['Operator 1', 1, 1200, 1],
      ['Lamination operattor 2', 2, 1200, 1],
      ['Slitting operator 3', 1, 596, 1],
      ['Pouch operator', 0, 800, 1],
      ['helper g', 5, 540, 1],
      ['helper l', 1, 270, 1],
    ],
    overheads: {
      electricity: 5400,
      salary: 9444,
      transport: 8205.968,
      pouching: 0,
      packaging: 1000,
      emi: 10000,
      profit: 21312.26,
    },
    producedKg: 1059,
    finalOutputKg: 1027,
    pouchingWeightKg: 0,
    expect: {
      materialKg: 1206.76,
      materialCost: 213122.6,
      basicValuePerKg: 176.61,
      effectivePrice: 268484.83,
      costPerKg: 261.43,
    },
  },
  {
    sheet: 'Sau Shital Paneer 200g',
    job: 'Sau Shital Paneer 200g /500g',
    lines: [
      ['12 PET Polyester', 160, 67.8, 0, 0, 0, null, 149],
      ['Ethyl Acetate (printing)', 72.4, 45, 100.2, 114.8, 40, null, 130],
      ['Toluene', 18, 10, 100.2, 114.8, 20, null, 145],
      ['MIBK', 13.2, 11, 0, 0, 0, null, 180],
      ['Cyan', 16, 14.2, 18.2, 20.8, 40, null, 252],
      ['Magenta', 20, 19.2, 25.9, 30, 40, null, 252],
      ['Yellow', 26.7, 14.7, 20.4, 26.9, 40, null, 240],
      ['Black', 0, 0, 16.2, 16.5, 40, null, 230],
      ['White', 0, 0, 0, 0, 40, null, 240],
      ['Red', 0, 0, 0, 0, 40, null, 270],
      ['Medium', 23.5, 14.2, 0, 0, 40, null, 200],
      ['Orange', 0, 0, 0, 0, 40, null, 270],
      ['Dark Green', 0, 0, 19.5, 20.6, 40, null, 250],
      ['Gold', 0, 0, 0, 0, 40, null, 510],
      ['Pink', 0, 0, 0, 0, 40, null, 250],
      ['Violet', 0, 0, 0, 0, 40, null, 270],
      ['Met PET', 0, 0, 0, 0, 0, null, 135],
      ['LDPE', 222, 13, 0, 0, 0, null, 175],
      ['Adhesive (NCO)', 6.39, 0, 0, 0, 40, null, 260],
      ['Hardener (OH)', 3.86, 0, 0, 0, 5, null, 260],
      ['Ethyl Acetate (lamination)', 0, 0, 0, 0, 60, null, 135],
    ],
    labour: [
      ['office 1', 2, 730, 0.5],
      ['Office 2', 2, 570, 0.5],
      ['Operator 1', 1, 1461, 0.5],
      ['Printing operattor 2', 1, 1230, 0.5],
      ['Slitting operator 3', 1, 800, 0.5],
      ['Pouch operator', 2, 800, 0.5],
      ['helper g', 9, 600, 0.5],
      ['helper l', 1, 350, 0.5],
    ],
    overheads: {
      electricity: 2500,
      salary: 6720.5,
      transport: 2436.78,
      pouching: 2706.3,
      packaging: 100,
      emi: 5000,
      profit: 6087.144,
    },
    producedKg: 279,
    finalOutputKg: 270.63,
    pouchingWeightKg: 270.63,
    expect: {
      materialKg: 358.35,
      materialCost: 60871.44,
      basicValuePerKg: 169.87,
      effectivePrice: 86422.16,
      costPerKg: 319.34,
    },
  },
  {
    sheet: 'Samarth Atta 5kg',
    job: 'Samrtha Atta 5 kg',
    lines: [
      ['12 PET Polyester', 0, 0, 0, 0, 0, null, 149],
      ['Ethyl Acetate (printing)', 0, 0, 0, 0, 40, null, 130],
      ['Toluene', 0, 0, 0, 0, 20, null, 145],
      ['MIBK', 0, 0, 0, 0, 0, null, 180],
      ['Cyan', 0, 0, 0, 0, 40, null, 252],
      ['Magenta', 0, 0, 0, 0, 40, null, 252],
      ['Yellow', 0, 0, 0, 0, 40, null, 240],
      ['Black', 0, 0, 0, 0, 40, null, 230],
      ['White', 0, 0, 0, 0, 40, null, 240],
      ['Red', 0, 0, 0, 0, 40, null, 270],
      ['Medium', 0, 0, 0, 0, 40, null, 200],
      ['Orange', 0, 0, 0, 0, 40, null, 270],
      ['Dark Green', 0, 0, 0, 0, 40, null, 250],
      ['Gold', 0, 0, 0, 0, 40, null, 510],
      ['Pink', 0, 0, 0, 0, 40, null, 250],
      ['Violet', 0, 0, 0, 0, 40, null, 270],
      ['Met PET', 0, 0, 0, 0, 0, null, 135],
      ['LDPE', 383.4, 0, 0, 0, 0, null, 180],
      ['Adhesive (NCO)', 8.7, 0, 0, 0, 40, null, 260],
      ['Hardener (OH)', 5.25, 0, 0, 0, 5, null, 260],
      ['Ethyl Acetate (lamination)', 0, 0, 0, 0, 60, null, 135],
    ],
    labour: [
      ['office 1', 2, 576, 0.75],
      ['Office 2', 2, 550, 0.75],
      ['Operator 1', 1, 1200, 0.75],
      ['Printing operattor 2', 1, 1000, 0.75],
      ['Slitting operator 3', 1, 596, 0.75],
      ['Pouch operator', 2, 800, 0.75],
      ['helper g', 9, 540, 0.75],
      ['helper l', 1, 270, 0.75],
    ],
    overheads: {
      electricity: 4950,
      salary: 8833.5,
      transport: 2701.98,
      pouching: 4776,
      packaging: 300,
      emi: 7500,
      profit: 7263.9,
    },
    producedKg: 474.5,
    finalOutputKg: 477.6,
    pouchingWeightKg: 477.6,
    expect: {
      materialKg: 397.35,
      materialCost: 72639,
      basicValuePerKg: 182.81,
      effectivePrice: 108964.38,
      costPerKg: 228.15,
    },
  },
  {
    sheet: 'Lokraja Atta 5kg',
    job: 'Lokraja Atta 5kg',
    lines: [
      ['12 PET Polyester', 275.305, 180, 0, 0, 0, null, 149],
      ['Ethyl Acetate (printing)', 44.3, 25, 65.7, 64.8, 40, null, 130],
      ['Toluene', 19.6, 10, 65.7, 64.8, 20, null, 145],
      ['MIBK', 7.3, 6, 0, 0, 0, null, 180],
      ['Cyan', 13.1, 13.1, 21.1, 20.1, 40, null, 252],
      ['Magenta', 19, 6.7, 17.2, 22.8, 40, null, 252],
      ['Yellow', 10.5, 7.9, 27.4, 21.9, 40, null, 240],
      ['Black', 7.3, 7.3, 0, 0, 40, null, 230],
      ['White', 0, 0, 0, 0, 40, null, 240],
      ['Red', 0, 0, 0, 0, 40, null, 270],
      ['Medium', 4.5, 1.3, 0, 0, 40, null, 200],
      ['Orange', 0, 0, 0, 0, 40, null, 270],
      ['Dark Green', 0, 0, 0, 0, 40, null, 250],
      ['Gold', 0, 0, 0, 0, 40, null, 510],
      ['Pink', 0, 0, 0, 0, 40, null, 250],
      ['Violet', 0, 0, 0, 0, 40, null, 270],
      ['Met PET', 0, 0, 0, 0, 0, null, 135],
      ['LDPE', 501, 0, 0, 0, 0, null, 177],
      ['Adhesive (NCO)', 9.2, 0, 0, 0, 40, null, 260],
      ['Hardener (OH)', 5.55, 0, 0, 0, 5, null, 260],
      ['Ethyl Acetate (lamination)', 4, 0, 0, 0, 60, null, 135],
    ],
    labour: [
      ['office 1', 2, 576, 0.75],
      ['Office 2', 2, 550, 0.75],
      ['Operator 1', 1, 1200, 0.75],
      ['Printing operattor 2', 1, 1000, 0.75],
      ['Slitting operator 3', 1, 596, 0.75],
      ['Pouch operator', 2, 800, 0.75],
      ['helper g', 9, 540, 0.75],
      ['helper l', 1, 270, 0.75],
    ],
    overheads: {
      electricity: 4950,
      salary: 8833.5,
      transport: 4516.934,
      pouching: 4172.16,
      packaging: 300,
      emi: 7500,
      profit: 11588.8265,
    },
    producedKg: 526.4,
    finalOutputKg: 417.216,
    pouchingWeightKg: 417.216,
    expect: {
      materialKg: 664.255,
      materialCost: 115888.26,
      basicValuePerKg: 174.46,
      effectivePrice: 157749.69,
      costPerKg: 378.1,
    },
  },
  {
    sheet: 'Copy of Lokraja Atta 5kg',
    job: 'Lokraja Atta 5kg',
    lines: [
      ['12 PET Polyester', 275.305, 180, 0, 0, 0, null, 149],
      ['Ethyl Acetate (printing)', 44.3, 25, 65.7, 64.8, 40, null, 130],
      ['Toluene', 19.6, 10, 65.7, 64.8, 20, null, 145],
      ['MIBK', 7.3, 6, 0, 0, 0, null, 180],
      ['Cyan', 13.1, 13.1, 21.1, 20.1, 40, null, 252],
      ['Magenta', 19, 6.7, 17.2, 22.8, 40, null, 252],
      ['Yellow', 10.5, 7.9, 27.4, 21.9, 40, null, 240],
      ['Black', 7.3, 7.3, 0, 0, 40, null, 230],
      ['White', 0, 0, 0, 0, 40, null, 240],
      ['Red', 0, 0, 0, 0, 40, null, 270],
      ['Medium', 4.5, 1.3, 0, 0, 40, null, 200],
      ['Orange', 0, 0, 0, 0, 40, null, 270],
      ['Dark Green', 0, 0, 0, 0, 40, null, 250],
      ['Gold', 0, 0, 0, 0, 40, null, 510],
      ['Pink', 0, 0, 0, 0, 40, null, 250],
      ['Violet', 0, 0, 0, 0, 40, null, 270],
      ['Met PET', 0, 0, 0, 0, 0, null, 135],
      ['LDPE', 501, 72, 0, 0, 0, null, 177],
      ['Adhesive (NCO)', 9.2, 0, 0, 0, 40, null, 260],
      ['Hardener (OH)', 5.55, 0, 0, 0, 5, null, 260],
      ['Ethyl Acetate (lamination)', 4, 0, 0, 0, 60, null, 135],
    ],
    labour: [
      ['office 1', 2, 576, 0.75],
      ['Office 2', 2, 550, 0.75],
      ['Operator 1', 1, 1200, 0.75],
      ['Printing operattor 2', 1, 1000, 0.75],
      ['Slitting operator 3', 1, 596, 0.75],
      ['Pouch operator', 2, 800, 0.75],
      ['helper g', 9, 540, 0.75],
      ['helper l', 1, 270, 0.75],
    ],
    overheads: {
      electricity: 4950,
      salary: 8833.5,
      transport: 4027.334,
      pouching: 4172.16,
      packaging: 300,
      emi: 7500,
      profit: 10314.4265,
    },
    producedKg: 526.4,
    finalOutputKg: 417.216,
    pouchingWeightKg: 417.216,
    expect: {
      materialKg: 592.255,
      materialCost: 103144.26,
      basicValuePerKg: 174.16,
      effectivePrice: 143241.69,
      costPerKg: 343.33,
    },
  },
  {
    sheet: 'Copy of Radhey Bhadan 200g',
    job: 'Radhey Bhadang 200g',
    lines: [
      ['12 PET Polyester', 91, 31.4, 0, 0, 0, null, 149],
      ['Ethyl Acetate (printing)', 61.6, 50, 99.4, 92.9, 40, null, 130],
      ['Toluene', 16.5, 11.95, 99.4, 92.9, 20, null, 145],
      ['MIBK', 6, 6, 0, 0, 0, null, 180],
      ['Cyan', 3.5, 1, 0, 0, 40, null, 252],
      ['Magenta', 0, 0, 0, 0, 40, null, 252],
      ['Yellow', 20, 16.64, 0, 0, 40, null, 240],
      ['Black', 0, 0, 0, 0, 40, null, 230],
      ['White', 6, 3, 32, 22.6, 40, null, 240],
      ['Red', 0, 0, 0, 0, 40, null, 270],
      ['Medium', 1.8, 0.54, 0, 0, 40, null, 200],
      ['Orange', 0, 0, 26.8, 28.3, 40, null, 270],
      ['Dark Green', 0, 0, 20.9, 21.1, 40, null, 250],
      ['Gold', 0, 0, 0, 0, 40, null, 510],
      ['Pink', 0, 0, 0, 0, 40, null, 250],
      ['Violet', 9, 7.8, 19.7, 20.9, 40, null, 270],
      ['Met PET', 0, 0, 0, 0, 0, null, 135],
      ['LDPE', 138.9, 0, 0, 0, 0, null, 160],
      ['Adhesive (NCO)', 5.69, 0, 0, 0, 40, null, 260],
      ['Hardener (OH)', 3.44, 0, 0, 0, 5, null, 260],
      ['Ethyl Acetate (lamination)', 0, 0, 0, 0, 60, null, 135],
    ],
    labour: [
      ['office 1', 2, 576, 0.75],
      ['Office 2', 2, 550, 0.75],
      ['Operator 1', 1, 1200, 0.75],
      ['Printing operattor 2', 1, 1000, 0.75],
      ['Slitting operator 3', 1, 596, 0.75],
      ['Pouch operator', 0, 800, 0.75],
      ['helper g', 6, 540, 0.75],
      ['helper l', 1, 270, 0.75],
    ],
    overheads: {
      electricity: 4950,
      salary: 6418.5,
      transport: 1642.88,
      pouching: 0,
      packaging: 300,
      emi: 7500,
      profit: 0,
    },
    producedKg: 205,
    finalOutputKg: 198.85,
    pouchingWeightKg: 0,
    expect: {
      materialKg: 241.6,
      materialCost: 39495.65,
      basicValuePerKg: 163.48,
      effectivePrice: 60307.03,
      costPerKg: 303.28,
    },
  },
];

const line = ([
  name,
  issuedKg,
  returnedKg,
  mixIssuedKg,
  mixReturnedKg,
  mixSharePercent,
  consumedOverrideKg,
  ratePerKg,
]: Line): JobSheetLineInput => ({
  name,
  issuedKg,
  returnedKg,
  mixIssuedKg,
  mixReturnedKg,
  mixSharePercent,
  consumedOverrideKg,
  ratePerKg,
});

/**
 * The sheet as this module sees it.
 *
 * The overheads are passed as overrides, which is exactly what they are on the
 * spreadsheet: each of the seven is a figure the office settled — some by
 * formula, some typed over it, and the formulas themselves changed between
 * March and September. Feeding the settled figures in is what isolates this
 * test to the thing it is testing, which is the costing, not the works'
 * electricity policy. The policy has tests of its own below.
 */
const inputFor = (sheet: Sheet): JobSheetCostInput => ({
  lines: sheet.lines.map(line),
  electricityPerDay: 0,
  stages: [],
  labour: sheet.labour.map(([role, headcount, ratePerDay, days]) => ({
    role,
    headcount,
    ratePerDay,
    days,
  })),
  transportPerKg: 0,
  pouchingPerKg: 10,
  pouchingWeightKg: sheet.pouchingWeightKg,
  packagingCost: 0,
  emiPerDay: 0,
  emiDays: 0,
  profitPercent: 10,
  overrides: sheet.overheads,
  producedKg: sheet.producedKg,
  finalOutputKg: sheet.finalOutputKg,
  expectedWastagePercent: 5,
});

describe('the works’ own job sheets', () => {
  it('has all fourteen of them', () => {
    expect(SHEETS).toHaveLength(14);
  });

  for (const sheet of SHEETS) {
    describe(sheet.sheet, () => {
      const cost = costJobSheet(inputFor(sheet));

      it('consumes the same kilograms', () => {
        expect(cost.materialKg).toBeCloseTo(sheet.expect.materialKg, 2);
      });

      it('reaches the same basic cost, to the paisa', () => {
        expect(paiseApart(cost.materialCost, sheet.expect.materialCost)).toBeLessThanOrEqual(1);
      });

      it('reaches the same basic value a kilogram', () => {
        expect(cost.basicValuePerKg).toBeCloseTo(sheet.expect.basicValuePerKg, 2);
      });

      it('reaches the same effective price, to the paisa', () => {
        expect(paiseApart(cost.effectivePrice, sheet.expect.effectivePrice)).toBeLessThanOrEqual(1);
      });

      it('reaches the same cost a kilogram', () => {
        expect(cost.costPerKg).toBeCloseTo(sheet.expect.costPerKg, 2);
      });
    });
  }
});

/**
 * **The mix drum, booked back to what is in it.**
 *
 * Nothing goes to the press as bought. A colour is mixed 40% pigment, 40% ethyl
 * acetate, 20% toluene, and the sheet books each drum back to its three
 * ingredients — so the ethyl line carries what was drawn neat *plus* two fifths
 * of every drum mixed that day.
 */
describe('a line that draws from a mix', () => {
  const neat = (over: Partial<JobSheetLineInput> = {}): JobSheetLineInput => ({
    name: 'Ethyl Acetate',
    issuedKg: 80,
    returnedKg: 20,
    mixIssuedKg: 0,
    mixReturnedKg: 0,
    mixSharePercent: 0,
    consumedOverrideKg: null,
    ratePerKg: 130,
    ...over,
  });

  it('is issued minus returned when nothing is mixed', () => {
    expect(consumedKg(neat())).toBe(60);
  });

  it('adds its share of the drum', () => {
    // 60 neat, plus 40% of (100 - 40) mixed.
    expect(consumedKg(neat({ mixIssuedKg: 100, mixReturnedKg: 40, mixSharePercent: 40 }))).toBe(84);
  });

  /*
   * The works' three printing shares come to 100% and the three lamination
   * shares to 105%. That is their recipe and it is left alone — a recipe is a
   * fact about a process, not an identity that has to sum, and "correcting" it
   * would move every lamination cost the office has ever signed off.
   */
  it('takes the share it is given, whatever the recipe adds up to', () => {
    const adhesive = consumedKg(
      neat({ issuedKg: 0, returnedKg: 0, mixIssuedKg: 100, mixReturnedKg: 0, mixSharePercent: 40 }),
    );
    const hardener = consumedKg(
      neat({ issuedKg: 0, returnedKg: 0, mixIssuedKg: 100, mixReturnedKg: 0, mixSharePercent: 5 }),
    );
    const ethyl = consumedKg(
      neat({ issuedKg: 0, returnedKg: 0, mixIssuedKg: 100, mixReturnedKg: 0, mixSharePercent: 60 }),
    );
    expect(adhesive + hardener + ethyl).toBe(105);
  });

  /**
   * A drum that came back fuller than it went out.
   *
   * It happens when a colour is topped up from a previous job's leftovers, and
   * the works' September sheets carry several — Dark Green at −3.2 kg on one of
   * them. The figure is a correction to the earlier job, and flooring it at
   * zero would charge this job for ink it gave back.
   */
  it('lets a topped-up drum read negative', () => {
    expect(consumedKg(neat({ issuedKg: 18, returnedKg: 26, mixSharePercent: 0 }))).toBe(-8);
  });
});

/**
 * **The typed figure wins.**
 *
 * Two of the fourteen sheets have a number sitting on top of a formula. The
 * person who typed it was holding the drum; the formula was not.
 */
describe('a consumption the office corrected', () => {
  const white: JobSheetLineInput = {
    name: 'White',
    issuedKg: 35,
    returnedKg: 11.2,
    mixIssuedKg: 16.2,
    mixReturnedKg: 16.9,
    mixSharePercent: 40,
    consumedOverrideKg: 14.5,
    ratePerKg: 240,
  };

  it('costs the typed figure, not the computed one', () => {
    const [costed] = costJobSheet({ ...inputFor(SHEETS[0]!), lines: [white] }).lines;
    expect(costed!.computedKg).toBeCloseTo(23.52, 4);
    expect(costed!.consumedKg).toBe(14.5);
    expect(costed!.amount).toBe(3480);
    expect(costed!.isOverridden).toBe(true);
  });

  /* Rs 2,164.80 on one line of one job — which is why it is not rounded away. */
  it('is worth the difference the works’ sheet is worth', () => {
    const computed = costJobSheet({
      ...inputFor(SHEETS[0]!),
      lines: [{ ...white, consumedOverrideKg: null }],
    });
    const typed = costJobSheet({ ...inputFor(SHEETS[0]!), lines: [white] });
    expect(computed.materialCost - typed.materialCost).toBeCloseTo(2164.8, 2);
  });

  it('keeps the computed figure beside it, so the correction is visible', () => {
    const [costed] = costJobSheet({ ...inputFor(SHEETS[0]!), lines: [white] }).lines;
    expect(costed!.computedKg).not.toBe(costed!.consumedKg);
  });

  it('is not an override when nobody set one', () => {
    const [costed] = costJobSheet({
      ...inputFor(SHEETS[0]!),
      lines: [{ ...white, consumedOverrideKg: null }],
    }).lines;
    expect(costed!.isOverridden).toBe(false);
    expect(costed!.consumedKg).toBe(costed!.computedKg);
  });
});

/**
 * **The meter, shared out by stage.**
 *
 * A day's electricity is one bill for the whole works, divided between the
 * machines — so the shares add up to 100. The works' own spreadsheet splits it
 * 60 / 20 / 20 / 10 / 10, which comes to 120 and charges a job for a fifth more
 * electricity than the day cost; the works confirmed 100 is what was meant.
 *
 * The engine takes whatever share it is given and does not police the total,
 * which is what lets the tests below reproduce the works' own sheets at their
 * own figures. The 100 is enforced where the decision lives — on the defaults a
 * new sheet starts from.
 *
 * What keeps the bill honest beyond the shares is `days`: a stage that did not
 * run is zero days and costs nothing. On a roll job, pouching is exactly that.
 */
describe('electricity', () => {
  const perDay = 6000;

  it('charges a stage its share of the days it ran', () => {
    expect(
      stageElectricity({ stage: 'PRINTING', sharePercent: 60, days: 1, shifts: 1 }, perDay),
    ).toBe(3600);
  });

  it('charges nothing for a stage that did not run', () => {
    expect(
      stageElectricity({ stage: 'POUCHING', sharePercent: 10, days: 0, shifts: 1 }, perDay),
    ).toBe(0);
  });

  /* Pouching routinely runs two shifts, and the meter runs with it. */
  it('multiplies by the shifts worked', () => {
    expect(
      stageElectricity({ stage: 'POUCHING', sharePercent: 10, days: 0.75, shifts: 2 }, perDay),
    ).toBe(900);
  });

  /*
   * The works' Samarth Atta sheet: 2700 + 900 + 450 + 900 = 4950, at ITS shares
   * rather than the app's. A sheet is costed at the shares stored on it, so a
   * sheet entered before the total was corrected still reads as it was costed.
   */
  it('adds up to the figure on the works’ own sheet, at the works’ own shares', () => {
    const cost = costJobSheet({
      ...inputFor(SHEETS[0]!),
      lines: [],
      electricityPerDay: 6000,
      stages: [
        { stage: 'PRINTING', sharePercent: 60, days: 0.75, shifts: 1 },
        { stage: 'LAMINATION_1', sharePercent: 20, days: 0.75, shifts: 1 },
        { stage: 'LAMINATION_2', sharePercent: 20, days: 0, shifts: 1 },
        { stage: 'SLITTING', sharePercent: 10, days: 0.75, shifts: 1 },
        { stage: 'POUCHING', sharePercent: 10, days: 0.75, shifts: 2 },
      ],
      overrides: {},
    });
    expect(cost.electricityCost).toBe(4950);
  });
});

describe('wages', () => {
  it('are a rate a day, by heads, by days', () => {
    expect(labourAmount({ role: 'helper g', headcount: 9, ratePerDay: 540, days: 0.75 })).toBe(
      3645,
    );
  });

  it('cost nothing for a role nobody filled', () => {
    expect(labourAmount({ role: 'Pouch operator', headcount: 0, ratePerDay: 800, days: 1 })).toBe(
      0,
    );
  });
});

/**
 * **Profit is taken on the material, not on the works' own overheads.**
 *
 * It reads like an oversight in the spreadsheet and it is not one. Charging the
 * ten per cent on the electricity and the wages as well would take a margin on
 * the works' cost of being open, which is a different and larger number.
 */
describe('the margin', () => {
  const base: JobSheetCostInput = {
    lines: [
      {
        name: 'LDPE',
        issuedKg: 100,
        returnedKg: 0,
        mixIssuedKg: 0,
        mixReturnedKg: 0,
        mixSharePercent: 0,
        consumedOverrideKg: null,
        ratePerKg: 100,
      },
    ],
    electricityPerDay: 0,
    stages: [],
    labour: [],
    transportPerKg: 0,
    pouchingPerKg: 0,
    pouchingWeightKg: 0,
    packagingCost: 5000,
    emiPerDay: 0,
    emiDays: 0,
    profitPercent: 10,
    producedKg: 100,
    finalOutputKg: 100,
    expectedWastagePercent: 5,
  };

  it('is a percentage of the material alone', () => {
    // Rs 10,000 of material and Rs 5,000 of packaging: the margin is 1,000.
    expect(costJobSheet(base).profit).toBe(1000);
  });

  it('is not a percentage of what the job cost in total', () => {
    expect(costJobSheet(base).profit).not.toBe(1500);
  });
});

describe('transport', () => {
  /*
   * A rupees-a-kilogram charge on the material BROUGHT IN, not on the finished
   * goods going out. A job that wastes half its film paid to bring all of it.
   */
  it('is charged on every kilogram consumed, waste included', () => {
    const cost = costJobSheet({
      ...(SHEETS[0]!.lines.length ? {} : {}),
      lines: [
        {
          name: 'PET',
          issuedKg: 200,
          returnedKg: 50,
          mixIssuedKg: 0,
          mixReturnedKg: 0,
          mixSharePercent: 0,
          consumedOverrideKg: null,
          ratePerKg: 149,
        },
      ],
      electricityPerDay: 0,
      stages: [],
      labour: [],
      transportPerKg: 6.8,
      pouchingPerKg: 0,
      pouchingWeightKg: 0,
      packagingCost: 0,
      emiPerDay: 0,
      emiDays: 0,
      profitPercent: 0,
      producedKg: 120,
      finalOutputKg: 120,
      expectedWastagePercent: 5,
    });
    expect(cost.transportCost).toBeCloseTo(150 * 6.8, 2);
  });
});

/**
 * **The wastage check, which is the reason the office fills the sheet in.**
 *
 * The works allows itself 5% between good laminate off the machine and packed
 * goods. What it wants to know is what the rest cost — so the excess is valued
 * at this job's own cost a kilogram, the one the sheet has just worked out.
 */
describe('wastage', () => {
  const radhey = SHEETS.find((s) => s.sheet === 'Radhey Murmura 16.09.2026')!;
  const cost = costJobSheet(inputFor(radhey));

  it('allows five per cent of what came off the machine', () => {
    expect(cost.expectedWastageKg).toBeCloseTo(1059 * 0.05, 3);
  });

  it('counts what was actually lost between the machine and the pack', () => {
    expect(cost.actualWastageKg).toBeCloseTo(1059 - 1027, 3);
  });

  it('states it as a percentage of what was packed', () => {
    expect(cost.wastagePercent).toBeCloseTo(3.12, 2);
  });

  /*
   * Under the allowance here, so the excess is a credit rather than a charge —
   * and it is valued at the UNROUNDED cost a kilogram, as the works' sheet
   * does, which is why this is not simply the rounded figure times the gap.
   */
  it('values the excess at this job’s own cost a kilogram', () => {
    expect(cost.excessCost).toBeCloseTo(-5476.88, 2);
  });
});

describe('a sheet with nothing on it yet', () => {
  const empty: JobSheetCostInput = {
    lines: [],
    electricityPerDay: 0,
    stages: [],
    labour: [],
    transportPerKg: 0,
    pouchingPerKg: 0,
    pouchingWeightKg: 0,
    packagingCost: 0,
    emiPerDay: 0,
    emiDays: 0,
    profitPercent: 10,
    producedKg: 0,
    finalOutputKg: 0,
    expectedWastagePercent: 5,
  };

  /* Zero, not a division by nothing. A half-filled sheet is the normal state
     of a job sheet for most of the day it is open. */
  it('costs nothing a kilogram rather than failing', () => {
    const cost = costJobSheet(empty);
    expect(cost.costPerKg).toBe(0);
    expect(cost.basicValuePerKg).toBe(0);
    expect(Number.isFinite(cost.effectivePrice)).toBe(true);
  });
});

/**
 * **Which drum a line draws from — the easiest thing here to get backwards.**
 *
 * Each colour is mixed separately, so an ink takes a share of its own drum and
 * nothing of anybody else's. The solvents have no per-colour figure to take:
 * the ethyl acetate that went into every drum that day is booked back as one
 * share of the pooled total.
 *
 * Swap the two and a seven-colour job books seven times the solvent — plausible
 * on one sheet and absurd across a year of them.
 */
describe('the drum a line draws from', () => {
  const pools = {
    printMixIssuedKg: 124,
    printMixReturnedKg: 107.2,
    lamMixIssuedKg: 40,
    lamMixReturnedKg: 10,
  };

  it('gives an ink its own drum', () => {
    expect(
      mixDrumFor({ kind: 'INK', section: 'PRINTING', mixIssuedKg: 21, mixReturnedKg: 15.5 }, pools),
    ).toEqual({ issued: 21, returned: 15.5 });
  });

  it('gives a printing solvent the pooled drum, not its own row', () => {
    expect(
      mixDrumFor(
        { kind: 'SOLVENT', section: 'PRINTING', mixIssuedKg: 999, mixReturnedKg: 999 },
        pools,
      ),
    ).toEqual({ issued: 124, returned: 107.2 });
  });

  it('gives a lamination line the lamination pool', () => {
    expect(
      mixDrumFor(
        { kind: 'ADHESIVE', section: 'LAMINATION', mixIssuedKg: 0, mixReturnedKg: 0 },
        pools,
      ),
    ).toEqual({ issued: 40, returned: 10 });
  });

  /* Film is used exactly as bought, and its share is zero either way. */
  it('gives a film the pool it will not use', () => {
    const drum = mixDrumFor(
      { kind: 'FILM', section: 'PRINTING', mixIssuedKg: 0, mixReturnedKg: 0 },
      pools,
    );
    expect(
      consumedKg({
        name: 'PET',
        issuedKg: 507.55,
        returnedKg: 210,
        mixIssuedKg: drum.issued,
        mixReturnedKg: drum.returned,
        mixSharePercent: 0,
        consumedOverrideKg: null,
        ratePerKg: 170,
      }),
    ).toBeCloseTo(297.55, 4);
  });
});

/**
 * **The shares a new sheet starts from add up to one day.**
 *
 * This is the assertion the works asked for. Their spreadsheet splits the meter
 * 60 / 20 / 20 / 10 / 10 — 120 in total — which charges every job a fifth more
 * electricity than the day actually cost. On the Radhey Murmura sheet that is
 * Rs 900 of a Rs 2.68 lakh job, and it is in every job they have ever costed
 * this way.
 *
 * The defaults are that same weighting rescaled rather than a new split: the
 * relative draw of each machine is the works' own knowledge and was never in
 * question, only the total. A test rather than a comment, because a share is
 * exactly the kind of number somebody nudges one day for one job.
 */
describe('the stage shares a new sheet starts with', () => {
  it('add up to one whole day, and no more', () => {
    const total = JOB_SHEET_STAGE_DEFAULTS.reduce((sum, stage) => sum + stage.sharePercent, 0);
    expect(Number(total.toFixed(3))).toBe(JOB_SHEET_STAGE_SHARE_TOTAL);
  });

  it('keeps the works’ own weighting between the machines', () => {
    const share = (stage: string) =>
      JOB_SHEET_STAGE_DEFAULTS.find((s) => s.stage === stage)!.sharePercent;
    /* Printing draws three times a lamination pass, and six times slitting. */
    expect(share('PRINTING') / share('LAMINATION_1')).toBeCloseTo(3, 3);
    expect(share('PRINTING') / share('SLITTING')).toBeCloseTo(6, 3);
    expect(share('LAMINATION_1')).toBe(share('LAMINATION_2'));
  });

  /* Pouching runs two shifts; the other four run one. */
  it('runs pouching twice a day and nothing else', () => {
    const twoShifts = JOB_SHEET_STAGE_DEFAULTS.filter((stage) => stage.shifts > 1);
    expect(twoShifts.map((stage) => stage.stage)).toEqual(['POUCHING']);
  });

  it('covers every stage exactly once', () => {
    expect(JOB_SHEET_STAGE_DEFAULTS.map((stage) => stage.stage)).toEqual([...JOB_SHEET_STAGES]);
  });
});
