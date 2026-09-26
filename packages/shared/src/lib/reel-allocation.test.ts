import { describe, expect, it } from 'vitest';
import { allocateReels, type Reel } from './reel-allocation.js';

const reel = (over: Partial<Reel> & { batchId: string }): Reel => ({
  batchCode: over.batchId,
  widthMm: 700,
  receivedOn: '2026-09-01',
  onHand: over.free ?? 100,
  free: 100,
  ...over,
});

describe('which reels a job takes', () => {
  it('takes the narrowest roll that will run the job', () => {
    /*
     * A 1040 mm roll spent on a 360 mm job is a wide roll the works no longer
     * has for a wide job — and wide rolls are the scarce ones, because film is
     * slit down and never widened.
     */
    const pick = allocateReels({
      needKg: 50,
      needsWidthMm: 360,
      reels: [reel({ batchId: 'wide', widthMm: 1040 }), reel({ batchId: 'narrow', widthMm: 400 })],
    });
    expect(pick.taken.map((t) => t.batchId)).toEqual(['narrow']);
  });

  it('rotates stock within a width, oldest first', () => {
    const pick = allocateReels({
      needKg: 50,
      needsWidthMm: 360,
      reels: [
        reel({ batchId: 'new', widthMm: 400, receivedOn: '2026-09-20' }),
        reel({ batchId: 'old', widthMm: 400, receivedOn: '2026-01-05' }),
      ],
    });
    expect(pick.taken.map((t) => t.batchId)).toEqual(['old']);
  });

  it('walks onto the next roll when one is not enough', () => {
    const pick = allocateReels({
      needKg: 250,
      needsWidthMm: 360,
      reels: [
        reel({ batchId: 'a', widthMm: 400, free: 100 }),
        reel({ batchId: 'b', widthMm: 450, free: 100 }),
        reel({ batchId: 'c', widthMm: 500, free: 100 }),
      ],
    });
    expect(pick.taken).toEqual([
      { batchId: 'a', batchCode: 'a', widthMm: 400, quantity: 100 },
      { batchId: 'b', batchCode: 'b', widthMm: 450, quantity: 100 },
      { batchId: 'c', batchCode: 'c', widthMm: 500, quantity: 50 },
    ]);
    expect(pick.shortBy).toBe(0);
  });

  it('will not touch a roll too narrow to run the job', () => {
    const pick = allocateReels({
      needKg: 50,
      needsWidthMm: 650,
      reels: [reel({ batchId: 'narrow', widthMm: 340, free: 900 })],
    });
    expect(pick.taken).toEqual([]);
    expect(pick.usable).toBe(0);
    expect(pick.tooNarrowKg).toBe(900);
    expect(pick.shortBy).toBe(50);
  });

  it('reaches for a roll of unknown width only after the ones that are known to fit', () => {
    /*
     * It might fit and it might not. Something that MIGHT fit is reached for
     * after everything that is known to.
     */
    const pick = allocateReels({
      needKg: 150,
      needsWidthMm: 400,
      reels: [
        reel({ batchId: 'unknown', widthMm: null, free: 100 }),
        reel({ batchId: 'known', widthMm: 900, free: 100 }),
      ],
    });
    expect(pick.taken.map((t) => t.batchId)).toEqual(['known', 'unknown']);
  });

  it('ignores a roll nothing is left of', () => {
    const pick = allocateReels({
      needKg: 50,
      needsWidthMm: 400,
      reels: [reel({ batchId: 'empty', free: 0 }), reel({ batchId: 'full', free: 80 })],
    });
    expect(pick.taken.map((t) => t.batchId)).toEqual(['full']);
  });

  it('takes what it can and reports the rest as short', () => {
    const pick = allocateReels({
      needKg: 500,
      needsWidthMm: 400,
      reels: [reel({ batchId: 'a', free: 120 })],
    });
    expect(pick.taken[0]!.quantity).toBe(120);
    expect(pick.shortBy).toBe(380);
  });

  it('takes nothing for a job that needs nothing', () => {
    const pick = allocateReels({ needKg: 0, needsWidthMm: 400, reels: [reel({ batchId: 'a' })] });
    expect(pick.taken).toEqual([]);
    expect(pick.shortBy).toBe(0);
  });

  it('gives the same answer twice over, whatever order the rolls arrive in', () => {
    // Two rolls of one width received the same day still have to pick one.
    const rolls = [
      reel({ batchId: 'b2', widthMm: 400, receivedOn: '2026-09-01', free: 30 }),
      reel({ batchId: 'b1', widthMm: 400, receivedOn: '2026-09-01', free: 30 }),
    ];
    const first = allocateReels({ needKg: 20, needsWidthMm: 400, reels: rolls });
    const second = allocateReels({ needKg: 20, needsWidthMm: 400, reels: [...rolls].reverse() });
    expect(first.taken).toEqual(second.taken);
  });
});
