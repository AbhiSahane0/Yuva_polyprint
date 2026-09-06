import { describe, expect, it } from 'vitest';
import {
  canRecord,
  designStatus,
  isOutOfStore,
  isUnusable,
  statusAfter,
  type CylinderStatus,
} from './cylinders.js';

/**
 * Where a cylinder is, derived from what happened to it.
 *
 * The rule these pin: **status is a fact about the last event, not a flag
 * somebody sets.** A cylinder marked "in store" by hand while it is on a
 * machine is exactly the one nobody can find — which is the failure the whole
 * module exists to prevent.
 */
describe('statusAfter', () => {
  it.each([
    ['ENGRAVED', 'IN_STORE'],
    ['RETURNED', 'IN_STORE'],
    ['REWORKED', 'IN_STORE'],
    ['ALLOCATED', 'ALLOCATED'],
    ['IN_USE', 'IN_USE'],
    ['DAMAGED', 'DAMAGED'],
    ['RETIRED', 'RETIRED'],
  ] as const)('%s leaves it %s', (kind, expected) => {
    expect(statusAfter(kind, 'IN_STORE')).toBe(expected);
  });

  it('leaves a transfer alone', () => {
    /*
     * Moving a cylinder between shelves changes where it is, not what it is
     * doing. A set carried to another store while mounted is still in use, and
     * resetting it to "in store" would say the machine is free when it is not.
     */
    expect(statusAfter('TRANSFERRED', 'IN_USE')).toBe('IN_USE');
    expect(statusAfter('TRANSFERRED', 'DAMAGED')).toBe('DAMAGED');
    expect(statusAfter('TRANSFERRED', 'IN_STORE')).toBe('IN_STORE');
  });

  it('brings a damaged cylinder back only through rework', () => {
    expect(statusAfter('REWORKED', 'DAMAGED')).toBe('IN_STORE');
    // Returning a damaged one to the shelf does not repair it... but it is
    // still a return, and the works records what happened rather than what
    // ought to have. Rework is the event that says it is usable again.
    expect(statusAfter('RETURNED', 'DAMAGED')).toBe('IN_STORE');
  });
});

describe('canRecord', () => {
  it('allows anything on a cylinder that is still in service', () => {
    // The works does not always record in order, and refusing a late entry
    // leaves the history wrong rather than letting it be corrected.
    for (const status of ['IN_STORE', 'ALLOCATED', 'IN_USE', 'DAMAGED'] as CylinderStatus[]) {
      expect(canRecord('IN_USE', status)).toBe(true);
    }
  });

  it('refuses to mount a retired cylinder', () => {
    // It has been scrapped or gone back to the customer. It is not there.
    expect(canRecord('ALLOCATED', 'RETIRED')).toBe(false);
    expect(canRecord('IN_USE', 'RETIRED')).toBe(false);
  });

  it('lets a retired cylinder be brought back by re-engraving it', () => {
    expect(canRecord('REWORKED', 'RETIRED')).toBe(true);
    expect(canRecord('ENGRAVED', 'RETIRED')).toBe(true);
  });
});

describe('designStatus', () => {
  it('is nothing when no cylinders have been registered', () => {
    // 382 of the imported jobs record a cylinder count but no cylinders. The
    // design exists; its set has not been entered.
    expect(designStatus([])).toBe('NONE');
  });

  it('takes the worst state, because that is the one to act on', () => {
    /*
     * A design with five good cylinders and one damaged one cannot be printed.
     * Reporting it as in store would be a lie of omission, and the damaged one
     * would be discovered at the machine.
     */
    expect(designStatus(['IN_STORE', 'IN_STORE', 'DAMAGED'])).toBe('DAMAGED');
    expect(designStatus(['IN_STORE', 'NEEDS_REWORK'])).toBe('NEEDS_REWORK');
    expect(designStatus(['IN_STORE', 'IN_USE'])).toBe('IN_USE');
  });

  it('is retired only when every cylinder is', () => {
    // One retired cylinder in a live set means a replacement is needed, not
    // that the design is finished with.
    expect(designStatus(['RETIRED', 'RETIRED'])).toBe('RETIRED');
    expect(designStatus(['RETIRED', 'IN_STORE'])).toBe('RETIRED');
  });

  it('is in store when the whole set is on the shelf', () => {
    expect(designStatus(['IN_STORE', 'IN_STORE', 'IN_STORE'])).toBe('IN_STORE');
  });
});

describe('the two groupings', () => {
  it('separates unusable from merely out', () => {
    // Different problems: one needs an engraver, the other needs the machine
    // to finish.
    expect(isUnusable('DAMAGED')).toBe(true);
    expect(isUnusable('NEEDS_REWORK')).toBe(true);
    expect(isUnusable('IN_USE')).toBe(false);

    expect(isOutOfStore('IN_USE')).toBe(true);
    expect(isOutOfStore('ALLOCATED')).toBe(true);
    expect(isOutOfStore('IN_STORE')).toBe(false);
  });
});
