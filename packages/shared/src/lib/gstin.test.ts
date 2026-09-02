import { describe, expect, it } from 'vitest';
import { checkGstin, gstinCheckCharacter, isValidGstin } from './gstin.js';

/**
 * Two real GSTINs anchor these: the works' own, off its letterhead, and the
 * one used as the worked example in every published description of the
 * algorithm. Both must pass, or the check digit is being computed wrongly and
 * every genuine customer would be turned away.
 */
const YUVA = '27AIGPH5992Q1ZD';
const WORKED_EXAMPLE = '27AAPFU0939F1ZV';

describe('gstinCheckCharacter', () => {
  it('reproduces the published check digit', () => {
    expect(gstinCheckCharacter('27AAPFU0939F1Z')).toBe('V');
    expect(gstinCheckCharacter('27AIGPH5992Q1Z')).toBe('D');
  });

  it('refuses anything that is not exactly fourteen characters', () => {
    expect(gstinCheckCharacter('27AAPFU0939F1')).toBeNull();
    expect(gstinCheckCharacter('27AAPFU0939F1ZV')).toBeNull();
  });
});

describe('checkGstin accepts', () => {
  it('a real GSTIN', () => {
    const check = checkGstin(YUVA);
    expect(check.valid).toBe(true);
    expect(check.problem).toBeNull();
    expect(check.stateCode).toBe('27');
    expect(check.pan).toBe('AIGPH5992Q');
    expect(checkGstin(WORKED_EXAMPLE).valid).toBe(true);
  });

  it('one typed in lower case with stray spaces', () => {
    const check = checkGstin('  27aigph5992q1zd ');
    expect(check.valid).toBe(true);
    // Normalising is the point: this is what gets stored, not what was typed.
    expect(check.normalized).toBe(YUVA);
  });

  it('a state code that is no longer issued but still holds registrations', () => {
    // 25 (old Daman & Diu) and 28 (undivided Andhra Pradesh) are retired for
    // new registrations. Old ones are genuine and must not be refused.
    for (const state of ['25', '28']) {
      const head = `${state}AIGPH5992Q1Z`;
      expect(isValidGstin(head + gstinCheckCharacter(head))).toBe(true);
    }
  });

  it('the special territory codes', () => {
    for (const state of ['97', '99']) {
      const head = `${state}AIGPH5992Q1Z`;
      expect(isValidGstin(head + gstinCheckCharacter(head))).toBe(true);
    }
  });
});

describe('checkGstin rejects', () => {
  it('the placeholder sitting in the PDF template', () => {
    // 27ABCDE1234F1Z5 reads like a GSTIN and is not one. Exactly the class of
    // value this check exists to stop reaching a customer's invoice.
    const check = checkGstin('27ABCDE1234F1Z5');
    expect(check.valid).toBe(false);
    expect(check.problem).toBe('CHECKSUM');
  });

  it('a wrong length', () => {
    expect(checkGstin('27AIGPH5992Q1Z').problem).toBe('LENGTH');
    expect(checkGstin('27AIGPH5992Q1ZDD').problem).toBe('LENGTH');
  });

  it('the wrong shape', () => {
    // A digit where the PAN's letters belong.
    expect(checkGstin('27A1GPH5992Q1ZD').problem).toBe('SHAPE');
    // 'Z' is fixed at position 14.
    expect(checkGstin('27AIGPH5992Q1YD').problem).toBe('SHAPE');
  });

  it('an impossible state code', () => {
    expect(checkGstin('00AIGPH5992Q1ZD').problem).toBe('STATE');
    expect(checkGstin('40AIGPH5992Q1ZD').problem).toBe('STATE');
  });

  it('every single-character typo in a real GSTIN', () => {
    // The claim the whole feature rests on, checked exhaustively rather than
    // asserted: one character changed anywhere must never still validate.
    const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let slipped = 0;

    for (let position = 0; position < YUVA.length; position += 1) {
      for (const character of ALPHABET) {
        if (character === YUVA[position]) continue;
        const typo = YUVA.slice(0, position) + character + YUVA.slice(position + 1);
        if (isValidGstin(typo)) slipped += 1;
      }
    }

    expect(slipped).toBe(0);
  });

  it('every adjacent transposition in a real GSTIN', () => {
    let slipped = 0;

    for (let position = 0; position < YUVA.length - 1; position += 1) {
      if (YUVA[position] === YUVA[position + 1]) continue;
      const swapped =
        YUVA.slice(0, position) + YUVA[position + 1] + YUVA[position] + YUVA.slice(position + 2);
      if (isValidGstin(swapped)) slipped += 1;
    }

    expect(slipped).toBe(0);
  });
});

describe('an empty GSTIN', () => {
  it('is reported as empty rather than wrong', () => {
    // Registration is not compulsory below the turnover threshold, so a blank
    // is a legitimate answer for a small customer. It must not read as an
    // error on the form.
    for (const value of ['', '   ', null, undefined]) {
      const check = checkGstin(value);
      expect(check.problem).toBe('EMPTY');
      expect(check.message).toBe('');
    }
  });
});
