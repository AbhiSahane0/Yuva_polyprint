import { describe, expect, it } from 'vitest';
import { needsWhiteBase } from './job-colours.js';

/**
 * **Printing on clear film without a white behind it gives a washed-out pack.**
 *
 * The works buys LDPE as milky and as natural, and until October 2026 the rate
 * master carried them as one row — so the question never came up on screen and
 * the white was remembered or it was not. Splitting the films made the rule
 * statable, and this is it.
 */
describe('which films need a white laid down first', () => {
  it('asks for one behind any natural film', () => {
    expect(needsWhiteBase(['PET 12µm', 'MET PET 12µm', 'LDPE Natural'])).toBe(true);
    expect(needsWhiteBase(['Nylon Natural'])).toBe(true);
  });

  it('does not behind a pigmented one', () => {
    expect(needsWhiteBase(['PET 12µm', 'MET PET 12µm', 'LDPE Milky'])).toBe(false);
    expect(needsWhiteBase(['W/O Poly 110µm', 'PP Film'])).toBe(false);
  });

  it('matches the word, not a fragment of another', () => {
    /* A film whose name merely contains the letters is not a clear film. */
    expect(needsWhiteBase(['Naturalite Board'])).toBe(false);
    expect(needsWhiteBase(['LDPE NATURAL'])).toBe(true);
  });

  it('is unbothered by a ply nobody has chosen yet', () => {
    expect(needsWhiteBase([null, undefined, ''])).toBe(false);
  });
});
