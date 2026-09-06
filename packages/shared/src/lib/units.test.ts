import { describe, expect, it } from 'vitest';
import { convertQuantity, convertRate, purchaseUnitsFor, unitFamily } from './units.js';

/**
 * Conversions between the unit a delivery arrives in and the unit stock is
 * held in.
 *
 * Two failures are worth guarding here, and both are the kind that get believed
 * rather than questioned: a tonne entered as a kilogram is out by a thousand,
 * and a per-tonne rate applied per kilogram is out by a million.
 */
describe('convertQuantity', () => {
  it('converts within a family exactly', () => {
    expect(convertQuantity(2, 'TON', 'KG')).toBe(2000);
    expect(convertQuantity(2000, 'KG', 'TON')).toBe(2);
    expect(convertQuantity(500, 'G', 'KG')).toBe(0.5);
    expect(convertQuantity(2, 'KL', 'L')).toBe(2000);
  });

  it('leaves the common case untouched', () => {
    // Stocked and bought in the same unit, which is most deliveries. The base
    // unit is the kilogram precisely so this multiplies by one.
    expect(convertQuantity(3000, 'KG', 'KG')).toBe(3000);
    expect(convertQuantity(640, 'L', 'L')).toBe(640);
  });

  it('refuses to turn litres into kilograms', () => {
    /*
     * That is a property of the substance, not arithmetic, and the four inks in
     * the master have no density recorded. Quietly treating one as the other
     * would put a wrong weight into stock and a wrong figure into the inventory
     * value, with nothing on screen to contradict it.
     */
    expect(convertQuantity(200, 'L', 'KG')).toBeNull();
    expect(convertQuantity(200, 'KG', 'L')).toBeNull();
  });

  it('refuses a unit it does not know', () => {
    expect(convertQuantity(10, 'DRUM', 'KG')).toBeNull();
    // Except to itself — a material stocked in pieces is received in pieces,
    // and there is nothing to convert.
    expect(convertQuantity(10, 'pcs', 'pcs')).toBe(10);
  });

  it('is case-insensitive, because the master says KG and a form says kg', () => {
    expect(convertQuantity(2, 'ton', 'Kg')).toBe(2000);
  });
});

describe('convertRate', () => {
  it('moves the price the opposite way to the quantity', () => {
    // Rs. 205,000 a tonne is Rs. 205 a kilogram. The other way round overstates
    // the stock value by a factor of a million.
    expect(convertRate(205_000, 'TON', 'KG')).toBe(205);
    expect(convertRate(205, 'KG', 'TON')).toBe(205_000);
  });

  it('agrees with the quantity conversion on the total', () => {
    // The invariant that matters: whichever unit it was entered in, the value
    // of the delivery is the same money.
    const quantity = convertQuantity(2, 'TON', 'KG')!;
    const rate = convertRate(205_000, 'TON', 'KG')!;
    expect(quantity * rate).toBe(2 * 205_000);
  });

  it('refuses across families, like the quantity does', () => {
    expect(convertRate(640, 'L', 'KG')).toBeNull();
  });
});

describe('purchaseUnitsFor', () => {
  it('offers the stock unit first, then its siblings', () => {
    // The stock unit is what most deliveries are in and needs no conversion.
    expect(purchaseUnitsFor('KG')[0]).toBe('KG');
    expect(purchaseUnitsFor('KG')).toContain('TON');
    expect(purchaseUnitsFor('L')[0]).toBe('L');
    expect(purchaseUnitsFor('L')).toContain('KL');
  });

  it('never mixes mass with volume', () => {
    // A film cannot be received in litres, whatever the supplier's note says.
    expect(purchaseUnitsFor('KG')).not.toContain('L');
    expect(purchaseUnitsFor('L')).not.toContain('KG');
  });

  it('offers only itself for a unit it does not know', () => {
    expect(purchaseUnitsFor('pcs')).toEqual(['PCS']);
  });
});

describe('unitFamily', () => {
  it('groups the units the works actually uses', () => {
    expect(unitFamily('KG')).toBe('MASS');
    expect(unitFamily('L')).toBe('VOLUME');
    expect(unitFamily('pcs')).toBeNull();
  });
});
