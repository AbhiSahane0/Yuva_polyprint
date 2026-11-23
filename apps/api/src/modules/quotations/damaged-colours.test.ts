import { describe, expect, it } from 'vitest';
import { classifyColourDamage, type LineUnderTest } from './damaged-colours.js';

/**
 * **A check that finds nothing has to be shown finding something.**
 *
 * Run against the works' database the listing reports no damage, which is the
 * answer everybody wants and exactly the answer a broken check gives. These
 * build the damage by hand instead.
 */

const CREATED = new Date('2026-10-04T09:00:00.000Z');
const SAME_SAVE = new Date('2026-10-04T09:00:12.000Z');
const REOPENED = new Date('2026-11-20T15:30:00.000Z');

const CMYK = [
  { name: 'Cyan', kind: 'PROCESS' },
  { name: 'Magenta', kind: 'PROCESS' },
  { name: 'Yellow', kind: 'PROCESS' },
  { name: 'Black', kind: 'PROCESS' },
];

const line = (over: Partial<LineUnderTest>): LineUnderTest => ({
  colours: CMYK,
  cylinderCount: 4,
  createdAt: CREATED,
  updatedAt: SAME_SAVE,
  ...over,
});

describe('spotting a line the reopening bug overwrote', () => {
  /* What the office reported, as the database holds it. */
  it('catches the one White special on a job priced for five cylinders', () => {
    expect(
      classifyColourDamage(
        line({
          colours: [{ name: 'White', kind: 'SPECIAL' }],
          cylinderCount: 5,
          updatedAt: REOPENED,
        }),
      ),
    ).toBe('CERTAIN');
  });

  it('catches the colours cleared outright on a reopened document', () => {
    /* No white base wanted, so nothing was added back and the save wrote
       an empty set. */
    expect(classifyColourDamage(line({ colours: [], updatedAt: REOPENED }))).toBe('CLEARED');
  });

  it('does not care how White is spelt or spaced', () => {
    expect(
      classifyColourDamage(
        line({
          colours: [{ name: '  white ', kind: 'SPECIAL' }],
          cylinderCount: 6,
          updatedAt: REOPENED,
        }),
      ),
    ).toBe('CERTAIN');
  });
});

describe('what it must not cry wolf over', () => {
  /*
   * The five lines in the works' database, every one of them healthy. The
   * first version of this check called all five damaged, which would have
   * sent the office re-keying quotations that were already right.
   */
  it('leaves CMYK against five or six cylinders alone', () => {
    expect(classifyColourDamage(line({ cylinderCount: 5 }))).toBe('HEALTHY');
    expect(classifyColourDamage(line({ cylinderCount: 6 }))).toBe('HEALTHY');
    expect(
      classifyColourDamage(
        line({ colours: [...CMYK, { name: 'Mango Orange (spot)', kind: 'SPECIAL' }] }),
      ),
    ).toBe('HEALTHY');
  });

  it('leaves a genuine one-colour white job alone', () => {
    /* One colour, one cylinder. Nothing was taken away. */
    expect(
      classifyColourDamage(
        line({ colours: [{ name: 'White', kind: 'SPECIAL' }], cylinderCount: 1 }),
      ),
    ).toBe('HEALTHY');
  });

  it('leaves a white PROCESS ink alone — the bug only ever adds a special', () => {
    expect(
      classifyColourDamage(
        line({
          colours: [{ name: 'White', kind: 'PROCESS' }],
          cylinderCount: 5,
          updatedAt: REOPENED,
        }),
      ),
    ).toBe('HEALTHY');
  });

  it('sets aside a document written before colours existed', () => {
    expect(
      classifyColourDamage(
        line({
          colours: [],
          createdAt: new Date('2026-08-20T09:00:00.000Z'),
          updatedAt: new Date('2026-08-20T09:00:00.000Z'),
        }),
      ),
    ).toBe('PRE_COLOURS');
  });

  /*
   * The bug needed a reopening. A document saved once and never touched
   * since cannot have been through it, whatever its colours look like.
   */
  it('clears the same shapes on a document never edited', () => {
    expect(
      classifyColourDamage(
        line({ colours: [{ name: 'White', kind: 'SPECIAL' }], cylinderCount: 5 }),
      ),
    ).toBe('NOT_THE_BUG');
    expect(classifyColourDamage(line({ colours: [] }))).toBe('NOT_THE_BUG');
  });

  /* A save a few seconds after the create is the create, not a reopening. */
  it('does not count the creating save as an edit', () => {
    expect(
      classifyColourDamage(
        line({
          colours: [{ name: 'White', kind: 'SPECIAL' }],
          cylinderCount: 5,
          updatedAt: new Date(CREATED.getTime() + 30_000),
        }),
      ),
    ).toBe('NOT_THE_BUG');
  });
});
