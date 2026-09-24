import type { StageStatus } from '../constants/production.js';

/**
 * **Where the reel goes when a stage finishes.**
 *
 * A job does not stop between machines. The reel comes off the press and goes
 * onto the laminator, and the floor should not have to tell the screen that
 * twice — finish one stage and the next is where the job now is.
 *
 * Skipped stages are stepped over, because a stage the job does not need is not
 * somewhere the reel can be waiting. A stage already running or done is stepped
 * over too: this only ever picks up work nobody has started.
 */
export interface StageToAdvance {
  id: string;
  position: number;
  status: StageStatus;
}

export function nextStageToStart<T extends StageToAdvance>(
  stages: T[],
  afterPosition: number,
): T | null {
  return (
    [...stages]
      .sort((a, b) => a.position - b.position)
      .find((stage) => stage.position > afterPosition && stage.status === 'PENDING') ?? null
  );
}
