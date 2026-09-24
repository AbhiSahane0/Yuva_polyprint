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
const JOB_SHEET = read('../job-sheets/job-sheet.service.ts');

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

/**
 * **The handover between the claim and the issue.**
 *
 * A job card claims film; a job sheet issues it. For a window they would both
 * stand against the same material — the sheet's movements are in the ledger and
 * the card's claim is still held — and free stock would read low by the whole
 * run. Linking the two closes that: posting the sheet is the moment the claim
 * stops counting, because it is the moment the material genuinely left.
 */
describe('a posted job sheet ends its card’s claim', () => {
  it('releases inside the same transaction that issues the material', () => {
    /*
     * Inside, not after. A release that happened outside the transaction could
     * survive a rollback of the issue it was released for, and the works would
     * have neither the claim nor the movement.
     */
    const post = JOB_SHEET.slice(JOB_SHEET.indexOf('export async function postToStock'));
    const body = post.slice(0, post.indexOf('export async function', 1));

    /* Where the $transaction callback actually ends, by matching braces —
       the first `});` in it closes an inner call, not the transaction. */
    const opens = body.indexOf('await prisma.$transaction');
    let depth = 0;
    let closes = -1;
    for (let at = body.indexOf('{', opens); at < body.length; at += 1) {
      if (body[at] === '{') depth += 1;
      else if (body[at] === '}') {
        depth -= 1;
        if (depth === 0) {
          closes = at;
          break;
        }
      }
    }

    const release = body.indexOf('releaseFor(');
    expect(release).toBeGreaterThan(opens);
    expect(closes).toBeGreaterThan(-1);
    expect(release).toBeLessThan(closes);
  });

  it('releases only when there is a card to release', () => {
    // Most of the works' sheets predate job cards and have no link at all.
    expect(JOB_SHEET).toMatch(/if \(sheet\.productionOrderId\) await releaseFor\(/);
  });
});

describe('nothing re-claims film that has already been issued', () => {
  it('guards every hold with the settled check', () => {
    /*
     * Once the sheet has posted, writing a claim again would put it alongside
     * the issue and take the same film off free stock twice — which is the one
     * thing this whole design exists to prevent. `createProduction` is the
     * exception and cannot be otherwise: a card being raised has no sheet.
     */
    const holds = SERVICE.match(/await holdFor\(/g) ?? [];
    expect(holds).toHaveLength(2);

    const update = SERVICE.slice(SERVICE.indexOf('export async function updateProduction'));
    const hold = update.indexOf('await holdFor(');
    const guard = update.indexOf('materialIsSettled');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(hold);
  });
});

/**
 * **Finishing a stage hands the reel to the next machine.**
 *
 * A job does not stop between stages. The floor should say once that printing
 * is done, not once to close the press and again to open the laminator.
 */
describe('the hand-off between stages', () => {
  it('happens when a stage is finished, and only then', () => {
    /*
     * Not on SKIPPED and not on a stage put back to pending: neither is work
     * finishing, and neither moves a reel anywhere.
     */
    const advance = SERVICE.indexOf('nextStageToStart(');
    const guard = SERVICE.lastIndexOf("if (movedTo === 'DONE')", advance);
    expect(advance).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(advance);
  });

  it('carries the weight off the row, not out of the request', () => {
    /*
     * The floor types the weight, it saves as they leave the box, and Finish is
     * a separate press — so the figure that matters is the one on the stage.
     */
    expect(SERVICE).toMatch(/const cameOff = toNumber\(finished\.outputKg\)/);
  });
});

describe('the material block applies to starting a job, not continuing one', () => {
  it('is skipped once the card is already running', () => {
    /*
     * Once a card is running its film is committed and partly consumed.
     * Refusing the laminator saves no film — it strands a printed reel between
     * two machines. The question the guard asks is "should this job begin".
     */
    expect(SERVICE).toMatch(/cardAlreadyRunning/);
    const guard = SERVICE.indexOf('!cardAlreadyRunning');
    const refuse = SERVICE.indexOf('refuseUnlessOverridden(', guard);
    expect(guard).toBeGreaterThan(-1);
    expect(refuse).toBeGreaterThan(guard);
  });
});
