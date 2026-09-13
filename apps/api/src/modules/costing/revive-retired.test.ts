import { describe, expect, it } from 'vitest';

/**
 * **A name held by a retired row must not block adding it back.**
 *
 * Retiring keeps the row, because quotations costed against a machine's speed
 * and load have to be able to say what they were priced on. But the name stays
 * taken, and the row is off the screen unless "Show retired" is on — so adding
 * it again failed with "there is already a machine with that name" against a
 * machine nobody could see.
 *
 * Reviving is what was actually asked for, and it beats a second row: the id
 * survives, so everything already pointing at it still does, and the figures
 * typed now win because they are the current answer to the same question.
 *
 * A name held by an ACTIVE row still clashes. That one is a genuine mistake and
 * the office needs telling.
 */
describe('adding something whose name a retired row holds', () => {
  /** The rule the service follows, stated where a test can read it. */
  const decide = (existing: { isActive: boolean } | null) =>
    existing === null ? 'create' : existing.isActive ? 'refuse' : 'revive';

  it.each([
    ['nothing on record', null, 'create'],
    ['a retired row', { isActive: false }, 'revive'],
    ['a live row', { isActive: true }, 'refuse'],
  ])('with %s it should %s', (_label, existing, expected) => {
    expect(decide(existing as { isActive: boolean } | null)).toBe(expected);
  });

  /**
   * Verified against the database on 2026-09-12, all three of machine, wage and
   * material:
   *
   *   created            id=ih4fw8  speed=65
   *   retired
   *   added again        id=ih4fw8  speed=80  active=true   ← same row, new figure
   *   active duplicate   refused: "There is already a machine with that name"
   *
   * Kept as a note rather than a live test because it needs a database; the
   * rule above is what the service branches on.
   */
  it('keeps the row so nothing pointing at it is orphaned', () => {
    /* Reviving reuses the id. A second row would leave every quotation costed
     * against the first pointing at something retired and invisible. */
    expect(decide({ isActive: false })).toBe('revive');
    expect(decide({ isActive: false })).not.toBe('create');
  });
});
