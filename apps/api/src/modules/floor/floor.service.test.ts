import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The machine screen, guarded at the source.
 *
 * The rules are tested as pure functions in `@yuva/shared`. What cannot be
 * reached that way is the thing that makes this module safe at all: that it is
 * a second FRONT END over the office's own writes, and not a second
 * implementation of them. A tablet that started jobs its own way would drift
 * from the job card within a month — and the job card is the document the
 * works is paid against.
 */
const SOURCE = readFileSync(fileURLToPath(new URL('./floor.service.ts', import.meta.url)), 'utf8');
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

function body(name: string): string {
  const start = CODE.indexOf(`export async function ${name}`);
  expect(start, `${name} is exported`).toBeGreaterThan(-1);
  const next = CODE.indexOf('\nexport ', start + 1);
  return CODE.slice(start, next === -1 ? undefined : next);
}

describe('it records through the office’s own service', () => {
  it('starts and finishes a stage with updateStage, not its own write', () => {
    /*
     * The whole safety of the module. `updateStage` is where the material
     * re-check lives, where the card starts itself, where the operator name is
     * snapshotted and where the reel is handed to the next machine. A direct
     * write here would silently skip all four.
     */
    expect(body('startJob')).toContain('updateStage(');
    expect(body('finishJob')).toContain('updateStage(');
    for (const forbidden of [
      'productionStage.update',
      'productionStage.updateMany',
      'startTheCard',
      'nextStageToStart',
    ]) {
      expect(CODE, `the floor must not do ${forbidden} itself`).not.toContain(forbidden);
    }
  });

  it('never touches stock', () => {
    // The card claims and the sheet issues. A tablet does neither.
    for (const forbidden of ['stockBatch', 'stockMovement', 'stockReservation', 'holdFor(']) {
      expect(CODE).not.toContain(forbidden);
    }
  });

  it('runs its own material check only to report, never to write', () => {
    expect(CODE).toContain('availabilityForCards(');
    expect(CODE).not.toContain('refuseUnlessOverridden');
  });

  it('resolves that check through the ORDER, not the card', () => {
    /*
     * This was wrong once, and it failed silently in the worst direction: the
     * materials hang off the quotation the order was won from, so passing the
     * card's own id as the order resolved nothing, reported no shortage, and
     * the tablet showed a job as fine — until the operator pressed start and
     * the server refused it for a film that was never there.
     *
     * The ids are different on purpose. `id` is the card's, so its own claim
     * is excluded from what it is measured against; `orderId` is the order's,
     * because that is where the priced structure lives.
     */
    const board = body('floorBoard');
    expect(board).toContain('orderId: card.orderId');
    expect(board).not.toContain('orderId: card.id');
    expect(board).toContain('id: card.id');
  });
});

describe('what a machine may pick up', () => {
  it('asks the shared rule rather than matching kinds inline', () => {
    expect(CODE).toContain('machineMayRun(');
    expect(CODE).toContain('isReachable(');
  });

  it('refuses a stage the reel has not reached', () => {
    expect(body('startJob')).toContain('isReachable(');
  });

  it('checks the machine on every write, not just on the board', () => {
    /* The tablet asserts "this machine is doing this job". Taking that on
       trust would let a screen start a job at a press nobody is standing at. */
    for (const name of ['startJob', 'finishJob', 'holdJob', 'resumeJob']) {
      expect(body(name), `${name} checks the machine`).toContain('stageAt(');
    }
  });
});

describe('stopping, and saying why', () => {
  const hold = body('holdJob');

  it('holds the card rather than un-running the stage', () => {
    /* A stage that went backwards would lose the time it had already run. */
    expect(hold).toContain("status: 'ON_HOLD'");
    expect(hold).not.toContain("status: 'PENDING'");
  });

  it('logs it, rather than overwriting one reason with the next', () => {
    expect(hold).toContain('floorEvent.create');
    expect(hold).toContain('input.note');
  });

  it('records who said so, by name as well as by link', () => {
    // The link goes null when somebody leaves; the name is what keeps an old
    // stoppage readable.
    expect(hold).toContain('operator: person.name');
    expect(hold).toContain('operatorId: input.operatorId');
  });

  it('writes the hold and the log in one transaction', () => {
    // A card stopped with nothing saying why is the gap this screen closes.
    expect(hold).toContain('prisma.$transaction');
    expect(hold).toContain('TX');
  });

  it('puts a restarted card back to running, not to planned', () => {
    const resume = body('resumeJob');
    expect(resume).toContain("status: 'RUNNING'");
    expect(resume).toContain("kind: 'RESUMED'");
  });

  it('will not stop what is already stopped, or restart what is not', () => {
    expect(hold).toContain("=== 'ON_HOLD'");
    expect(body('resumeJob')).toContain("!== 'ON_HOLD'");
  });
});

describe('a held card is held', () => {
  it('cannot be started or finished until it is restarted', () => {
    expect(body('startJob')).toContain("productionOrder.status === 'ON_HOLD'");
    expect(body('finishJob')).toContain("productionOrder.status === 'ON_HOLD'");
  });
});

describe('the board', () => {
  it('leaves finished cards off it', () => {
    expect(CODE).toContain("status: { in: ['PLANNED', 'RUNNING', 'ON_HOLD'] }");
  });

  it('answers a whole tablet in one call', () => {
    const board = body('floorBoard');
    for (const part of ['machine:', 'current', 'waiting', 'operators']) {
      expect(board).toContain(part);
    }
  });

  it('puts this machine’s own people at the top of the name list', () => {
    expect(CODE).toContain('operatorChoices(');
    expect(CODE).toContain('machine.kind');
  });
});
