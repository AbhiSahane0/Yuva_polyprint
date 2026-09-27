import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Planning, guarded at the source.
 *
 * The arithmetic is tested as pure functions in `@yuva/shared`. What cannot be
 * reached that way is the shape of this service: that a plan reserves nothing,
 * that it reuses the job card's own material check rather than growing a
 * second one, and that the board's figures are worked out rather than stored.
 * Every one of those is a failure of omission.
 */
const SOURCE = readFileSync(
  fileURLToPath(new URL('./planning.service.ts', import.meta.url)),
  'utf8',
);
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

function body(name: string): string {
  const start = CODE.indexOf(`export async function ${name}`);
  expect(start, `${name} is exported`).toBeGreaterThan(-1);
  const next = CODE.indexOf('\nexport ', start + 1);
  return CODE.slice(start, next === -1 ? undefined : next);
}

describe('a plan is an intention, not a claim', () => {
  it('reserves no stock and writes no movement', () => {
    /*
     * The whole reason planning is safe to use early. Holding film for a job
     * nobody has scheduled would starve the one actually on the machine, and
     * the claim would never be released because no card exists to release it.
     */
    for (const forbidden of [
      'holdFor(',
      'releaseFor(',
      'stockReservation',
      'stockMovement',
      'stockBatch.update',
      'issueStock',
    ]) {
      expect(CODE, `planning must not touch ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('raises no job card of its own', () => {
    // Planning says when. Production says go, and owns everything after.
    expect(CODE).not.toContain('productionOrder.create');
    expect(CODE).not.toContain('createProduction');
  });

  it('writes nothing to an order but its plan', () => {
    const plan = body('planOrder');
    const written = plan.slice(plan.indexOf('data: {'), plan.indexOf('return planningFor'));
    for (const field of [
      'plannedStart',
      'plannedMachineId',
      'planNote',
      'plannedBy',
      'plannedAt',
    ]) {
      expect(written).toContain(field);
    }
    /* Never the order's own status, quantity or dates — those are the office's
       and the customer's, and a planning screen must not move them. */
    for (const forbidden of ['status:', 'quantityKg:', 'dueDate:', 'ratePerKg:']) {
      expect(written).not.toContain(forbidden);
    }
  });
});

describe('one material check, not two', () => {
  it('calls the job card’s own availability rather than reimplementing it', () => {
    /*
     * A second implementation here would have its own idea of what a ply
     * weighs and its own view of whether a reel is wide enough, and it would
     * disagree with the job card within a month — on the one screen whose job
     * is to promise the card will not be refused.
     */
    expect(CODE).toContain('availabilityForCards(');
    for (const forbidden of ['filmRequirements', 'inkRequirements', 'allocateReels']) {
      expect(CODE).not.toContain(forbidden);
    }
  });

  it('asks it on behalf of the order, so nothing is excluded as its own', () => {
    const build = CODE.slice(
      CODE.indexOf('async function buildRows'),
      CODE.indexOf('function totalsOf'),
    );
    // id and orderId both the order's: an unplanned order holds nothing, so
    // there is no hold of its own to leave out of everyone else's.
    expect(build).toContain('id: row.id');
    expect(build).toContain('orderId: row.id');
  });

  it('never flags an order that already has a card', () => {
    const build = CODE.slice(
      CODE.indexOf('async function buildRows'),
      CODE.indexOf('function totalsOf'),
    );
    expect(build).toMatch(/card \?\s*\[\]/);
  });
});

describe('the board is worked out, never stored', () => {
  it('holds no status column to drift', () => {
    expect(CODE).toContain('planningStatus(');
    expect(CODE).not.toContain('planningStatus:');
    expect(CODE).not.toContain('status: row.planningStatus');
  });

  it('filters on the derived status after building, not in SQL', () => {
    /* There is no column to filter on. A second copy of the rule in a where
       clause is a second rule to keep in step with the first. */
    const board = body('planningBoard');
    const built = board.indexOf('buildRows');
    const filtered = board.indexOf('query.status');
    expect(built).toBeGreaterThan(-1);
    expect(filtered).toBeGreaterThan(built);
  });

  it('counts the whole board even when the view is filtered', () => {
    // Filtering to what is blocked must not make "blocked" read as everything.
    const board = body('planningBoard');
    expect(board).toContain('totalsOf(all)');
  });

  it('leaves finished and cancelled orders off it entirely', () => {
    expect(CODE).toContain("status: { in: ['CONFIRMED', 'IN_PRODUCTION'] }");
  });
});

describe('what booking refuses', () => {
  const plan = body('planOrder');

  it('will not plan an order the floor already has', () => {
    expect(plan).toContain('_count.productionOrders > 0');
  });

  it('will not plan a finished or cancelled order', () => {
    expect(plan).toContain("existing.status === 'COMPLETED'");
    expect(plan).toContain("existing.status === 'CANCELLED'");
  });

  it('will not book a retired machine', () => {
    expect(plan).toContain('machine.isActive');
  });

  it('will still date an order that is short of film', () => {
    /*
     * Deliberate. A works that cannot write down "Tuesday, press 1, film
     * arriving Monday" keeps its plan on paper instead, and then the screen is
     * decoration. The board says the shortage in red; it does not forbid it.
     */
    expect(plan).not.toContain('shortOf');
    expect(plan).not.toContain('isShort');
  });

  it('clears the note and the stamp with the plan, not just the dates', () => {
    /*
     * No day and no machine is no plan. Leaving the note behind was
     * half-clearing it: the board went on showing "customer collecting
     * Thursday" against an undated order with nobody's name on it.
     */
    expect(plan).toContain("planNote: clearing ? '' : input.planNote");
    expect(plan).toContain("plannedBy: clearing ? '' : actor");
    expect(plan).toContain('plannedAt: clearing ? null : new Date()');
  });
});
