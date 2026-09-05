import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Two properties of the register that no unit test of a pure function reaches,
 * and both are failures of omission.
 *
 * A design is a job. If this module ever grew its own notion of a customer or a
 * product, there would be two answers to "who is this design for" and the
 * quotation wizard — which already treats a saved job as the design it charges
 * cylinders for — would be reading the other one.
 */
const SOURCE = readFileSync(
  fileURLToPath(new URL('./cylinder.service.ts', import.meta.url)),
  'utf8',
);
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('the cylinder register', () => {
  it('derives status from the event, never from the caller', () => {
    /*
     * The whole point. A cylinder whose status is typed separately from its
     * history can say "in store" while the history says it went out and never
     * came back — which is the cylinder nobody can find.
     */
    expect(CODE).toContain('statusAfter(input.kind, cylinder.status)');
    // The event schema has no status field, so there is nothing to trust.
    expect(CODE).not.toContain('input.status');
    expect(CODE).not.toContain('input.statusAfter');
  });

  it('never edits or deletes an event', () => {
    // "Who had it last and when" is the value; a history that can be rewritten
    // answers nothing.
    for (const forbidden of [
      'cylinderEvent.update',
      'cylinderEvent.delete',
      'cylinderEvent.deleteMany',
      'cylinderEvent.upsert',
    ]) {
      expect(CODE).not.toContain(forbidden);
    }
  });

  it('writes the event and the new status in one transaction', () => {
    // A status that moved without an event explaining it is exactly the drift
    // this module exists to prevent.
    const start = CODE.indexOf('export async function recordEvent');
    const block = CODE.slice(start, CODE.indexOf('\nexport ', start + 1));
    expect(block).toContain('prisma.$transaction');
    expect(block).toContain('tx.cylinderEvent.create');
    expect(block).toContain('tx.cylinder.update');
  });

  it('keeps the design’s identity on the job', () => {
    /*
     * Customer, product and expected count are read from the job, never stored
     * again here. A second copy would be free to disagree, and the quotation
     * module reads the first.
     */
    // Read from the job and its customer...
    expect(CODE).toContain('row.customer');
    expect(CODE).toContain('row.totalCylinders');

    /*
     * ...and never written. The response carries a `customerName`, but it is
     * derived on the way out rather than stored — so the assertion is about
     * writes, not about the name appearing.
     */
    for (const forbidden of [
      'customer.create',
      'customer.update',
      'job.create',
      'job.update',
      'job.delete',
    ]) {
      expect(CODE).not.toContain(forbidden);
    }
  });

  it('refuses to mount a retired cylinder', () => {
    expect(CODE).toContain('canRecord(');
    expect(CODE).toContain('been retired');
  });
});
