import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Every column of a quotation line has to be written by every path that writes
 * a line, and there are three: creating a quotation, updating one, and copying
 * one into a new version.
 *
 * This exists because the gazette flags were added to one of the three. The
 * geometry spread carried the film size across, so the stored line showed the
 * enlarged size and the correct pouches-per-kilogram while recording itself as
 * an ordinary flat bag — right on the screen, wrong in the database, and
 * impossible to reprice or explain afterwards.
 *
 * A source-level check rather than a round trip because the failure is one of
 * omission: a field nobody wrote cannot be observed by exercising the fields
 * that were.
 */
const SOURCE = readFileSync(
  fileURLToPath(new URL('./quotation.service.ts', import.meta.url)),
  'utf8',
);

/** The blocks that build a `quotationItem.create`, one per write path. */
function itemWriteBlocks(): string[] {
  const blocks: string[] = [];
  let from = SOURCE.indexOf('tx.quotationItem.create');

  while (from !== -1) {
    // Up to the nested `layers:` relation, which every block ends with.
    const end = SOURCE.indexOf('layers: {', from);
    blocks.push(SOURCE.slice(from, end === -1 ? from + 2000 : end));
    from = SOURCE.indexOf('tx.quotationItem.create', from + 1);
  }

  return blocks;
}

describe('every path that writes a quotation line', () => {
  const blocks = itemWriteBlocks();

  it('there are three of them', () => {
    // Create, update, and copy-into-a-new-version. If this number changes, the
    // list below needs revisiting rather than the test relaxing.
    expect(blocks).toHaveLength(3);
  });

  it.each([
    'jobKind',
    'pouchType',
    'widthMm',
    'heightMm',
    'isGazette',
    'gazetteBottom',
    'gazetteLeft',
    'gazetteRight',
    'pricingBasis',
    'repeatWidth',
    'repeatHeight',
    'cylinderCount',
    'transportCost',
    'chargeCylinders',
  ])('writes %s', (field) => {
    for (const [index, block] of blocks.entries()) {
      expect(block, `write path ${index + 1} is missing ${field}`).toContain(`${field}:`);
    }
  });

  it('carries the computed figures too, however each path writes them', () => {
    /*
     * micron, the film size, pouches per kilogram and the four cylinder
     * figures. Two paths spread `entry.geometry` wholesale; the version copy
     * names them one by one, because it is copying a stored row rather than a
     * freshly priced one. Either is fine — leaving them out is not.
     */
    for (const [index, block] of blocks.entries()) {
      const spread = /\.\.\.entry\.geometry/.test(block);
      const named = ['filmWidthMm', 'filmHeightMm', 'pouchesPerKg', 'cylinderWidth'].every(
        (field) => block.includes(`${field}:`),
      );
      expect(spread || named, `write path ${index + 1} carries neither`).toBe(true);
    }
  });
});
