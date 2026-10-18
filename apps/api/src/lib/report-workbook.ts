import ExcelJS from 'exceljs';

/**
 * **Any list on any screen, as a spreadsheet.**
 *
 * The works asked for this on every page, and the reason is the same every
 * time: a figure that can only be read on a screen is a figure that cannot be
 * taken to a meeting, pinned up by the machine, sent to an accountant or
 * checked against last month's. "Print today's rates" is not a reporting
 * feature, it is how the office works.
 *
 * One builder rather than one per page, so a column added to a screen is a
 * column added to its download, and so every download looks the same. What
 * each page supplies is its columns and its rows; everything about the way
 * the file looks lives here.
 *
 * **What was on screen is what downloads.** The export runs the same query the
 * list ran, with the same filters — a search, a date, a status — and says so in
 * the header, so a file nobody can place is not left lying about. It is not
 * paginated: the screen shows 25, the file holds the lot.
 */

/** Arial throughout: the office opens these in whatever it has. */
const FONT = 'Arial';

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1F2937' },
};

const THIN: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
};

/**
 * How a column is written out.
 *
 * `rs`, `kg` and the rest are number FORMATS, not strings — the file holds the
 * number and Excel renders it, so the office can sort a column of money and
 * total a column of weights. A rate written as "Rs. 1,234.00" is text, and a
 * column of text does not add up, which is the first thing anybody tries.
 */
export type ReportFormat = 'text' | 'number' | 'rs' | 'rs2' | 'kg' | 'percent' | 'date' | 'int';

const NUMBER_FORMATS: Record<ReportFormat, string | undefined> = {
  text: undefined,
  number: '#,##0.00',
  int: '#,##0',
  /* Indian grouping, which is what every other figure in this system uses. */
  rs: '[$₹-4009]##,##,##0',
  rs2: '[$₹-4009]##,##,##0.00',
  kg: '#,##0.000',
  percent: '0.00"%"',
  date: 'dd-mm-yyyy',
};

export interface ReportColumn<T> {
  header: string;
  /** Characters, roughly. Left out, it is guessed from the header. */
  width?: number;
  format?: ReportFormat;
  value: (row: T) => string | number | Date | null | undefined;
  /** Totalled at the foot. Only sensible on a number. */
  total?: boolean;
}

export interface ReportSpec<T> {
  /** What the sheet is of: "Rates", "Job sheets". Also the tab name. */
  title: string;
  /** The filters that produced it, in words. Printed under the title. */
  filters?: string[];
  columns: ReportColumn<T>[];
  rows: T[];
  /** The date the figures are as at, where the page has one. */
  asAt?: string | null;
}

const WORKS = 'Yuva Polyprint and Packaging Industries';

/** Excel refuses \\ / ? * [ ] : in a tab name, and stops at 31 characters. */
function tabName(title: string): string {
  return title.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Report';
}

export async function buildReport<T>(spec: ReportSpec<T>): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  book.creator = WORKS;
  book.created = new Date();

  const sheet = book.addWorksheet(tabName(spec.title), {
    views: [{ state: 'frozen', ySplit: 4 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  const width = spec.columns.length;
  const last = String.fromCharCode(64 + Math.min(width, 26));

  /* ---- who, what and when ------------------------------------------- */
  sheet.mergeCells(`A1:${last}1`);
  const heading = sheet.getCell('A1');
  heading.value = `${WORKS} — ${spec.title}`;
  heading.font = { name: FONT, bold: true, size: 13 };
  heading.alignment = { vertical: 'middle' };
  sheet.getRow(1).height = 22;

  sheet.mergeCells(`A2:${last}2`);
  const note = sheet.getCell('A2');
  const parts = [
    spec.asAt ? `As at ${spec.asAt}` : `Taken ${new Date().toLocaleDateString('en-GB')}`,
    ...(spec.filters ?? []),
    `${spec.rows.length} ${spec.rows.length === 1 ? 'row' : 'rows'}`,
  ];
  note.value = parts.join('  ·  ');
  note.font = { name: FONT, size: 9, color: { argb: 'FF6B7280' } };

  /* ---- the columns --------------------------------------------------- */
  const headerRow = sheet.getRow(4);
  spec.columns.forEach((column, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = column.header;
    cell.font = { name: FONT, bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    cell.fill = HEADER_FILL;
    cell.alignment = { vertical: 'middle', wrapText: true };
    cell.border = THIN;
    sheet.getColumn(index + 1).width = column.width ?? Math.max(12, column.header.length + 4);
  });
  headerRow.height = 24;

  /* ---- the rows ------------------------------------------------------ */
  spec.rows.forEach((row, rowIndex) => {
    const line = sheet.getRow(5 + rowIndex);
    spec.columns.forEach((column, index) => {
      const cell = line.getCell(index + 1);
      const value = column.value(row);
      cell.value = value === undefined || value === null || value === '' ? null : value;
      cell.font = { name: FONT, size: 10 };
      cell.border = THIN;
      const format = NUMBER_FORMATS[column.format ?? 'text'];
      if (format) cell.numFmt = format;
      cell.alignment = {
        vertical: 'middle',
        horizontal: column.format && column.format !== 'text' ? 'right' : 'left',
        wrapText: false,
      };
      /* Banding, so a wide row stays readable across the page. */
      if (rowIndex % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
      }
    });
  });

  /* ---- and what it comes to ------------------------------------------ */
  const totalled = spec.columns.some((column) => column.total);
  if (totalled && spec.rows.length > 0) {
    const line = sheet.getRow(5 + spec.rows.length);
    const first = 5;
    const lastDataRow = 4 + spec.rows.length;
    spec.columns.forEach((column, index) => {
      const cell = line.getCell(index + 1);
      cell.font = { name: FONT, bold: true, size: 10 };
      cell.border = { ...THIN, top: { style: 'medium', color: { argb: 'FF1F2937' } } };
      if (index === 0) {
        cell.value = 'Total';
        return;
      }
      if (!column.total) return;
      /* A live SUM, not a figure computed here: a works that deletes a row in
         the downloaded copy should see the total follow it. */
      const letter = sheet.getColumn(index + 1).letter;
      cell.value = { formula: `SUM(${letter}${first}:${letter}${lastDataRow})` };
      const format = NUMBER_FORMATS[column.format ?? 'number'];
      if (format) cell.numFmt = format;
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
    });
  }

  if (spec.rows.length > 0) {
    sheet.autoFilter = {
      from: { row: 4, column: 1 },
      to: { row: 4 + spec.rows.length, column: width },
    };
  }

  const out = await book.xlsx.writeBuffer();
  return Buffer.from(out);
}

/** The filename the office sees. Dated, because they keep them. */
export function reportFilename(title: string, asAt?: string | null): string {
  const when = (asAt ?? new Date().toISOString().slice(0, 10)).replace(/-/g, '');
  const name = title.replace(/[^\w ]+/g, '').trim() || 'Report';
  return `${name} ${when}.xlsx`;
}

/**
 * A download is not a page of a list.
 *
 * The screen shows twenty-five because a screen has to stop somewhere; the
 * file is what somebody takes away, and a file holding page one of nine is
 * worse than no file. High enough to hold every row the works has, bounded so
 * a mis-keyed filter cannot ask the database for everything at once.
 */
export const EXPORT_LIMIT = 5000;

/** Query keys that say nothing about what was filtered. */
const NOT_A_FILTER = new Set(['page', 'pageSize', 'sort', 'order']);

/**
 * What was on screen, in words, for the line under the title.
 *
 * A spreadsheet of forty rows out of four hundred, with nothing to say which
 * forty, is a spreadsheet that gets filed and then disbelieved.
 */
export function describe(query: Record<string, unknown>): string[] {
  const LABELS: Record<string, string> = {
    q: 'Search',
    search: 'Search',
    status: 'Status',
    from: 'From',
    to: 'To',
    onDate: 'As at',
    customerId: 'One customer',
    category: 'Category',
    includeInactive: 'Including retired',
    isVerified: 'Confirmed',
    source: 'Source',
    lowOnly: 'Low stock only',
  };

  return Object.entries(query)
    .filter(([key, value]) => {
      if (NOT_A_FILTER.has(key)) return false;
      return value !== undefined && value !== null && value !== '' && value !== 'false';
    })
    .map(([key, value]) => {
      const label = LABELS[key] ?? key;
      return value === 'true' ? label : `${label}: ${String(value)}`;
    });
}
