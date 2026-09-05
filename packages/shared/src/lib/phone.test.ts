import { describe, expect, it } from 'vitest';
import { collectMobiles, formatMobile, isMobile, normaliseMobile } from './phone.js';

/**
 * The numbers in the customer master, and what WhatsApp needs.
 *
 * Of the 19 non-blank phone values imported from the client's spreadsheet, 18
 * are plain ten-digit mobiles and one is a pair of landlines sharing a cell.
 * Both shapes are covered here, because the second is the one that would
 * quietly become a number nobody can be reached on.
 */
describe('normaliseMobile', () => {
  it('accepts the plain ten digits the office actually types', () => {
    // Real values out of the imported master.
    expect(normaliseMobile('9545390337')).toBe('+919545390337');
    expect(normaliseMobile('7720046005')).toBe('+917720046005');
    expect(normaliseMobile('8888809684')).toBe('+918888809684');
  });

  it('accepts a number however it was pasted', () => {
    for (const written of [
      '+91 95453 90337',
      '+919545390337',
      '919545390337',
      '09545390337',
      '95453-90337',
      '  9545390337  ',
      '(95453) 90337',
    ]) {
      expect(normaliseMobile(written)).toBe('+919545390337');
    }
  });

  it('refuses a cell holding two numbers', () => {
    /*
     * One imported row reads "222394, 222044". Picking either would store a
     * number the office never chose; both happen to be landlines anyway.
     */
    expect(normaliseMobile('222394, 222044')).toBeNull();
    expect(normaliseMobile('9545390337 / 7720046005')).toBeNull();
  });

  it('refuses a landline, which cannot receive a WhatsApp message', () => {
    // Six digits, and Indian mobiles begin 6-9 and run to ten.
    expect(normaliseMobile('222394')).toBeNull();
    expect(normaliseMobile('02425234567')).toBeNull();
    expect(normaliseMobile('1234567890')).toBeNull();
    expect(normaliseMobile('5545390337')).toBeNull();
  });

  it('refuses a number of the wrong length', () => {
    expect(normaliseMobile('954539033')).toBeNull();
    expect(normaliseMobile('95453903371')).toBeNull();
  });

  it('treats the importer’s NA and blanks as no number', () => {
    for (const blank of ['', '   ', 'NA', 'na', null, undefined]) {
      expect(normaliseMobile(blank)).toBeNull();
    }
  });

  it('refuses anything that is not digits', () => {
    expect(normaliseMobile('call the office')).toBeNull();
    expect(normaliseMobile('9545390337 ext 2')).toBeNull();
  });

  it('is idempotent, so a stored number survives a round trip', () => {
    const once = normaliseMobile('9545390337');
    expect(normaliseMobile(once)).toBe(once);
  });
});

describe('isMobile', () => {
  it('answers for the two cases that matter', () => {
    expect(isMobile('9545390337')).toBe(true);
    expect(isMobile('222394')).toBe(false);
  });
});

describe('formatMobile', () => {
  it('spaces a number the way it is read aloud', () => {
    expect(formatMobile('9545390337')).toBe('+91 95453 90337');
    expect(formatMobile('+919545390337')).toBe('+91 95453 90337');
  });

  it('hands back what it was given when it cannot make sense of it', () => {
    // Display only — it must never blank out a value somebody is looking at.
    expect(formatMobile('222394')).toBe('222394');
    expect(formatMobile('')).toBe('');
  });
});

describe('collectMobiles', () => {
  it('splits a paste into chips', () => {
    expect(collectMobiles('9545390337, 7720046005')).toEqual({
      valid: ['+919545390337', '+917720046005'],
      invalid: [],
    });
  });

  it('reports what it could not read rather than dropping it', () => {
    // Silently discarding half a paste is how a recipient goes missing.
    expect(collectMobiles('9545390337, 222394')).toEqual({
      valid: ['+919545390337'],
      invalid: ['222394'],
    });
  });

  it('does not add the same number twice', () => {
    expect(collectMobiles('9545390337, +91 95453 90337').valid).toEqual(['+919545390337']);
  });
});
