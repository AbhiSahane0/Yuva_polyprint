import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The same omission guard as `item-persistence`, one level up.
 *
 * A quotation's own columns — the customer block, the referrer — are written by
 * three paths: creating one, updating one, and copying one into a new version.
 * A column added to the first and forgotten in the third is invisible until
 * somebody reprices a document and watches a field empty itself, which is the
 * exact shape of the gazette bug that test was written for.
 *
 * Source-level rather than a round trip, for the same reason: a field nobody
 * wrote cannot be observed by exercising the fields that were.
 */
const SOURCE = readFileSync(
  fileURLToPath(new URL('./quotation.service.ts', import.meta.url)),
  'utf8',
);

/** A write block, from its call through to the nested `tiers:` relation. */
function blockAt(marker: string, from = 0): string {
  const start = SOURCE.indexOf(marker, from);
  if (start === -1) return '';
  const end = SOURCE.indexOf('tiers:', start);
  return SOURCE.slice(start, end === -1 ? start + 3000 : end);
}

const createBlock = blockAt('const created = await tx.quotation.create({');
const revisionBlock = blockAt(
  'const created = await tx.quotation.create({',
  SOURCE.indexOf('const created = await tx.quotation.create({') + 1,
);
const updateBlock = blockAt('await tx.quotation.update({');

describe('every path that writes a quotation header', () => {
  it('found all three', () => {
    expect(createBlock).not.toBe('');
    expect(revisionBlock).not.toBe('');
    expect(updateBlock).not.toBe('');
    // Create and revision are two different blocks, not the same one twice.
    expect(revisionBlock).not.toBe(createBlock);
  });

  it.each(['customerName', 'mobile', 'email', 'gstNumber', 'referredBy'])(
    'creating a quotation writes %s',
    (field) => {
      expect(createBlock).toContain(`${field}:`);
    },
  );

  it.each(['customerName', 'mobile', 'email', 'gstNumber', 'referredBy'])(
    'a revision carries %s across',
    (field) => {
      /*
       * A revision is the same enquiry repriced. The customer already has the
       * number on their desk, so everything about who it is for — and who sent
       * it — comes with it.
       */
      expect(revisionBlock).toContain(`${field}: source.${field}`);
    },
  );

  it.each(['customerName', 'mobile', 'email', 'gstNumber', 'referredBy'])(
    'updating a quotation can change %s',
    (field) => {
      expect(updateBlock).toContain(`input.${field}`);
    },
  );
});

/**
 * **The referrer is internal.** The works records who sent an enquiry their
 * way; the customer reading the quotation has no business seeing it, and
 * neither has the email that carries it.
 *
 * Asserted against the source of the document and the mail rather than a
 * rendered page, because the failure would be somebody adding it to a template
 * for convenience — which is a change to these files and nothing else.
 */
describe('what the customer is sent', () => {
  const PRINTED = [
    './quotation-document.ts',
    './quotation-letterhead.ts',
    './quotation-email.ts',
    './quotation-pdf.ts',
  ];

  const read = (relative: string) =>
    readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

  it('is built by the four files below', () => {
    /* Read rather than skipped when missing. A "does not contain" test over a
       file that is not there passes for the wrong reason, which is how this
       guard would quietly stop guarding after a rename. */
    for (const relative of PRINTED) expect(read(relative).length).toBeGreaterThan(0);
  });

  it.each(PRINTED)('%s never mentions the referrer', (relative) => {
    expect(read(relative)).not.toContain('referredBy');
  });
});
