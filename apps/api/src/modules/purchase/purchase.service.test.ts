import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The join between buying and holding, guarded at the source.
 *
 * Two properties no unit test of a pure function can reach, and both are
 * failures of omission — a second way of creating stock cannot be caught by
 * exercising the first.
 */
const SOURCE = readFileSync(
  fileURLToPath(new URL('./purchase.service.ts', import.meta.url)),
  'utf8',
);
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('receiving a delivery', () => {
  it('creates stock only through the inventory service', () => {
    /*
     * The whole point of the interlink. A second implementation here would have
     * its own unit conversion and its own idea of a balance, and would drift
     * from the ledger within a month.
     */
    expect(CODE).toContain('receiveStock(');
    for (const forbidden of ['stockBatch.create', 'stockMovement.create', 'prisma.stockBatch']) {
      expect(CODE).not.toContain(forbidden);
    }
  });

  it('writes the batch and the receipt in one transaction', () => {
    // A receipt naming a batch that was never created is worse than no receipt,
    // so `receiveStock` is handed this transaction rather than opening its own.
    const start = CODE.indexOf('export async function receivePurchaseLine');
    const block = CODE.slice(start, CODE.indexOf('\nexport ', start + 1));
    expect(block).toContain('prisma.$transaction');
    expect(block).toContain('tx,');
    expect(block).toContain('tx.purchaseReceipt.create');
  });

  it('never lets the caller choose a received status', () => {
    /*
     * PARTIALLY_RECEIVED and RECEIVED are facts about deliveries. They are set
     * by `restatus` from the receipts, and an order somebody forgot to tick is
     * exactly the order they are chasing.
     */
    const start = CODE.indexOf('async function restatus');
    const block = CODE.slice(start, CODE.indexOf('\n/**', start + 1));
    expect(block).toContain('statusFromReceipts');

    // The update endpoint takes only what the office decides — the schema's
    // CHOOSABLE_STATUSES — and refuses even those once stock exists.
    expect(CODE).toContain('has deliveries against it');
  });

  it('refuses more than was ordered', () => {
    // A supplier sending 4,000 against an order for 400 is a mistake somebody
    // needs to ring them about, not a stock figure to discover next week.
    expect(CODE).toContain('already arrived and this would make');
  });
});
