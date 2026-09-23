import { describe, expect, it } from 'vitest';
import {
  canMoveProductionTo,
  productionProgress,
  PRODUCTION_STATUSES,
  requiredStages,
  stageWasteKg,
} from './production.js';

/**
 * **Not every product goes through every process, and the system knows.**
 *
 * The central claim of the whole pitch, and the one thing a job card must get
 * right before anything else on it means anything. It is derived from the
 * structure — the same ply count the costing already charges lamination passes
 * from — so a job card and the quotation behind it cannot disagree about what
 * the job involves.
 */
describe('which stages a job needs', () => {
  const names = (job: Parameters<typeof requiredStages>[0]) =>
    requiredStages(job).map((s) => (s.pass ? `${s.stage}${s.pass}` : s.stage));

  it('takes an ordinary two-ply pouch through all four', () => {
    expect(names({ plyCount: 2, makesPouches: true })).toEqual([
      'PRINTING',
      'LAMINATION1',
      'SLITTING',
      'POUCHING',
    ]);
  });

  it('laminates once per BOND, so three plies is two passes', () => {
    /*
     * The same arithmetic the costing charges for, and the reason a three-ply
     * job takes longer than a two-ply one of the same weight. Each pass is its
     * own row because it is a separate run with its own operator and its own
     * waste — the works' job sheet names them Lamination 1 and Lamination 2.
     */
    expect(names({ plyCount: 3, makesPouches: true })).toEqual([
      'PRINTING',
      'LAMINATION1',
      'LAMINATION2',
      'SLITTING',
      'POUCHING',
    ]);
  });

  it('gives a single ply nothing to laminate', () => {
    expect(names({ plyCount: 1, makesPouches: true })).toEqual([
      'PRINTING',
      'SLITTING',
      'POUCHING',
    ]);
  });

  it('never makes pouches out of a reel', () => {
    // A roll is not converted into anything, which is also why it carries no
    // pouch-making charge on the quotation.
    expect(names({ plyCount: 2, makesPouches: false })).toEqual([
      'PRINTING',
      'LAMINATION1',
      'SLITTING',
    ]);
  });

  it('skips the press on plain unprinted film', () => {
    // The wireframe's own short job: it still gets slit, it simply never
    // reaches the press.
    expect(names({ plyCount: 1, makesPouches: false, isPrinted: false })).toEqual(['SLITTING']);
  });

  it('numbers the positions in the order the job meets them', () => {
    const stages = requiredStages({ plyCount: 3, makesPouches: true });
    expect(stages.map((s) => s.position)).toEqual([1, 2, 3, 4, 5]);
  });

  it('survives nonsense rather than producing a card nobody can run', () => {
    expect(names({ plyCount: 0, makesPouches: false })).toEqual(['PRINTING', 'SLITTING']);
    expect(names({ plyCount: -4, makesPouches: false })).toEqual(['PRINTING', 'SLITTING']);
  });
});

describe('how far along a job card is', () => {
  const stage = (status: 'PENDING' | 'RUNNING' | 'DONE' | 'SKIPPED') => ({ status });

  it('is the share of applicable stages that are done', () => {
    expect(
      productionProgress([stage('DONE'), stage('DONE'), stage('PENDING'), stage('PENDING')]),
    ).toBe(50);
  });

  it('leaves skipped stages out of BOTH halves', () => {
    /*
     * A job that skips three of four is not three-quarters done before it
     * starts — and it is not stuck at 25% when its one real stage finishes.
     */
    expect(productionProgress([stage('SKIPPED'), stage('SKIPPED'), stage('PENDING')])).toBe(0);
    expect(productionProgress([stage('SKIPPED'), stage('SKIPPED'), stage('DONE')])).toBe(100);
  });

  it('is zero on a card with nothing to do, not a division by nothing', () => {
    expect(productionProgress([])).toBe(0);
    expect(productionProgress([stage('SKIPPED')])).toBe(0);
  });

  it('counts a running stage as not yet done', () => {
    // Half a stage is not half a stage's worth of output.
    expect(productionProgress([stage('RUNNING'), stage('PENDING')])).toBe(0);
  });
});

describe('what a stage lost', () => {
  it('is what went in less what came out', () => {
    expect(stageWasteKg({ inputKg: 260, outputKg: 255 })).toBe(5);
  });

  it('reports a negative rather than hiding it at zero', () => {
    /*
     * More off a machine than went onto it means one of the two weights is
     * wrong. A quiet zero is how that goes unnoticed for a year — the works'
     * own Samarth Atta sheet does exactly this, and it is worth seeing.
     */
    expect(stageWasteKg({ inputKg: 2200, outputKg: 2240 })).toBe(-40);
  });

  it('is nothing at all before anybody has weighed anything', () => {
    expect(stageWasteKg({ inputKg: 0, outputKg: 0 })).toBe(0);
  });
});

describe('moving a job card along', () => {
  it('goes planned to running to completed', () => {
    expect(canMoveProductionTo('PLANNED', 'RUNNING')).toBe(true);
    expect(canMoveProductionTo('RUNNING', 'COMPLETED')).toBe(true);
  });

  it('lets a hold be lifted, because a hold is temporary', () => {
    // The one move that goes back, and the only one.
    expect(canMoveProductionTo('RUNNING', 'ON_HOLD')).toBe(true);
    expect(canMoveProductionTo('ON_HOLD', 'RUNNING')).toBe(true);
  });

  it('never reopens a completed card', () => {
    expect(canMoveProductionTo('COMPLETED', 'RUNNING')).toBe(false);
    expect(canMoveProductionTo('COMPLETED', 'PLANNED')).toBe(false);
  });

  it('never goes back to planned once it has started', () => {
    expect(canMoveProductionTo('RUNNING', 'PLANNED')).toBe(false);
    expect(canMoveProductionTo('ON_HOLD', 'PLANNED')).toBe(false);
  });

  it('lets a status stay where it is', () => {
    for (const status of PRODUCTION_STATUSES)
      expect(canMoveProductionTo(status, status)).toBe(true);
  });
});
