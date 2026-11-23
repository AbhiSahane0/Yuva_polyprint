import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * **A ply with no film chosen has no thickness.**
 *
 * The blank job card used to open at 12µ and 50µ — a PET over a poly, which is
 * the common structure and so looked like a kindness. It was not. No film was
 * named beside either figure, so the card read as a 62µ laminate of nothing,
 * the total micron under it agreed, and the weight that follows from it was
 * decided by two numbers nobody had typed.
 *
 * Nought says what is true. Choosing a film then fills the gauge in from the
 * film's own name, which is where that figure should come from and is pinned
 * separately in `LayerFields.test.tsx` — "fills the micron in from the family
 * when the box is empty". The two halves only work together, which is why this
 * one is worth holding down.
 *
 * Read from source because what matters is the constant the form opens with,
 * and rendering the whole wizard to reach it would test everything but that.
 *
 * `BLANK_DESIGN` moved out of the page into `lib/saved-job.ts` when the job
 * name arrived on the Customer step and two screens needed the same rule for
 * applying a saved job. The constant is unchanged; only its address is.
 */
const BLANK = readFileSync(resolve(__dirname, '../lib/saved-job.ts'), 'utf8');
const FORM = readFileSync(resolve(__dirname, './QuotationFormPage.tsx'), 'utf8');

describe('the blank job card', () => {
  it('opens both plies at nought, with no film and no gauge', () => {
    const layers = BLANK.slice(BLANK.indexOf('  layers: ['));
    const body = layers.slice(0, layers.indexOf('],'));

    expect(body).toContain("{ materialId: null, micron: 0, rateOverride: '' }");
    /* Both of them, and nothing else hiding in the list. */
    expect(body.match(/micron: 0/g)).toHaveLength(2);
    expect(body).not.toMatch(/micron: (?!0)\d/);
  });

  it('seeds no thickness from the PET constant any more', () => {
    // The old default came from `PET_MICRON_PER_LAYER`, which is a real figure
    // about PET and not about an empty box. It has no business here.
    expect(FORM).not.toContain('PET_MICRON_PER_LAYER');
    expect(BLANK).not.toContain('PET_MICRON_PER_LAYER');
  });
});
