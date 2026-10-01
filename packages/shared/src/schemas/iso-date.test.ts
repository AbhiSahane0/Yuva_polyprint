import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isExistingIsoDate, isoDateSchema } from './common.js';
import { createDispatchSchema } from './dispatch.js';
import { receiveStockSchema } from './inventory.js';
import { createEmployeeSchema } from './employee.js';

/**
 * **A date that matches yyyy-mm-dd is not necessarily a date.**
 *
 * `2026-02-30` passes the pattern, and everything downstream — `new Date`,
 * Prisma, Postgres — rolls it forward to 2 March rather than refusing it. A
 * delivery note then went out carrying a date two days after the one somebody
 * typed, with nothing on screen to say so. Found by posting it: the note came
 * back `2026-03-02`.
 *
 * Nine fields across seven schemas had the same shape-only check, so the fix
 * is one helper and these tests stop the pattern coming back by hand.
 */
describe('a date has to exist, not just look like one', () => {
  it('accepts real dates, including a leap day', () => {
    for (const d of ['2026-01-01', '2026-10-01', '2024-02-29', '2026-12-31']) {
      expect(isExistingIsoDate(d), d).toBe(true);
    }
  });

  it('refuses days that are not in the month', () => {
    for (const d of ['2026-02-30', '2026-02-29', '2026-04-31', '2026-06-31']) {
      expect(isExistingIsoDate(d), d).toBe(false);
    }
  });

  it('refuses a month or day out of range', () => {
    for (const d of ['2026-13-01', '2026-00-10', '2026-01-00', '2026-01-32']) {
      expect(isExistingIsoDate(d), d).toBe(false);
    }
  });

  it('still refuses anything that is not the shape', () => {
    for (const d of ['01-10-2026', '2026/10/01', '2026-1-1', 'today', '']) {
      expect(isExistingIsoDate(d), d).toBe(false);
    }
  });

  it('says which field is wrong', () => {
    const result = isoDateSchema('dispatch date').safeParse('2026-02-30');
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('dispatch date');
  });
});

describe('the schemas that take a date use it', () => {
  it('a dispatch note cannot be dated 30 February', () => {
    const note = {
      customerId: 'c1',
      customerName: 'Someone',
      dispatchDate: '2026-02-30',
      lines: [{ orderId: 'o1', quantityKg: 1 }],
    };
    expect(createDispatchSchema.safeParse(note).success).toBe(false);
    expect(createDispatchSchema.safeParse({ ...note, dispatchDate: '2026-02-28' }).success).toBe(
      true,
    );
  });

  it('nor can a stock receipt or a joining date', () => {
    const receipt = receiveStockSchema.safeParse({
      materialId: 'm1',
      quantity: 10,
      ratePerUnit: 1,
      receivedOn: '2026-04-31',
    });
    expect(receipt.success).toBe(false);
    const employee = createEmployeeSchema.safeParse({ name: 'A Person', joinedOn: '2026-04-31' });
    expect(employee.success).toBe(false);
  });

  /*
   * The point of the helper is that there is one of it. A schema that writes
   * the pattern out by hand gets the shape check and not the existence check,
   * which is exactly the bug — and it is an easy thing to paste back in.
   */
  it('no schema checks the shape by hand any more', () => {
    const dir = join(process.cwd(), 'src', 'schemas');
    const offenders: string[] = [];
    for (const file of readdirSync(dir).filter(
      (f) => f.endsWith('.ts') && !f.endsWith('.test.ts'),
    )) {
      if (file === 'common.ts') continue; /* where the helper lives */
      if (/\\d\{4\}-\\d\{2\}-\\d\{2\}/.test(readFileSync(join(dir, file), 'utf8')))
        offenders.push(file);
    }
    expect(offenders, 'use isoDateSchema from common.ts instead').toEqual([]);
  });
});
