import { describe, expect, it } from 'vitest';
import {
  canMoveIssueTo,
  isOpenIssue,
  issueOrder,
  rejectedKgOf,
  wasteByStage,
  wasteTrend,
  type StageWaste,
} from './quality.js';

const stage = (over: Partial<StageWaste> = {}): StageWaste => ({
  stage: 'PRINTING',
  inputKg: 500,
  outputKg: 480,
  finishedAt: '2026-09-25T10:00:00.000Z',
  ...over,
});

describe('what counts as still somebody’s problem', () => {
  it('counts being looked at as open', () => {
    expect(isOpenIssue('OPEN')).toBe(true);
    expect(isOpenIssue('INVESTIGATING')).toBe(true);
    expect(isOpenIssue('RESOLVED')).toBe(false);
  });

  it('lets a resolved issue be reopened', () => {
    /* The fix did not hold. Making the works raise a second issue about the
       same defect loses the history of the first. */
    expect(canMoveIssueTo('RESOLVED', 'OPEN')).toBe(true);
    expect(canMoveIssueTo('OPEN', 'RESOLVED')).toBe(true);
  });
});

describe('the order the list reads in', () => {
  it('puts open above resolved, then worst, then oldest', () => {
    const rows = [
      { severity: 'LOW' as const, status: 'OPEN' as const, createdAt: '2026-09-20' },
      { severity: 'HIGH' as const, status: 'RESOLVED' as const, createdAt: '2026-09-26' },
      { severity: 'HIGH' as const, status: 'OPEN' as const, createdAt: '2026-09-25' },
      { severity: 'HIGH' as const, status: 'OPEN' as const, createdAt: '2026-09-18' },
    ];
    expect(
      [...rows].sort(issueOrder).map((r) => `${r.severity}/${r.status}/${r.createdAt}`),
    ).toEqual([
      'HIGH/OPEN/2026-09-18',
      'HIGH/OPEN/2026-09-25',
      'LOW/OPEN/2026-09-20',
      'HIGH/RESOLVED/2026-09-26',
    ]);
  });
});

describe('where the material is going', () => {
  it('groups by process and works out a rate for each', () => {
    const rows = wasteByStage([
      stage(),
      stage({ inputKg: 300, outputKg: 294 }),
      stage({ stage: 'LAMINATION', inputKg: 480, outputKg: 450 }),
    ]);
    const printing = rows.find((r) => r.stage === 'PRINTING')!;
    const lamination = rows.find((r) => r.stage === 'LAMINATION')!;

    expect(printing.wasteKg).toBe(26);
    expect(printing.inputKg).toBe(800);
    expect(printing.percent).toBe(3.25);
    expect(printing.runs).toBe(2);

    /* The comparison the screen exists for: lamination is losing twice the
       rate on half the weight, and only the percentage says so. */
    expect(lamination.wasteKg).toBe(30);
    expect(lamination.percent).toBe(6.25);
  });

  it('puts the heaviest loss first', () => {
    const rows = wasteByStage([
      stage({ stage: 'SLITTING', inputKg: 100, outputKg: 98 }),
      stage({ stage: 'LAMINATION', inputKg: 500, outputKg: 450 }),
    ]);
    expect(rows[0]!.stage).toBe('LAMINATION');
  });

  it('ignores a stage still on the machine', () => {
    /* Output is nought until it comes off. Counting it would read as having
       lost the whole reel. */
    expect(wasteByStage([stage({ outputKg: 0, finishedAt: null })])).toEqual([]);
  });
});

describe('the trend', () => {
  const window = (rows: StageWaste[]) => wasteTrend(rows, 7, '2026-09-26');

  it('covers every day, including the ones nothing ran', () => {
    const days = window([stage({ finishedAt: '2026-09-24T09:00:00.000Z' })]);
    expect(days).toHaveLength(7);
    expect(days.map((d) => d.date)).toEqual([
      '2026-09-20',
      '2026-09-21',
      '2026-09-22',
      '2026-09-23',
      '2026-09-24',
      '2026-09-25',
      '2026-09-26',
    ]);
    /* A quiet day is a nought, not a gap: leaving it out draws a fortnight of
       decline as a straight line. */
    expect(days.find((d) => d.date === '2026-09-23')!.wasteKg).toBe(0);
    expect(days.find((d) => d.date === '2026-09-24')!.wasteKg).toBe(20);
  });

  it('adds up several runs on one day', () => {
    const days = window([
      stage({ finishedAt: '2026-09-26T08:00:00.000Z' }),
      stage({ finishedAt: '2026-09-26T16:00:00.000Z', inputKg: 200, outputKg: 190 }),
    ]);
    const today = days.at(-1)!;
    expect(today.wasteKg).toBe(30);
    expect(today.inputKg).toBe(700);
    expect(today.percent).toBe(4.29);
  });

  it('drops anything older than the window', () => {
    const days = window([stage({ finishedAt: '2026-08-01T09:00:00.000Z' })]);
    expect(days.every((d) => d.wasteKg === 0)).toBe(true);
  });
});

describe('what cannot be sent', () => {
  it('adds every issue’s rejection, open or closed', () => {
    /* A rejection is a fact about the film, not about the paperwork chasing
       it. An issue closed as "it is fine after all" is closed by putting its
       rejected weight back to nought. */
    expect(rejectedKgOf([{ rejectedKg: 40 }, { rejectedKg: 12.5 }, { rejectedKg: 0 }])).toBe(52.5);
  });

  it('is nought when nothing was rejected', () => {
    expect(rejectedKgOf([])).toBe(0);
  });
});
