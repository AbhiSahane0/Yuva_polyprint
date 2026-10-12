import { describe, expect, it } from 'vitest';
import { costingNameAt, JOB_SHEET_COSTING_NAMES, JOB_SHEET_LINES } from './job-sheet.js';

/**
 * The costing block's names are the office's cross-check against the paper, so
 * a key that stops matching a row would quietly show the stored name instead —
 * right-looking, and not what their sheet says.
 */
describe('the costing block names', () => {
  it('names a row the form actually has', () => {
    const keys = new Set(JOB_SHEET_LINES.map((line) => line.key));
    for (const key of Object.keys(JOB_SHEET_COSTING_NAMES)) {
      expect(keys, `${key} names no row on the form`).toContain(key);
    }
  });

  it('reads their spellings off the costing block', () => {
    expect(costingNameAt(1, '12 PET Polyester')).toBe('12 PET Polysyter');
    expect(costingNameAt(3, 'Toluene')).toBe('Tolluene');
    expect(costingNameAt(18, 'LDPE Natural 50µm')).toBe('LDPE Mily/Natural');
    expect(costingNameAt(20, 'Hardener (OH)')).toBe('Hardner');
  });

  it("leaves a colour as the sheet's own row name, which is what =A15 does", () => {
    expect(costingNameAt(5, 'Cyan')).toBe('Cyan');
    expect(costingNameAt(16, 'Violet')).toBe('Violet');
  });

  it('falls back on a position the form does not have', () => {
    expect(costingNameAt(0, 'Whatever')).toBe('Whatever');
    expect(costingNameAt(99, 'Imported row')).toBe('Imported row');
  });
});
