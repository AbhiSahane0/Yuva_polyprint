import { describe, expect, it } from 'vitest';
import { batchValue, needsAttention, signedQuantity, signOf, stockHealth } from './inventory.js';

/**
 * The three rules the whole module rests on.
 *
 * Stock is a ledger: what is on hand is the sum of every movement, so the sign
 * a movement carries is the difference between material arriving and material
 * leaving. Getting it from the kind rather than from what somebody typed is
 * what stops a mistyped minus adding 50 kg the works never received.
 */
describe('signedQuantity', () => {
  it('adds on a receipt and takes away on an issue, whatever was typed', () => {
    // The form asks for a plain positive figure; the direction is not the
    // office's to type.
    expect(signedQuantity('RECEIPT', 500)).toBe(500);
    expect(signedQuantity('ISSUE', 120)).toBe(-120);
    expect(signedQuantity('WASTE', 24)).toBe(-24);
  });

  it('ignores a sign somebody typed into a receipt or an issue', () => {
    // "-50" in the issue box means fifty out, not fifty in.
    expect(signedQuantity('ISSUE', -50)).toBe(-50);
    expect(signedQuantity('RECEIPT', -50)).toBe(50);
  });

  it('lets an adjustment carry its own sign', () => {
    // A cycle count goes either way, and the server derives it from the count.
    expect(signedQuantity('ADJUSTMENT', -36)).toBe(-36);
    expect(signedQuantity('ADJUSTMENT', 12)).toBe(12);
  });

  it('moves nothing on a transfer', () => {
    // A transfer changes where stock is, never how much there is.
    expect(signedQuantity('TRANSFER', 500)).toBe(0);
    expect(signOf('TRANSFER')).toBe(0);
  });

  it('rounds to the three decimals the columns hold', () => {
    expect(signedQuantity('ISSUE', 12.3456)).toBe(-12.346);
  });
});

describe('stockHealth', () => {
  it('separates "fine" from "nobody has said what fine is"', () => {
    /*
     * The distinction that matters. Reporting an unset level as healthy is how
     * a material sits at 3 kg for a month without anybody being told.
     */
    expect(stockHealth(2450, 500)).toBe('HEALTHY');
    expect(stockHealth(2450, null)).toBe('UNSET');
  });

  it('treats a level of zero as a real level', () => {
    // "Shout only when we have run out" is a choice somebody made, and is not
    // the same as never having set one.
    expect(stockHealth(10, 0)).toBe('HEALTHY');
    expect(stockHealth(0, 0)).toBe('OUT');
  });

  it('is low at the level, not below it', () => {
    // At the reorder level is when to reorder, not one kilogram later.
    expect(stockHealth(500, 500)).toBe('LOW');
    expect(stockHealth(499, 500)).toBe('LOW');
    expect(stockHealth(501, 500)).toBe('HEALTHY');
  });

  it('says out of stock for something that has run out', () => {
    expect(stockHealth(0, 500, true)).toBe('OUT');
    expect(stockHealth(0, null, true)).toBe('OUT');
    expect(stockHealth(-5, 500, true)).toBe('OUT');
  });

  it('does not call a material this works has never held "out of stock"', () => {
    /*
     * Every material in the rates catalogue appears on the inventory screen, so
     * on a system nobody has received anything into yet, treating them all as
     * out would read as "all seventeen need reordering". An alarm that means
     * nothing is one the office learns to ignore.
     *
     * Running out is an event. Never having stocked something is not.
     */
    expect(stockHealth(0, null, false)).toBe('NOT_STOCKED');
    expect(needsAttention(stockHealth(0, null, false))).toBe(false);
  });

  it('treats a level somebody set as a statement that it is watched', () => {
    // Setting a reorder level before the first delivery is how the office says
    // "we intend to hold this" — so it counts as out, not as never stocked.
    expect(stockHealth(0, 500, false)).toBe('OUT');
  });

  it('flags exactly the two states somebody has to act on', () => {
    expect(needsAttention('LOW')).toBe(true);
    expect(needsAttention('OUT')).toBe(true);
    expect(needsAttention('HEALTHY')).toBe(false);
    expect(needsAttention('UNSET')).toBe(false);
    expect(needsAttention('NOT_STOCKED')).toBe(false);
  });
});

describe('batchValue', () => {
  it('values stock at what was paid for it', () => {
    expect(batchValue(2450, 205, 210)).toBe(502250);
  });

  it('falls back to the catalogue rate when no price was recorded', () => {
    expect(batchValue(2450, null, 210)).toBe(514500);
  });

  it('is zero rather than a guess when neither rate exists', () => {
    // A material with no rate on record contributes nothing to the total. A
    // guessed figure would move the inventory value with nothing behind it.
    expect(batchValue(2450, null, null)).toBe(0);
  });

  it('does not move when today’s rate does', () => {
    /*
     * The reason valuation uses what was paid. Valuing at the current rate
     * makes the inventory figure jump every morning when the rates are keyed
     * in, which reads as stock appearing and disappearing overnight.
     */
    const paid = batchValue(1000, 205, 210);
    expect(batchValue(1000, 205, 260)).toBe(paid);
  });
});
