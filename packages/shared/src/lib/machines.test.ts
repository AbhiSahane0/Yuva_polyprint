import { describe, expect, it } from 'vitest';
import {
  dayTotals,
  downFor,
  formatStanding,
  machineOrder,
  machineState,
  standingMinutes,
  type StandEvent,
} from './machines.js';

const NOW = '2026-09-27T14:00:00.000Z';

describe('where a machine is', () => {
  it('is running when a job is on it', () => {
    expect(machineState({ isDown: false, hasRunningJob: true })).toBe('RUNNING');
  });

  it('is idle when nothing is', () => {
    expect(machineState({ isDown: false, hasRunningJob: false })).toBe('IDLE');
  });

  it('is down even with a job still open on it', () => {
    /* The operator stopped, the fitter arrived, and nobody finished the stage.
       Reading that as running tells the office a press is working while it is
       in pieces. */
    expect(machineState({ isDown: true, hasRunningJob: true })).toBe('DOWN');
  });
});

describe('how long it has stood', () => {
  const at = (hhmm: string): string => `2026-09-27T${hhmm}:00.000Z`;

  it('pairs a stop with the next start', () => {
    const events: StandEvent[] = [
      { at: at('09:00'), kind: 'STOP' },
      { at: at('09:20'), kind: 'START' },
    ];
    expect(standingMinutes(events, NOW)).toBe(20);
  });

  it('adds several spells up', () => {
    const events: StandEvent[] = [
      { at: at('09:00'), kind: 'STOP' },
      { at: at('09:20'), kind: 'START' },
      { at: at('11:00'), kind: 'STOP' },
      { at: at('11:12'), kind: 'START' },
    ];
    expect(standingMinutes(events, NOW)).toBe(32);
  });

  it('counts a machine still standing up to now', () => {
    /* The case that matters most: down since eleven is what somebody needs to
       see at two. */
    expect(standingMinutes([{ at: at('11:00'), kind: 'STOP' }], NOW)).toBe(180);
  });

  it('does not let a second stop start the clock again', () => {
    // It was already standing. It cannot stand twice.
    const events: StandEvent[] = [
      { at: at('09:00'), kind: 'STOP' },
      { at: at('09:05'), kind: 'STOP' },
      { at: at('09:20'), kind: 'START' },
    ];
    expect(standingMinutes(events, NOW)).toBe(20);
  });

  it('ignores a start with nothing stopped', () => {
    // Rather than counting it as negative time.
    expect(standingMinutes([{ at: at('09:00'), kind: 'START' }], NOW)).toBe(0);
  });

  it('does not care what order they arrive in', () => {
    const events: StandEvent[] = [
      { at: at('09:20'), kind: 'START' },
      { at: at('09:00'), kind: 'STOP' },
    ];
    expect(standingMinutes(events, NOW)).toBe(20);
  });

  it('reads the way the works says it', () => {
    expect(formatStanding(250)).toBe('4h 10m');
    expect(formatStanding(12)).toBe('0h 12m');
    expect(formatStanding(0)).toBe('0h 00m');
  });
});

describe('how long it has been down', () => {
  it('counts a closed spell to when it ended', () => {
    expect(
      downFor({ startedAt: '2026-09-27T09:00:00.000Z', endedAt: '2026-09-27T13:10:00.000Z' }, NOW),
    ).toBe(250);
  });

  it('counts an open one to now', () => {
    expect(downFor({ startedAt: '2026-09-27T09:00:00.000Z', endedAt: null }, NOW)).toBe(300);
  });
});

describe('what it got through today', () => {
  it('adds the finished runs up', () => {
    const totals = dayTotals([
      { inputKg: 500, outputKg: 490 },
      { inputKg: 300, outputKg: 294 },
    ]);
    expect(totals.outputKg).toBe(784);
    expect(totals.wasteKg).toBe(16);
    expect(totals.wastePercent).toBe(2);
    expect(totals.runs).toBe(2);
  });

  it('ignores the one still on the machine', () => {
    const totals = dayTotals([
      { inputKg: 500, outputKg: 490 },
      { inputKg: 400, outputKg: 0 },
    ]);
    expect(totals.inputKg).toBe(500);
    expect(totals.runs).toBe(1);
  });

  it('says nothing rather than dividing by zero', () => {
    expect(dayTotals([]).wastePercent).toBe(0);
  });
});

describe('the order the cards read in', () => {
  it('puts what is down first — it is the only card asking for anything', () => {
    const cards = [
      { state: 'IDLE' as const, position: 1 },
      { state: 'RUNNING' as const, position: 2 },
      { state: 'DOWN' as const, position: 3 },
      { state: 'RUNNING' as const, position: 0 },
    ];
    expect([...cards].sort(machineOrder).map((c) => `${c.state}${c.position}`)).toEqual([
      'DOWN3',
      'RUNNING0',
      'RUNNING2',
      'IDLE1',
    ]);
  });
});
