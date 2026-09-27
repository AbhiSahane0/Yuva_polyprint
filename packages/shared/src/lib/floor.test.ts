import { describe, expect, it } from 'vitest';
import {
  floorAction,
  floorQueueOrder,
  greeting,
  isReachable,
  machineMayRun,
  wasteKg,
  wastePercent,
} from './floor.js';

const stages = [
  { id: 'p', position: 1, status: 'DONE' as const },
  { id: 'l', position: 2, status: 'PENDING' as const },
  { id: 's', position: 3, status: 'PENDING' as const },
];

describe('has the reel got here yet', () => {
  it('offers the stage the job has actually reached', () => {
    expect(isReachable(stages, stages[1]!)).toBe(true);
  });

  it('will not offer a stage the job has not reached', () => {
    /* Without this, the lamination tablet offers a job whose printing has not
       started — and the operator takes it, because the screen offered it. */
    expect(isReachable(stages, stages[2]!)).toBe(false);
  });

  it('steps over a stage the job never needed', () => {
    const withSkip = [
      { id: 'p', position: 1, status: 'SKIPPED' as const },
      { id: 'l', position: 2, status: 'PENDING' as const },
    ];
    expect(isReachable(withSkip, withSkip[1]!)).toBe(true);
  });

  it('keeps offering the stage already in hand', () => {
    const running = [{ id: 'l', position: 1, status: 'RUNNING' as const }];
    expect(isReachable(running, running[0]!)).toBe(true);
  });

  it('never offers one that is finished', () => {
    expect(isReachable(stages, stages[0]!)).toBe(false);
  });
});

describe('may this machine run it', () => {
  const laminator2 = { id: 'lam2', kind: 'LAMINATION' };

  it('takes an unassigned stage of its own kind', () => {
    expect(machineMayRun({ machineId: null, stage: 'LAMINATION' }, laminator2)).toBe(true);
  });

  it('leaves an unassigned stage of another kind alone', () => {
    expect(machineMayRun({ machineId: null, stage: 'PRINTING' }, laminator2)).toBe(false);
  });

  it('takes one assigned to it', () => {
    expect(machineMayRun({ machineId: 'lam2', stage: 'LAMINATION' }, laminator2)).toBe(true);
  });

  it('refuses one assigned to the other laminator', () => {
    /* Somebody chose. A tablet quietly overriding that is how two machines
       start the same job. */
    expect(machineMayRun({ machineId: 'lam1', stage: 'LAMINATION' }, laminator2)).toBe(false);
  });
});

describe('what it lost', () => {
  it('is what went in less what came out', () => {
    expect(wasteKg({ inputKg: 500, outputKg: 492 })).toBe(8);
    expect(wastePercent({ inputKg: 500, outputKg: 492 })).toBe(1.6);
  });

  it('says nothing before there is an output to compare', () => {
    expect(wasteKg({ inputKg: 500, outputKg: 0 })).toBe(0);
    expect(wastePercent({ inputKg: 500, outputKg: 0 })).toBe(0);
  });

  it('shows a weighing mistake as a negative rather than hiding it', () => {
    /* More out than in is impossible. Flooring it at nought hides the error
       and quietly inflates the yield. */
    expect(wasteKg({ inputKg: 480, outputKg: 500 })).toBe(-20);
  });
});

describe('what the big button does', () => {
  it('starts a stage nobody has started', () => {
    expect(floorAction({ cardStatus: 'PLANNED', stageStatus: 'PENDING' })).toBe('START');
  });

  it('finishes the one in hand', () => {
    expect(floorAction({ cardStatus: 'RUNNING', stageStatus: 'RUNNING' })).toBe('FINISH');
  });

  it('restarts a held card before anything else', () => {
    /* Including before finishing the stage that was running when it stopped —
       a held job is held. */
    expect(floorAction({ cardStatus: 'ON_HOLD', stageStatus: 'RUNNING' })).toBe('RESUME');
    expect(floorAction({ cardStatus: 'ON_HOLD', stageStatus: 'PENDING' })).toBe('RESUME');
  });

  it('offers nothing on a finished card', () => {
    expect(floorAction({ cardStatus: 'COMPLETED', stageStatus: 'DONE' })).toBe('NONE');
  });
});

describe('the queue at the machine', () => {
  it('puts the job in hand first, then what is wanted soonest', () => {
    const rows = [
      { isRunning: false, dueDate: '2026-10-05', cardNumber: 2 },
      { isRunning: false, dueDate: null, cardNumber: 3 },
      { isRunning: true, dueDate: '2026-12-01', cardNumber: 9 },
      { isRunning: false, dueDate: '2026-10-01', cardNumber: 1 },
    ];
    expect([...rows].sort(floorQueueOrder).map((r) => r.cardNumber)).toEqual([9, 1, 2, 3]);
  });
});

describe('the one line of warmth', () => {
  it('reads the clock', () => {
    expect(greeting(7)).toBe('Good morning');
    expect(greeting(14)).toBe('Good afternoon');
    expect(greeting(20)).toBe('Good evening');
  });
});
