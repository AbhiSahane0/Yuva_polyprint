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
      'customer.delete',
      'job.create',
      'job.update',
      'job.upsert',
    ]) {
      expect(CODE).not.toContain(forbidden);
    }
  });

  it('deletes a job only from deleteDesign, and never a customer', () => {
    /*
     * `job.delete` was on the forbidden list above until the register grew a
     * way to delete a design, which is a job. It came off deliberately: the
     * rule that list protects is that the design's identity has exactly one
     * home, and removing that home does not give it a second one.
     *
     * What still has to hold is that it happens in one place, on purpose,
     * after asking — and that the customer is not taken with it, which is the
     * thing the office actually worries about.
     */
    const deletes = CODE.match(/job\.delete/g) ?? [];
    expect(deletes).toHaveLength(1);

    const block = CODE.slice(CODE.indexOf('export async function deleteDesign'));
    /* It refuses before it destroys. */
    expect(block.indexOf('impact.canDelete')).toBeLessThan(block.indexOf('job.delete'));
    /* Files leave the bucket before their rows cascade away. */
    expect(block.indexOf('eraseAllForJob')).toBeLessThan(block.indexOf('job.delete'));
    /* Cylinders go with it; their key is Restricted, so it must be explicit. */
    expect(block).toContain('tx.cylinder.deleteMany');
    /* And nothing here touches the customer. */
    expect(block).not.toContain('customer');
  });

  it('needs the customers module as well to delete a design', () => {
    /*
     * The screen belongs to the cylinders module, but the record being
     * destroyed is a job — which `/jobs` is gated on customers for. Somebody
     * trusted with the cylinder register is not automatically somebody trusted
     * to delete a customer's design, and one tick box should not answer both.
     */
    const routes = readFileSync(
      fileURLToPath(new URL('./cylinder.routes.ts', import.meta.url)),
      'utf8',
    );
    const block = routes.slice(routes.indexOf("router.delete(\n  '/:id'"));
    const deleteRoute = block.slice(0, block.indexOf(');'));
    expect(deleteRoute).toContain("requireModule('cylinders')");
    expect(deleteRoute).toContain("requireModule('customers')");
  });

  it('refuses to mount a retired cylinder', () => {
    expect(CODE).toContain('canRecord(');
    expect(CODE).toContain('been retired');
  });
});

/**
 * **Why a cylinder is away follows the same rule its status does.**
 *
 * The register's one law is that a cylinder's state is a fact about its last
 * event rather than a flag somebody sets, and the repair reason is state: a
 * cylinder printing happily while the register says "cyan worn across the
 * gusset" is the same lie as one marked in store while it is on a machine.
 *
 * So it is written in exactly one place — the event recorder — and the editor
 * that corrects a cylinder's details cannot touch it.
 */
describe('the repair reason', () => {
  it('is written only where the event is', () => {
    /* Set when it goes out... */
    expect(CODE).toContain("const sending = input.kind === 'SENT_FOR_REPAIR'");
    expect(CODE).toContain('repairReason: input.repairReason');
  });

  it('cannot be typed in by hand', () => {
    /*
     * `updateCylinder` corrects colour, position, ownership, location, size
     * and cost. If it could set this too, the register would have two writers
     * and no way to say which was right.
     */
    const editor = CODE.slice(CODE.indexOf('export async function updateCylinder'));
    expect(editor).not.toContain('repairReason');
  });

  it('is cleared by anything that ends the trip', () => {
    // Not only by the repair coming back. A cylinder mounted, returned or
    // retired is not out for repair whatever its last reason said.
    expect(CODE).toContain("repairReason: '' }");
  });
});
