import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysBetween,
  estimateDays,
  planningOrder,
  planningStatus,
  planOutlook,
} from './planning.js';

describe('where an order stands', () => {
  const base = { hasCard: false, isShort: false, plannedStart: null as string | null };

  it('is ready once it has film and nobody has dated it', () => {
    expect(planningStatus(base)).toBe('READY');
  });

  it('is scheduled once it has a date', () => {
    expect(planningStatus({ ...base, plannedStart: '2026-10-02' })).toBe('SCHEDULED');
  });

  it('is blocked when the film is not there, date or no date', () => {
    expect(planningStatus({ ...base, isShort: true })).toBe('BLOCKED');
    /* A shortage outranks a plan: an order booked onto Tuesday's press with no
       film is a problem with a date on it, not a scheduled job. */
    expect(planningStatus({ ...base, isShort: true, plannedStart: '2026-10-02' })).toBe('BLOCKED');
  });

  it('stops planning once a card is raised, whatever else is true', () => {
    expect(planningStatus({ hasCard: true, isShort: true, plannedStart: null })).toBe('STARTED');
  });
});

describe('how long it will take', () => {
  it('uses the works’ own fitted figures', () => {
    // 0.75 + 1000/1945 = 1.2642…
    expect(estimateDays({ quantityKg: 1000, makeReadyDays: 0.75, kgPerDay: 1945 })).toBe(1.26);
  });

  it('does not make twice the order take twice the time', () => {
    const one = estimateDays({ quantityKg: 1000, makeReadyDays: 0.75, kgPerDay: 1945 });
    const two = estimateDays({ quantityKg: 2000, makeReadyDays: 0.75, kgPerDay: 1945 });
    expect(two).toBeLessThan(one * 2);
  });

  it('still charges the make-ready on a job of nothing', () => {
    expect(estimateDays({ quantityKg: 0, makeReadyDays: 0.75, kgPerDay: 1945 })).toBe(0.75);
  });

  it('falls back rather than dividing by zero', () => {
    expect(estimateDays({ quantityKg: 1945, makeReadyDays: 0, kgPerDay: 0 })).toBe(1);
  });
});

describe('dates', () => {
  it('counts days on, rounding a part day up to a whole one', () => {
    expect(addDays('2026-09-28', 1.26)).toBe('2026-09-30');
  });

  it('crosses a month end', () => {
    expect(addDays('2026-09-29', 3)).toBe('2026-10-02');
  });

  it('measures the gap in both directions', () => {
    expect(daysBetween('2026-09-28', '2026-10-02')).toBe(4);
    expect(daysBetween('2026-10-02', '2026-09-28')).toBe(-4);
  });
});

describe('whether the plan makes the promise', () => {
  it('says nothing at all until it is planned', () => {
    expect(planOutlook({ plannedStart: null, days: 2, dueDate: '2026-10-05' })).toEqual({
      finish: null,
      landsLate: false,
      daysLate: 0,
    });
  });

  it('works out the day it comes off', () => {
    const out = planOutlook({ plannedStart: '2026-09-28', days: 1.26, dueDate: '2026-10-05' });
    expect(out.finish).toBe('2026-09-30');
    expect(out.landsLate).toBe(false);
  });

  it('warns when the plan cannot make the date, and by how much', () => {
    const out = planOutlook({ plannedStart: '2026-10-04', days: 1.26, dueDate: '2026-10-05' });
    expect(out.finish).toBe('2026-10-06');
    expect(out.landsLate).toBe(true);
    expect(out.daysLate).toBe(1);
  });

  it('finishing on the day itself is not late', () => {
    const out = planOutlook({ plannedStart: '2026-10-04', days: 1, dueDate: '2026-10-05' });
    expect(out.finish).toBe('2026-10-05');
    expect(out.landsLate).toBe(false);
  });

  it('an order nobody promised can never be late', () => {
    const out = planOutlook({ plannedStart: '2026-10-04', days: 30, dueDate: null });
    expect(out.finish).toBe('2026-11-03');
    expect(out.landsLate).toBe(false);
  });
});

describe('the order the board reads in', () => {
  it('puts what is short of film above everything', () => {
    const rows = [
      { status: 'SCHEDULED' as const, dueDate: '2026-10-01', number: 1 },
      { status: 'BLOCKED' as const, dueDate: '2026-12-01', number: 9 },
      { status: 'READY' as const, dueDate: '2026-10-01', number: 2 },
    ];
    expect([...rows].sort(planningOrder).map((r) => r.number)).toEqual([9, 2, 1]);
  });

  it('then soonest wanted, with the unpromised last', () => {
    const rows = [
      { status: 'READY' as const, dueDate: null, number: 1 },
      { status: 'READY' as const, dueDate: '2026-11-01', number: 2 },
      { status: 'READY' as const, dueDate: '2026-10-01', number: 3 },
    ];
    expect([...rows].sort(planningOrder).map((r) => r.number)).toEqual([3, 2, 1]);
  });
});
