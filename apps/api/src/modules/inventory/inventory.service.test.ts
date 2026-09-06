import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Two properties of the stock service that no unit test of a pure function can
 * reach, and that a reader cannot check by eye.
 *
 * The first is that **every write goes through one place**. `record` is the
 * only function that touches a quantity, and it writes the batch and the
 * movement together. A second path that updated a quantity directly would leave
 * the cache and the ledger disagreeing, and nothing would notice until somebody
 * counted a shelf.
 *
 * The second is that **nothing rewrites history**. The balance stored on every
 * movement is the total at that moment; an update or a delete anywhere in the
 * table makes every later row a lie.
 *
 * Both are checked against the source, because both are failures of omission —
 * a path that does not exist cannot be exercised, and a delete that is never
 * called cannot be caught by calling the code.
 */
const SOURCE = readFileSync(
  fileURLToPath(new URL('./inventory.service.ts', import.meta.url)),
  'utf8',
);

/** Strips comments, so prose about deletion is not read as deletion. */
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('the stock ledger', () => {
  it('changes a quantity in exactly one place', () => {
    /*
     * `record` holds the only increment. `receiveStock` sets a batch's opening
     * quantity to a literal 0 and lets the receipt movement fill it, so a
     * batch's quantity is the sum of its movements from its very first row.
     */
    const increments = CODE.match(/quantity:\s*\{\s*increment/g) ?? [];
    expect(increments).toHaveLength(1);

    /*
     * And of the several `stockBatch.update` calls — one takes the row lock,
     * one moves a batch between locations — exactly one touches the quantity.
     * A second would be a path that changes stock without writing a movement.
     */
    const updates = CODE.match(/stockBatch\.update\(\{[\s\S]*?\n\s*\}\)/g) ?? [];
    expect(updates.length).toBeGreaterThan(1);
    expect(updates.filter((call) => call.includes('quantity'))).toHaveLength(1);
  });

  it('never updates or deletes a movement', () => {
    for (const forbidden of [
      'stockMovement.update',
      'stockMovement.updateMany',
      'stockMovement.delete',
      'stockMovement.deleteMany',
      'stockMovement.upsert',
    ]) {
      expect(CODE).not.toContain(forbidden);
    }
  });

  it('never deletes a batch', () => {
    // A batch emptied to zero stays on record — it is what its movements refer
    // to, and deleting it would cascade the history away with it.
    for (const forbidden of ['stockBatch.delete', 'stockBatch.deleteMany']) {
      expect(CODE).not.toContain(forbidden);
    }
  });

  it('writes every movement inside a transaction', () => {
    /*
     * The batch update and the movement row have to commit together or not at
     * all. Each public action opens one transaction; `record` is only ever
     * called with that transaction's client.
     */
    const actions = ['receiveStock', 'issueStock', 'adjustStock', 'transferStock'];
    for (const action of actions) {
      const start = CODE.indexOf(`export async function ${action}`);
      expect(start, `${action} is exported`).toBeGreaterThan(-1);
      const nextExport = CODE.indexOf('\nexport ', start + 1);
      const block = CODE.slice(start, nextExport === -1 ? undefined : nextExport);
      expect(block, `${action} opens a transaction`).toContain('prisma.$transaction');
    }
  });

  it('derives the signed quantity rather than trusting the caller', () => {
    /*
     * The direction of a movement comes from its kind. A caller passing a
     * negative receipt, or a positive issue, must not be able to add stock that
     * never arrived.
     */
    expect(CODE).toContain('signedQuantity(');
    // Only the adjustment computes its own figure, and it does so from the
    // counted quantity against the books rather than from a typed difference.
    expect(CODE).toContain('input.countedQuantity - onBooks');
  });
});
