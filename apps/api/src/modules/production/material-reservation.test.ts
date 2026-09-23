import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * **The guarantee that stock is never reduced twice.**
 *
 * The works has exactly one thing that takes material off the shelf: the job
 * sheet, which posts what was actually weighed at the machine. Production
 * answers an earlier and different question — what a job *should* take — and
 * answers it by writing a claim, not a movement.
 *
 * That is not a property any test can reach by calling the code, because it is
 * a failure of omission: a path that deducts stock is caught by the fact that
 * it EXISTS, not by exercising it. So it is checked against the source, the way
 * the stock ledger's own invariants are.
 */
const read = (file: string): string =>
  readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8')
    /* Strip comments, so prose about deducting stock is not read as deducting
       stock — this file's own subject matter would otherwise fail it. */
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

const RESERVATION = read('./material-reservation.ts');
const SERVICE = read('./production.service.ts');

describe('production reserves material — it never issues it', () => {
  it('writes no stock movement anywhere in the module', () => {
    /*
     * A movement is the ledger row that makes a deduction real. Production has
     * no business creating one; the job sheet does that, once, later.
     */
    for (const [name, code] of [
      ['material-reservation.ts', RESERVATION],
      ['production.service.ts', SERVICE],
    ] as const) {
      expect(name && code).toBeTruthy();
      expect(code).not.toMatch(/stockMovement\s*\./);
    }
  });

  it('never changes a batch quantity', () => {
    /*
     * The other half. `stockBatch` may be READ — free stock is on hand minus
     * held, and on hand is the sum of the batches — but an update, an upsert,
     * a create or a delete would be production moving stock behind the
     * ledger's back, leaving the cached quantity and the movements disagreeing.
     */
    for (const code of [RESERVATION, SERVICE]) {
      expect(code).not.toMatch(/stockBatch\.(update|upsert|create|delete)/);
      expect(code).not.toMatch(/quantity:\s*\{\s*(increment|decrement)/);
    }
  });

  it('reads on-hand stock only as a sum of the batches', () => {
    // A groupBy, which cannot write. The only stockBatch call in the module.
    const calls = RESERVATION.match(/stockBatch\.\w+/g) ?? [];
    expect(calls).toEqual(['stockBatch.groupBy']);
  });

  it('counts only HELD reservations against free stock', () => {
    /*
     * A released row is a claim that has ended. Counting one would hold film
     * for a job that finished, and the works would look short for ever.
     */
    const groupBys = RESERVATION.match(/stockReservation\.groupBy\([\s\S]*?\)\s*,/g) ?? [];
    expect(groupBys).toHaveLength(1);
    expect(groupBys[0]).toContain("status: 'HELD'");
  });

  it('releases by marking the row, never by deleting it', () => {
    /*
     * A deleted claim leaves no trace that a job ever held the film, and the
     * releasedAt date is how a shortage argument gets settled afterwards. The
     * card's own deletion cascades, which is the one case where the claim
     * SHOULD vanish: a card nobody started is a mistake, not history.
     */
    expect(RESERVATION).not.toMatch(/stockReservation\.delete/);
    expect(RESERVATION).toMatch(/status:\s*'RELEASED'/);
  });
});

describe('the block on a job that has no film', () => {
  it('is applied wherever something starts running', () => {
    /*
     * Both doors: the card moved to running from the card screen, and a stage
     * started on the floor. A guard on one only is a guard on neither.
     */
    const guards = SERVICE.match(/refuseUnlessOverridden\(/g) ?? [];
    expect(guards).toHaveLength(2);
  });

  it('checks before the move, not after it', () => {
    /*
     * A check after the update would refuse a card that is already running —
     * the transaction rolls back, so nothing is saved, but any figure read
     * inside it would be from the wrong side of the move.
     */
    const check = SERVICE.indexOf('refuseUnlessOverridden');
    const update = SERVICE.indexOf('tx.productionOrder.update');
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(update);
  });
});
