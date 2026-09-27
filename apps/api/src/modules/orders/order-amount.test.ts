import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * **An order's value must not move unless somebody moved it.**
 *
 * The stored amount is the figure from the quotation the customer accepted,
 * worked out at full precision. The rate stored beside it is rounded for
 * reading — two decimals a kilogram, four a pouch — so multiplying the
 * rounded rate back out does not always land on the same figure. A real
 * order: 143,090 pouches at 2.1269 is Rs 304,338.12 against the Rs 304,340
 * that was quoted.
 *
 * The service recomputed on every patch, so correcting an order's NOTES moved
 * its value by Rs 1.88. Found by auditing six of the eight demo orders against
 * their own figures and then patching one to see what happened.
 */
const CODE = readFileSync(fileURLToPath(new URL('./order.service.ts', import.meta.url)), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '');

const update = CODE.slice(
  CODE.indexOf('export async function updateOrder'),
  CODE.indexOf('\nexport ', CODE.indexOf('export async function updateOrder') + 1),
);

describe('updating an order', () => {
  it('recomputes the total only when a price figure was sent', () => {
    expect(update).toContain('priceMoved');
    expect(update).toContain('priceMoved ? { amount: orderAmount(figures) } : {}');
  });

  it('counts all four price figures, not just the rate', () => {
    /* Quantity moves a total as surely as a rate does, and a pouch order is
       priced off the other pair. Missing one would leave a stale total. */
    for (const field of ['quantityKg', 'ratePerKg', 'quantityPouches', 'ratePerPouch']) {
      expect(update, `${field} counts as a price change`).toContain(`input.${field} !== undefined`);
    }
  });

  it('still recomputes from the figures AFTER the patch', () => {
    // A patch that moves only the rate has to move the total, and the total
    // has to use the new rate with the old quantity.
    expect(update).toContain('input.ratePerKg ?? toNumber(existing.ratePerKg)');
    expect(update).toContain('orderAmount(figures)');
  });
});
