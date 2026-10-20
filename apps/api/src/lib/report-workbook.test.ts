import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import {
  buildReport,
  describe as describeFilters,
  EXPORT_LIMIT,
  reportFilename,
} from './report-workbook.js';

/**
 * Every page downloads through this, so a mistake here is a mistake on nine
 * screens. The one that matters most is the dullest: a figure must arrive as a
 * NUMBER. A column of "Rs. 1,234.00" is text, it does not add up, and adding
 * it up is the first thing anybody does with a spreadsheet.
 */

interface Row {
  name: string;
  kg: number;
  rate: number;
  on: Date | null;
}

const ROWS: Row[] = [
  { name: 'PET 12µm', kg: 507.55, rate: 185, on: new Date('2026-10-18T00:00:00Z') },
  { name: 'LDPE Natural GP', kg: 733.9, rate: 170, on: null },
];

async function sheetOf(buffer: Buffer) {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = book.worksheets[0];
  if (!sheet) throw new Error('no sheet');
  return sheet;
}

const COLUMNS = [
  { header: 'Material', value: (r: Row) => r.name },
  { header: 'Kg', format: 'kg' as const, total: true, value: (r: Row) => r.kg },
  { header: 'Rate', format: 'rs2' as const, value: (r: Row) => r.rate },
  { header: 'From', format: 'date' as const, value: (r: Row) => r.on },
];

describe('the report workbook', () => {
  it('writes the works, the title and what was filtered', async () => {
    const sheet = await sheetOf(
      await buildReport({
        title: 'Rates',
        asAt: '2026-10-18',
        filters: ['Search: PET'],
        columns: COLUMNS,
        rows: ROWS,
      }),
    );

    expect(String(sheet.getCell('A1').value)).toContain('Yuva Polyprint');
    expect(String(sheet.getCell('A1').value)).toContain('Rates');
    const note = String(sheet.getCell('A2').value);
    expect(note).toContain('As at 2026-10-18');
    expect(note).toContain('Search: PET');
    expect(note).toContain('2 rows');
  });

  /* The one that matters. */
  it('keeps numbers as numbers and dates as dates', async () => {
    const sheet = await sheetOf(
      await buildReport({ title: 'Rates', columns: COLUMNS, rows: ROWS }),
    );

    expect(sheet.getCell('B5').value).toBe(507.55);
    expect(sheet.getCell('C5').value).toBe(185);
    expect(sheet.getCell('D5').value).toBeInstanceOf(Date);
    expect(sheet.getCell('B5').numFmt).toBe('#,##0.000');
    expect(String(sheet.getCell('C5').numFmt)).toContain('₹');
  });

  it('leaves a missing figure empty rather than zero', async () => {
    const sheet = await sheetOf(
      await buildReport({ title: 'Rates', columns: COLUMNS, rows: ROWS }),
    );
    /* The second row has no date. Zero would read as 1900. */
    expect(sheet.getCell('D6').value).toBeNull();
  });

  /* A live SUM, so a works that deletes a row in its copy sees the total move. */
  it('totals with a formula, not a figure', async () => {
    const sheet = await sheetOf(
      await buildReport({ title: 'Rates', columns: COLUMNS, rows: ROWS }),
    );
    const total = sheet.getCell('B7').value as { formula?: string };
    expect(total.formula).toBe('SUM(B5:B6)');
    expect(String(sheet.getCell('A7').value)).toBe('Total');
  });

  it('freezes the headings and offers a filter', async () => {
    const sheet = await sheetOf(
      await buildReport({ title: 'Rates', columns: COLUMNS, rows: ROWS }),
    );
    expect(sheet.views[0]?.state).toBe('frozen');
    expect(sheet.autoFilter).toBeTruthy();
  });

  it('survives an empty list', async () => {
    const sheet = await sheetOf(await buildReport({ title: 'Rates', columns: COLUMNS, rows: [] }));
    expect(String(sheet.getCell('A2').value)).toContain('0 rows');
    /* No total row under nothing, and no filter over nothing. */
    expect(sheet.getCell('A5').value).toBeNull();
  });

  /* Excel refuses these in a tab name and silently corrupts the file. */
  it('makes a tab name Excel will accept', async () => {
    const sheet = await sheetOf(
      await buildReport({ title: 'Stock: films/rolls [all]', columns: COLUMNS, rows: ROWS }),
    );
    expect(sheet.name).not.toMatch(/[\\/?*[\]:]/);
    expect(sheet.name.length).toBeLessThanOrEqual(31);
  });
});

describe('what the download is called', () => {
  it('carries the date, because the office keeps them', () => {
    expect(reportFilename('Rates', '2026-10-18')).toBe('Rates 20261018.xlsx');
  });

  it('drops anything a filesystem would object to', () => {
    expect(reportFilename('Stock: films/rolls', '2026-10-18')).toBe(
      'Stock filmsrolls 20261018.xlsx',
    );
  });
});

describe('saying what was filtered', () => {
  it('names the filters in words', () => {
    expect(describeFilters({ q: 'PET', status: 'OPEN' })).toEqual(['Search: PET', 'Status: OPEN']);
  });

  it('says nothing about the page you happened to be on', () => {
    expect(describeFilters({ page: 3, pageSize: 25 })).toEqual([]);
  });

  it('leaves out a filter that is switched off', () => {
    expect(describeFilters({ lowOnly: 'false', q: '' })).toEqual([]);
    expect(describeFilters({ lowOnly: 'true' })).toEqual(['Low stock only']);
  });
});

describe('the export limit', () => {
  /* The screen stops at 25 because a screen has to. A file holding page one
     of nine is worse than no file. */
  it('is far above any page size', () => {
    expect(EXPORT_LIMIT).toBeGreaterThan(1000);
  });
});
