import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Quality & waste, guarded at the source.
 *
 * The arithmetic is tested as pure functions in `@yuva/shared`. What cannot be
 * reached that way is the boundary the whole module rests on: **waste and
 * rejections are different numbers and must never be added together.** The
 * material left the shelf once and was lost once — counting a rejection as
 * waste as well would make a works that scrapped 40 kg look as though it had
 * lost 80, on the one screen built to tell it otherwise.
 */
const READ = (name: string) =>
  readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

const CODE = READ('./quality.service.ts');
const DISPATCH = READ('../dispatch/dispatch.service.ts');
const FLOOR = READ('../floor/floor.service.ts');

function body(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}`);
  expect(start, `${name} is exported`).toBeGreaterThan(-1);
  const next = source.indexOf('\nexport ', start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

describe('waste is read, never recorded', () => {
  it('captures no waste figure of its own', () => {
    /* Every stage already says what went on and what came off. A second
       waste column here would be a number somebody has to keep in step. */
    for (const forbidden of ['wasteKg:', 'productionStage.update', 'productionStage.create']) {
      expect(CODE, `quality must not write ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('groups through the shared functions rather than its own sums', () => {
    expect(CODE).toContain('wasteByStage(');
    expect(CODE).toContain('wasteTrend(');
  });

  it('reads only finished stages', () => {
    // One still running has an output of nought; counting it reads as having
    // lost the whole reel.
    expect(CODE).toContain("status: 'DONE'");
  });
});

describe('a rejection is not waste', () => {
  it('is never added to a waste total', () => {
    const board = body(CODE, 'qualityBoard');
    expect(board).toContain('rejectedKg');
    /* The two appear side by side on the screen and must stay side by side in
       the code: no expression adds one to the other. */
    expect(board).not.toMatch(/waste\w*\s*\+\s*rejected/i);
    expect(board).not.toMatch(/rejected\w*\s*\+\s*waste/i);
  });

  it('is what Dispatch takes off what the godown can send', () => {
    expect(DISPATCH).toContain('rejectedByCard(');
    expect(DISPATCH).toContain('Math.max(0, output - (rejected.get(card.id) ?? 0))');
  });

  it('is summed in one place, next to the model that stores it', () => {
    // Dispatch asks quality; it does not learn what a rejection is.
    expect(CODE).toContain('export async function rejectedByCard');
    expect(DISPATCH).not.toContain('qualityIssue.');
  });

  it('takes rejections off the per-card list as well as the totals', () => {
    // Or a card would read as holding more than the order it belongs to.
    const ready = body(DISPATCH, 'readyToSend');
    expect(ready).toContain('rejected.get(card.id)');
  });
});

describe('an issue has a life', () => {
  it('will not be closed without saying what was done', () => {
    /* "Resolved" on its own teaches nobody anything, and the same defect
       comes back in March with nothing on file about September. */
    const update = body(CODE, 'updateIssue');
    expect(update).toContain('closing');
    expect(update).toContain('Say briefly what was done about it');
  });

  it('checks the move rather than accepting whatever arrived', () => {
    expect(body(CODE, 'updateIssue')).toContain('canMoveIssueTo(');
  });

  it('clears the closing stamp when one is reopened', () => {
    const update = body(CODE, 'updateIssue');
    expect(update).toContain('resolvedAt: null');
  });

  it('refuses a stage belonging to another card', () => {
    expect(body(CODE, 'createIssue')).toContain('That stage belongs to a different job card');
  });
});

describe('one way for a defect to come into existence', () => {
  it('the machine screen raises issues through this service', () => {
    expect(FLOOR).toContain('createIssue(');
    /* Not its own write. A second shape of issue would be one the office
       screen cannot triage. */
    expect(FLOOR).not.toContain('qualityIssue.create');
  });

  it('a problem at the machine is an issue, not a stoppage log line', () => {
    const hold = body(FLOOR, 'holdJob');
    expect(hold).toContain("input.kind === 'ISSUE'");
    expect(hold).toContain('createIssue(');
    /* And a pause still is a stoppage. */
    expect(hold).toContain("kind: 'PAUSED'");
  });

  it('carries the severity the operator chose', () => {
    expect(body(FLOOR, 'holdJob')).toContain('severity: input.severity');
  });
});
