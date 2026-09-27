import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Dispatch, guarded at the source.
 *
 * The arithmetic is tested where it lives, as a pure function, in
 * `@yuva/shared`'s dispatch.test.ts. What cannot be reached that way is the
 * shape of this service: that it moves no stock, that it settles an order in
 * one transaction, and that a draft counts for nothing. Every one of those is a
 * failure of omission — a second way of doing something, or a check quietly
 * moved outside the transaction that made it safe.
 */
const SOURCE = readFileSync(
  fileURLToPath(new URL('./dispatch.service.ts', import.meta.url)),
  'utf8',
);
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/** One exported function's body, comments already stripped. */
function body(name: string): string {
  const start = CODE.indexOf(`export async function ${name}`);
  expect(start, `${name} is exported`).toBeGreaterThan(-1);
  const next = CODE.indexOf('\nexport ', start + 1);
  return CODE.slice(start, next === -1 ? undefined : next);
}

describe('dispatch moves no stock', () => {
  /*
   * The invariant the whole system rests on: the job card claims, the job sheet
   * issues, and nothing else touches the shelf. A lorry leaving is not a stock
   * movement — the material left stock when the sheet was posted, and deducting
   * it again here would take every delivered job off twice.
   */
  it('never writes a batch, a movement or a reservation', () => {
    for (const forbidden of [
      'stockBatch',
      'stockMovement',
      'receiveStock',
      'issueStock',
      'stockReservation',
      'holdFor(',
    ]) {
      expect(CODE, `dispatch must not touch ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('reads a job sheet only for what the run produced', () => {
    /* finalOutputKg and nothing else. A sheet is a costing document; dispatch
       has no business in its rates, its labour or its wastage. */
    const reads = CODE.match(/jobSheet: \{ select: \{ ([^}]*) \} \}/g) ?? [];
    expect(reads.length).toBeGreaterThan(0);
    for (const read of reads) expect(read).toBe('jobSheet: { select: { finalOutputKg: true } }');
  });
});

describe('only a note that has gone out counts', () => {
  it('sums delivered quantities from dispatched notes alone', () => {
    /*
     * A draft is not a delivery. If this filter ever widens, two clerks drafting
     * the same 500 kg would each see it as already gone, and every order would
     * read as delivered the moment somebody started typing.
     */
    const start = CODE.indexOf('async function deliveryFor');
    const block = CODE.slice(start, CODE.indexOf('\nfunction toLine', start));
    expect(block).toContain("dispatch: { status: 'DISPATCHED' }");
  });

  it('counts only finished runs as produced', () => {
    const start = CODE.indexOf('async function deliveryFor');
    const block = CODE.slice(start, CODE.indexOf('\nfunction toLine', start));
    // A card still on the machine has made nothing anybody can load.
    expect(block).toContain("status: 'COMPLETED'");
  });
});

describe('sending it', () => {
  const post = body('postDispatch');

  it('does the whole thing in one transaction', () => {
    expect(post).toContain('prisma.$transaction');
    /* And with the shared limit: posting walks the lines, then the orders, and
       five seconds against a hosted database is not enough for either. */
    expect(post).toContain('TX');
  });

  it('checks what was made inside that transaction, not before it', () => {
    /*
     * The one thing that makes two clerks with the same goods safe. Read the
     * godown outside the transaction and there is a window in which both notes
     * pass the check and both post.
     */
    const opens = post.indexOf('$transaction');
    const checks = post.indexOf('deliveryFor');
    const commits = post.lastIndexOf('}, TX)');
    expect(opens).toBeGreaterThan(-1);
    expect(checks).toBeGreaterThan(opens);
    expect(checks).toBeLessThan(commits);
  });

  it('refuses to send more than was made unless somebody says why', () => {
    expect(post).toContain('overrideReason');
    expect(post).toContain('ApiError.conflict');
  });

  it('stamps the override only when it was actually needed', () => {
    // A reason on file must always mean a note that really did go out over what
    // the works had made, otherwise the record teaches nothing.
    expect(post).toMatch(/over\.length > 0\s*\?\s*\{ overrideReason/);
  });

  it('completes an order only when the whole of it has gone', () => {
    expect(post).toContain('isFullyDispatched');
    expect(post).toContain("status: 'COMPLETED'");
    /* Asked again AFTER the note is marked dispatched — the figure that decides
       completion has to include the note doing the deciding. */
    const marked = post.indexOf("status: 'DISPATCHED'");
    const reread = post.lastIndexOf('deliveryFor');
    expect(reread).toBeGreaterThan(marked);
  });

  it('never re-completes or resurrects a settled order', () => {
    expect(post).toContain("order.status === 'COMPLETED'");
    expect(post).toContain("order.status === 'CANCELLED'");
  });
});

describe('a lorry that came back', () => {
  const cancel = body('cancelDispatch');

  it('gives a completed order back to production', () => {
    expect(cancel).toContain("status: 'IN_PRODUCTION'");
    /* And clears the stamp, so nothing reads as completed on a date it wasn't. */
    expect(cancel).toContain('completedAt: null');
  });

  it('gives nothing back for a draft, which never counted', () => {
    expect(cancel).toContain('wasOut');
  });

  it('takes a reason', () => {
    expect(cancel).toContain('input.reason');
  });

  it('only reopens an order the delivery no longer covers', () => {
    expect(cancel).toContain('isFullyDispatched');
  });
});

describe('what may still be changed', () => {
  it('edits only a draft', () => {
    expect(body('updateDispatch')).toContain("existing.status !== 'DRAFT'");
  });

  it('deletes only a draft', () => {
    const remove = body('deleteDispatch');
    expect(remove).toContain("existing.status !== 'DRAFT'");
    expect(remove).toContain('Cancel it instead');
  });
});

describe('the challan reads one way', () => {
  it('writes a line’s weight from its reels, never from the typed total', () => {
    /*
     * The reels are the total where there are any. A stored figure that
     * disagrees with the rows beneath it is a challan the works and the customer
     * read differently, and there is no arguing with it afterwards.
     */
    const start = CODE.indexOf('function lineData');
    const block = CODE.slice(start, CODE.indexOf('\nexport ', start));
    expect(block).toContain('quantityKg: lineNetKg(line)');
    expect(block).not.toContain('quantityKg: line.quantityKg');
  });

  it('snapshots the job name rather than reading it live', () => {
    // An old challan must still name the job it carried, whatever the design
    // has been renamed to since.
    expect(CODE).toContain('jobName');
    expect(body('createDispatch')).toContain('resolved[index]!.jobName');
  });
});

describe('one note, one customer', () => {
  it('refuses an order belonging to somebody else', () => {
    const start = CODE.indexOf('async function resolveLines');
    const block = CODE.slice(start, CODE.indexOf('\nfunction lineData', start));
    expect(block).toContain('order.customerId !== customerId');
    expect(block).toContain('ApiError');
  });

  it('refuses to send against a cancelled order', () => {
    const start = CODE.indexOf('async function resolveLines');
    const block = CODE.slice(start, CODE.indexOf('\nfunction lineData', start));
    expect(block).toContain("order.status === 'CANCELLED'");
  });
});

describe('the godown queue is derived', () => {
  const ready = body('readyToSend');

  it('holds no ready-to-dispatch flag', () => {
    /* The flag somebody forgets to tick is the flag that is always wrong. */
    expect(CODE).not.toContain('isReady');
    expect(CODE).not.toContain('readyToDispatch:');
  });

  it('drops an order once nothing is standing on the floor', () => {
    expect(ready).toContain('readyKg > 0');
  });

  it('works out lateness against today rather than storing it', () => {
    expect(ready).toContain('isOverdue');
    expect(ready).toContain('today()');
  });
});
