import { describe, expect, it } from 'vitest';
import {
  isDelayed,
  lineOutstanding,
  lineSettled,
  lineTotal,
  statusFromReceipts,
} from './purchase.js';

/**
 * How much of an order is still owed, and what that makes its status.
 *
 * The rule these pin: **progress is a fact about receipts, not a flag somebody
 * sets.** A stored "received" tick is one somebody forgets, and the order then
 * sits on the chase list forever — which is how a chase list stops being read.
 */
const line = (quantity: number, accepted = 0, rejected = 0, closed = false) => ({
  quantity,
  accepted,
  rejected,
  closed,
});

describe('lineOutstanding', () => {
  it('is the whole order until something arrives', () => {
    expect(lineOutstanding(line(400))).toBe(400);
  });

  it('counts rejected material as settled, not as received', () => {
    /*
     * 40 kg sent back is 40 kg the works does not have and will not be sent
     * again on this delivery. Whether the supplier replaces it is a new
     * delivery — treating a rejection as still outstanding would keep chasing
     * a supplier who has already answered.
     */
    expect(lineOutstanding(line(400, 360, 40))).toBe(0);
    expect(lineOutstanding(line(400, 300, 40))).toBe(60);
  });

  it('is nothing once the line is closed short', () => {
    // 380 of 400, and the supplier will not send the rest.
    expect(lineOutstanding(line(400, 380, 0, true))).toBe(0);
  });

  it('never goes negative when a supplier over-delivers', () => {
    // 410 against an order for 400 happens. It is not minus ten outstanding.
    expect(lineOutstanding(line(400, 410))).toBe(0);
  });
});

describe('lineSettled', () => {
  it('is true once nothing more is expected, however it got there', () => {
    // Three routes to settled, and the status calculation depends on all three.
    expect(lineSettled(line(400, 400))).toBe(true);
    expect(lineSettled(line(400, 360, 40))).toBe(true);
    expect(lineSettled(line(400, 380, 0, true))).toBe(true);
    expect(lineSettled(line(400, 380))).toBe(false);
  });
});

describe('statusFromReceipts', () => {
  it('says nothing about an order nobody has received against', () => {
    // Still ORDERED or IN_TRANSIT, and which is not this function's business.
    expect(statusFromReceipts([line(400), line(200)])).toBeNull();
  });

  it('is part received while any line still owes', () => {
    expect(statusFromReceipts([line(400, 400), line(200)])).toBe('PARTIALLY_RECEIVED');
    expect(statusFromReceipts([line(400, 100)])).toBe('PARTIALLY_RECEIVED');
  });

  it('is received once every line is settled', () => {
    expect(statusFromReceipts([line(400, 400), line(200, 180, 20)])).toBe('RECEIVED');
  });

  it('counts a short-closed line as settled', () => {
    // Otherwise an order the supplier has finished with never completes.
    expect(statusFromReceipts([line(400, 380, 0, true)])).toBe('RECEIVED');
  });

  it('treats a delivery that was entirely rejected as progress', () => {
    // Something happened, and the order is no longer merely "ordered" — but it
    // is not complete either, because the works still has nothing.
    expect(statusFromReceipts([line(400, 0, 40)])).toBe('PARTIALLY_RECEIVED');
  });

  it('says nothing about an order with no lines', () => {
    expect(statusFromReceipts([])).toBeNull();
  });
});

describe('isDelayed', () => {
  const at = (status: 'ORDERED' | 'RECEIVED' | 'CANCELLED', expectedOn: string | null) => ({
    status,
    expectedOn,
  });

  it('is late once the promised day has passed', () => {
    expect(isDelayed(at('ORDERED', '2026-08-23'), '2026-08-24')).toBe(true);
    expect(isDelayed(at('ORDERED', '2026-08-23'), '2026-08-23')).toBe(false);
  });

  it('is never late without a promise', () => {
    /*
     * An order with no expected date cannot be late — nothing was agreed.
     * Inventing a deadline the supplier never gave puts orders on the chase
     * list that nobody undertook to chase.
     */
    expect(isDelayed(at('ORDERED', null), '2026-12-31')).toBe(false);
  });

  it('is never late once it has arrived or been cancelled', () => {
    expect(isDelayed(at('RECEIVED', '2026-08-01'), '2026-08-24')).toBe(false);
    expect(isDelayed(at('CANCELLED', '2026-08-01'), '2026-08-24')).toBe(false);
  });
});

describe('lineTotal', () => {
  it('is the quantity at the rate agreed', () => {
    expect(lineTotal(400, 210)).toBe(84_000);
    expect(lineTotal(1200, 185)).toBe(222_000);
  });
});
