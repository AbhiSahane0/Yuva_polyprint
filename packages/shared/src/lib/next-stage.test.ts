import { describe, expect, it } from 'vitest';
import { nextStageToStart, type StageToAdvance } from './next-stage.js';

const card = (...statuses: StageToAdvance['status'][]): StageToAdvance[] =>
  statuses.map((status, index) => ({ id: `s${index + 1}`, position: index + 1, status }));

describe('where the reel goes when a stage finishes', () => {
  it('picks up the next stage nobody has started', () => {
    const stages = card('DONE', 'PENDING', 'PENDING');
    expect(nextStageToStart(stages, 1)?.id).toBe('s2');
  });

  it('steps over a stage the job does not need', () => {
    /*
     * A roll job with pouch making ticked off, or a lamination pass the office
     * marked not required. The reel cannot be waiting at a machine the job
     * never goes near.
     */
    const stages = card('DONE', 'SKIPPED', 'PENDING');
    expect(nextStageToStart(stages, 1)?.id).toBe('s3');
  });

  it('steps over a stage that is already running', () => {
    // Two machines going at once is real; picking one up twice is not.
    const stages = card('DONE', 'RUNNING', 'PENDING');
    expect(nextStageToStart(stages, 1)?.id).toBe('s3');
  });

  it('never goes backwards', () => {
    /*
     * A stage finished out of order — the office filling in the slitting after
     * the fact — must not restart the lamination behind it.
     */
    const stages = card('PENDING', 'PENDING', 'DONE');
    expect(nextStageToStart(stages, 3)).toBeNull();
  });

  it('has nowhere to go from the last stage', () => {
    const stages = card('DONE', 'DONE', 'DONE');
    expect(nextStageToStart(stages, 3)).toBeNull();
  });

  it('reads the positions, not the order they arrive in', () => {
    const stages = [
      { id: 's3', position: 3, status: 'PENDING' as const },
      { id: 's2', position: 2, status: 'PENDING' as const },
    ];
    expect(nextStageToStart(stages, 1)?.id).toBe('s2');
  });
});
