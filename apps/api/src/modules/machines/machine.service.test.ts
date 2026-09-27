import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Machines & maintenance, guarded at the source.
 *
 * The arithmetic is tested as pure functions in `@yuva/shared`. What cannot be
 * reached that way is the shape: that a machine's state is **derived** rather
 * than flagged, that "down" has one definition the whole app asks for, and
 * that a machine in pieces cannot be started from the floor.
 */
const READ = (name: string) =>
  readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

const CODE = READ('./machine.service.ts');
const FLOOR = READ('../floor/floor.service.ts');
const PLANNING = READ('../planning/planning.service.ts');

function body(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}`);
  expect(start, `${name} is exported`).toBeGreaterThan(-1);
  const next = source.indexOf('\nexport ', start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

describe('a machine has no status to go stale', () => {
  it('keeps no state column on the machine', () => {
    /* A record with no end IS the machine being down. A flag somebody has to
       remember to clear is a flag that is wrong — the press would read "under
       maintenance" for a fortnight after it came back. */
    /*
     * Writes, not mentions. `isDown` is fine as an argument to the shared
     * rule — what must never happen is the machine row being stamped with a
     * state, or a state being persisted anywhere.
     */
    for (const forbidden of [
      'costingMachine.update',
      'costingMachine.updateMany',
      'maintenanceRecord.update({ where: { machineId',
    ]) {
      expect(CODE, `machines must not write ${forbidden}`).not.toContain(forbidden);
    }
    /* And the state is computed at the point of reading, every time. */
    expect(CODE).not.toMatch(/state:\s*['"]/);
  });

  it('works the state out from the shared rule', () => {
    expect(CODE).toContain('machineState(');
    expect(body(CODE, 'machineBoard')).toContain('down.has(machine.id)');
  });

  it('finds what is down by the record with no end', () => {
    expect(body(CODE, 'openMaintenance')).toContain('endedAt: null');
  });
});

describe('one definition of "down"', () => {
  it('the floor and planning both ask this module', () => {
    /* Not each deciding for itself. Two ideas of what down means is how a
       tablet offers a press that the planning board says is in pieces. */
    expect(FLOOR).toContain('openMaintenance(');
    expect(PLANNING).toContain('openMaintenance(');
    for (const source of [FLOOR, PLANNING]) {
      expect(source).not.toContain('maintenanceRecord.');
    }
  });

  it('keeps a machine that is down off the floor’s picker', () => {
    expect(body(FLOOR, 'listMachines')).toContain('!down.has(machine.id)');
  });

  it('refuses to start a job on one', () => {
    expect(body(FLOOR, 'startJob')).toContain('is down —');
  });

  it('warns Planning without blocking it', () => {
    // You schedule around a service; that is the point of knowing about one.
    expect(PLANNING).toContain('plannedMachineDown');
    expect(body(PLANNING, 'planOrder')).not.toContain('openMaintenance');
  });
});

describe('downtime counts every stoppage', () => {
  it('reads the pauses and the problems, not just the fitter', () => {
    /* A pause and a problem both leave a machine standing. A downtime figure
       that left out the defects would flatter the works exactly where it
       should not. */
    const board = body(CODE, 'machineBoard');
    expect(board).toContain('floorEvent.findMany');
    expect(board).toContain('qualityIssue.findMany');
    expect(board).toContain('standingMinutes(');
  });

  it('counts maintenance as standing time too', () => {
    const board = body(CODE, 'machineBoard');
    expect(board).toMatch(/for \(const \[machineId, record\] of down\)/);
  });
});

describe('putting one down, and bringing it back', () => {
  it('refuses a second open record on the same machine', () => {
    // Two would make "how long has it been down" unanswerable, and that
    // answer is the reason the record exists.
    expect(body(CODE, 'startMaintenance')).toContain('is already down');
  });

  it('does not insist the running job be finished first', () => {
    /* A press does not break down politely between stages, and a system that
       insists is one the fitter works around. */
    const start = body(CODE, 'startMaintenance');
    expect(start).not.toContain('productionStage');
    expect(start).not.toContain("status: 'RUNNING'");
  });

  it('refuses to bring back what is already back', () => {
    expect(body(CODE, 'endMaintenance')).toContain('already back');
  });

  it('refuses a spell that ends before it started', () => {
    // It would read as negative downtime everywhere.
    expect(body(CODE, 'endMaintenance')).toContain('before it went down');
  });

  it('records who did both', () => {
    expect(body(CODE, 'startMaintenance')).toContain('reportedBy: actor');
    expect(body(CODE, 'endMaintenance')).toContain('closedBy: actor');
  });
});

describe('what this module is not', () => {
  it('does not edit the machines themselves', () => {
    /* Their names, speeds and power stay on Costing, because that is what
       they are for. This module says where they are, not what they cost. */
    for (const forbidden of ['horsepower', 'speedPerMinute', 'costingMachine.create']) {
      expect(CODE).not.toContain(forbidden);
    }
  });

  it('schedules nothing ahead', () => {
    // No intervals, no next-service date. An interval nobody set becomes a
    // red flag everybody learns to ignore.
    for (const forbidden of ['nextServiceAt', 'intervalDays', 'dueAt']) {
      expect(CODE).not.toContain(forbidden);
    }
  });
});
