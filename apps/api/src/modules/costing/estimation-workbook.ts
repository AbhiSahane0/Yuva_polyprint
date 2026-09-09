import ExcelJS from 'exceljs';
import { MACHINE_KIND_LABELS, type CostingBreakdown, type CostingInput } from '@yuva/shared';

/**
 * The costing, as the works' own Estimation sheet lays it out.
 *
 * Not a report about the calculation — the calculation, in the shape the
 * office already reads. They have costed on "3. Anupriya.xlsx" for years and
 * check quotations against it, so a download that arrives in a different
 * layout is one they have to learn before they can use it. The row order, the
 * headings and the wording are the sheet's.
 *
 * Live formulas, not pasted values. A works that wants to try a different wage
 * or a different film rate can do it in the downloaded copy and watch the
 * total move, which is exactly what they do today.
 */

const SHEET = 'Estimation';

/** Their yellow. The sheet says "Edit in Yellow colours cells only". */
const INPUT_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFFFF00' },
};

const THIN: Partial<ExcelJS.Borders> = {
  top: { style: 'thin' },
  left: { style: 'thin' },
  bottom: { style: 'thin' },
  right: { style: 'thin' },
};

export interface WorkbookContext {
  quotationNumber?: number | null;
  customerName: string;
  jobName: string;
  date: Date;
}

export async function buildEstimationWorkbook(
  input: CostingInput,
  result: CostingBreakdown,
  context: WorkbookContext,
): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  book.creator = 'Yuva Polyprint ERP';
  book.created = context.date;

  const sheet = book.addWorksheet(SHEET, {
    views: [{ showGridLines: false }],
  });

  sheet.columns = [
    { width: 34 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 16 },
    { width: 16 },
    { width: 30 },
  ];

  /** One labelled figure, with the label in A and the value where asked. */
  const put = (
    row: number,
    column: number,
    value: ExcelJS.CellValue,
    options: { bold?: boolean; input?: boolean; format?: string; note?: string } = {},
  ) => {
    const cell = sheet.getCell(row, column);
    cell.value = value;
    if (options.bold) cell.font = { bold: true };
    if (options.input) {
      cell.fill = INPUT_FILL;
      cell.border = THIN;
    }
    if (options.format) cell.numFmt = options.format;
    if (options.note) sheet.getCell(row, column + 1).value = options.note;
    return cell;
  };

  const RS = '#,##0.00';
  const N3 = '#,##0.000';

  /* ---- heading ---------------------------------------------------------- */
  put(1, 1, 'Edit in Yellow colours cells only', { bold: true });
  put(1, 5, 'Profit Margin in %');
  put(1, 6, input.overheads.marginPercent / 100, { input: true, format: '0%' });
  put(1, 8, 'Date');
  put(1, 9, context.date, { format: 'dd-mm-yyyy' });

  put(3, 1, 'Party name');
  put(3, 2, context.customerName, { input: true });
  put(4, 1, 'Job Name');
  put(4, 2, context.jobName, { input: true });
  if (context.quotationNumber) {
    put(5, 1, 'Quotation');
    put(5, 2, context.quotationNumber);
  }

  /* ---- the job ---------------------------------------------------------- */
  put(7, 1, 'Order Qty. Kg.');
  const orderQty = put(7, 2, input.job.orderQtyKg, { input: true, format: N3 });
  put(7, 5, 'Westage % in kg.');
  const wastagePct = put(7, 6, input.job.wastagePercent / 100, { input: true, format: '0%' });
  put(8, 5, 'Total Qty. used in kg.');
  const consumed = sheet.getCell(8, 6);
  consumed.value = { formula: `${orderQty.address}*(1+${wastagePct.address})` };
  consumed.numFmt = N3;

  put(8, 1, 'UPS');
  const ups = put(8, 2, input.job.ups, { input: true });
  put(9, 1, 'Trim - mm');
  const trim = put(9, 2, input.job.trimMm, { input: true });
  put(10, 1, 'Photocell — Width mm');
  const width = put(10, 2, input.job.filmWidthMm, { input: true });
  put(11, 1, 'Photocell — Height mm');
  const height = put(11, 2, input.job.filmHeightMm, { input: true });
  put(12, 1, 'Total Width mm');
  const totalWidth = sheet.getCell(12, 2);
  totalWidth.value = { formula: `${width.address}*${ups.address}+${trim.address}` };

  /* ---- structure -------------------------------------------------------- */
  let row = 14;
  const header = (cells: string[]) => {
    cells.forEach((text, offset) => {
      const cell = sheet.getCell(row, offset + 1);
      cell.value = text;
      cell.font = { bold: true };
      cell.border = THIN;
    });
    row += 1;
  };

  header(['MATERIAL', 'MICRON', 'DENCITY', 'GSM']);
  const gsmCells: string[] = [];
  for (const layer of result.layers) {
    put(row, 1, layer.name);
    const micron = put(row, 2, layer.micron, { input: true });
    const density = put(row, 3, layer.density, { input: true });
    const gsm = sheet.getCell(row, 4);
    gsm.value = { formula: `${micron.address}*${density.address}` };
    gsm.numFmt = N3;
    gsmCells.push(gsm.address);
    row += 1;
  }

  put(row, 1, 'ADHESIVE');
  const adhesiveGsm = put(row, 4, result.adhesiveGsm, { input: true, format: N3 });
  gsmCells.push(adhesiveGsm.address);
  row += 1;

  put(row, 1, 'INK');
  const inkGsm = put(row, 4, result.inkGsm, { input: true, format: N3 });
  gsmCells.push(inkGsm.address);
  row += 1;

  put(row, 1, 'TOTAL GSM', { bold: true });
  const totalGsm = sheet.getCell(row, 4);
  totalGsm.value = { formula: `SUM(${gsmCells.join(',')})` };
  totalGsm.numFmt = N3;
  totalGsm.font = { bold: true };
  const totalGsmRef = totalGsm.address;
  row += 2;

  /* ---- what a pouch weighs ---------------------------------------------- */
  put(row, 1, '1 Pouch Wt. (g)');
  const pieceWeight = sheet.getCell(row, 2);
  pieceWeight.value = {
    formula: `${width.address}*${height.address}*${totalGsmRef}/1000000`,
  };
  pieceWeight.numFmt = N3;
  row += 1;
  put(row, 1, 'Pouches in 1 kg.');
  const piecesPerKg = sheet.getCell(row, 2);
  piecesPerKg.value = { formula: `1000/${pieceWeight.address}` };
  piecesPerKg.numFmt = RS;
  row += 1;
  put(row, 1, 'Total Pouches');
  sheet.getCell(row, 2).value = {
    formula: `${piecesPerKg.address}*${orderQty.address}`,
  };
  row += 2;

  /* ---- process table ---------------------------------------------------- */
  header([
    'Total Reqd. Material',
    'Quantity in kg.',
    'Quantity in Mtr.',
    'Material Rate in Rs.',
    'Material Cost',
    'Machine Speed',
    'Machine Run Time',
    'Setting*Cleanning',
    'Electricity Cost',
  ]);

  const materialCostCells: string[] = [];
  result.layers.forEach((layer, index) => {
    const process = result.processes[index];
    put(row, 1, index === 0 ? 'PRINTING' : `LAMINATION ${index}`);
    put(row, 2, layer.quantityKg, { format: N3 });
    put(row, 3, layer.metres, { format: RS });
    const rate = put(row, 4, layer.ratePerKg, { input: true, format: RS });
    const cost = sheet.getCell(row, 5);
    cost.value = { formula: `B${row}*${rate.address}` };
    cost.numFmt = RS;
    materialCostCells.push(cost.address);
    if (process) {
      put(row, 6, process.speedMPerMin, { input: true });
      put(row, 7, process.runMinutes, { format: RS });
      put(row, 8, process.setupMinutes, { input: true });
      put(row, 9, process.electricityCost, { format: RS });
    }
    row += 1;
  });

  const slitting = result.processes.find((process) => process.kind === 'SLITTING');
  if (slitting) {
    put(row, 1, 'SLITTING');
    put(row, 6, slitting.speedMPerMin, { input: true });
    put(row, 7, slitting.runMinutes, { format: RS });
    put(row, 8, slitting.setupMinutes, { input: true });
    put(row, 9, slitting.electricityCost, { format: RS });
    row += 1;
  }

  put(row, 1, 'ADHESIVE');
  put(row, 2, (result.adhesiveGsm / result.totalGsm) * result.consumedKg, { format: N3 });
  put(row, 5, result.adhesiveCost, { format: RS });
  materialCostCells.push(`E${row}`);
  row += 1;

  put(row, 1, 'INK');
  put(row, 2, (result.inkGsm / result.totalGsm) * result.consumedKg, { format: N3 });
  put(row, 5, result.inkCost, { format: RS });
  materialCostCells.push(`E${row}`);
  row += 1;

  put(row, 1, 'Material Cost - Total', { bold: true });
  const materialTotal = sheet.getCell(row, 5);
  materialTotal.value = { formula: `SUM(${materialCostCells.join(',')})` };
  materialTotal.numFmt = RS;
  materialTotal.font = { bold: true };
  row += 2;

  /* ---- labour ----------------------------------------------------------- */
  header(['Labour Cost', 'Monthly Salary', 'Per day', '1 Hour Cost', '1 Minute Cost', 'Cost']);
  const perMinute = input.overheads.workingDaysPerMonth * input.overheads.hoursPerDay * 60;
  const labourCells: string[] = [];
  for (const person of input.labour) {
    const process = result.processes.find((entry) => entry.kind === person.process);
    const minutes = process ? process.runMinutes + process.setupMinutes : 0;
    put(row, 1, `${person.role} (${MACHINE_KIND_LABELS[person.process]})`);
    const salary = put(row, 2, person.monthlySalary, { input: true, format: RS });
    sheet.getCell(row, 3).value = {
      formula: `${salary.address}/${input.overheads.workingDaysPerMonth}`,
    };
    sheet.getCell(row, 4).value = { formula: `C${row}/${input.overheads.hoursPerDay}` };
    sheet.getCell(row, 5).value = { formula: `D${row}/60` };
    const cost = sheet.getCell(row, 6);
    cost.value = { formula: `E${row}*${minutes}` };
    cost.numFmt = RS;
    labourCells.push(cost.address);
    row += 1;
  }
  void perMinute;

  put(row, 1, 'Transportation');
  put(row, 2, input.overheads.transportPerKg, { input: true, format: RS });
  const transport = sheet.getCell(row, 6);
  transport.value = { formula: `B${row}*${consumed.address}` };
  transport.numFmt = RS;
  labourCells.push(transport.address);
  row += 1;

  put(row, 1, 'Packing Charges');
  put(row, 2, input.overheads.packingPerKg, { input: true, format: RS });
  const packing = sheet.getCell(row, 6);
  packing.value = { formula: `B${row}*${consumed.address}` };
  packing.numFmt = RS;
  labourCells.push(packing.address);
  row += 1;

  put(row, 1, 'Other');
  const other = put(row, 6, input.overheads.otherPerJob, { input: true, format: RS });
  labourCells.push(other.address);
  row += 1;

  put(row, 1, 'Bank EMI');
  const emi = put(row, 6, result.emiCost, { format: RS });
  labourCells.push(emi.address);
  row += 2;

  /* ---- the totals, in the sheet's own A B C D E ------------------------- */
  const summary = (label: string, letter: string, value: ExcelJS.CellValue, bold = false) => {
    put(row, 1, label, { bold });
    put(row, 5, letter, { bold: true });
    const cell = sheet.getCell(row, 6);
    cell.value = value;
    cell.numFmt = RS;
    if (bold) cell.font = { bold: true };
    row += 1;
    return cell;
  };

  const utility = summary(' Labour, Utility, Transportation, packing & EMI Cost - Total', 'A', {
    formula: `SUM(${labourCells.join(',')})`,
  });
  const material = summary(' Material Cost - Total', 'B', {
    formula: `${materialTotal.address}`,
  });
  const inkTotal = summary(' Ink Cost - Total', 'C', 0);
  const electricity = summary(' Electricity Cost - Total', 'D', result.electricityCost);
  const margin = summary(' Profit Margin Cost', 'E', {
    formula:
      input.overheads.marginBasis === 'MATERIAL_ONLY'
        ? `${material.address}*$F$1`
        : `(${utility.address}+${material.address}+${electricity.address})*$F$1`,
  });
  const withMargin = summary(
    ' Cost With Profit Margin',
    'A+B+C+D+E',
    {
      formula: `SUM(${utility.address},${material.address},${inkTotal.address},${electricity.address},${margin.address})`,
    },
    true,
  );

  put(row, 1, ' 1 Kg Cost', { bold: true });
  const perKg = sheet.getCell(row, 6);
  perKg.value = { formula: `${withMargin.address}/${orderQty.address}` };
  perKg.numFmt = RS;
  perKg.font = { bold: true };
  row += 1;

  put(row, 1, ' Extra Cost Per Colour Per Printing Station');
  const stations = put(row, 6, result.stationSurchargePerKg, { format: RS });
  row += 1;

  put(row, 1, 'Cost for pouch making/kg');
  const pouching = put(row, 6, result.pouchMakingPerKg, { input: true, format: RS });
  row += 1;

  put(row, 1, 'Calculated Final Cost ', { bold: true });
  const final = sheet.getCell(row, 6);
  final.value = {
    formula: `SUM(${perKg.address},${stations.address},${pouching.address})`,
  };
  final.numFmt = RS;
  final.font = { bold: true, size: 12 };
  row += 1;

  put(row, 1, 'Per Pouch Cost', { bold: true });
  const perPouch = sheet.getCell(row, 6);
  perPouch.value = { formula: `${final.address}/${piecesPerKg.address}` };
  perPouch.numFmt = RS;
  perPouch.font = { bold: true };

  /* And the headline where the sheet keeps it. */
  put(1, 3, 'Final Rate/kg', { bold: true });
  const headline = sheet.getCell(1, 4);
  headline.value = { formula: `${final.address}` };
  headline.numFmt = RS;
  headline.font = { bold: true };

  const buffer = await book.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
