import { describe, expect, it } from 'vitest';
import { canMoveOrderTo, orderAmount, ORDER_STATUSES, ORDER_STATUS_FLOW } from './order.js';

/**
 * **Where an order may go from where it is.**
 *
 * Written down rather than left to the screen, because the screen is not the
 * only way in: a status moved by an API call obeys the same rule. A completed
 * order quietly returning to production is the kind of thing nobody notices
 * until the month's figures disagree with the floor's.
 */
describe('moving an order along', () => {
  it('goes forward through production to completed', () => {
    expect(canMoveOrderTo('CONFIRMED', 'IN_PRODUCTION')).toBe(true);
    expect(canMoveOrderTo('IN_PRODUCTION', 'COMPLETED')).toBe(true);
  });

  it('lets a short job skip production, because some of them do', () => {
    // A repeat off the shelf is confirmed and then delivered; there is nothing
    // to gain from making somebody click through a stage that did not happen.
    expect(canMoveOrderTo('CONFIRMED', 'COMPLETED')).toBe(true);
  });

  it('never goes backwards', () => {
    expect(canMoveOrderTo('COMPLETED', 'IN_PRODUCTION')).toBe(false);
    expect(canMoveOrderTo('COMPLETED', 'CONFIRMED')).toBe(false);
    expect(canMoveOrderTo('IN_PRODUCTION', 'CONFIRMED')).toBe(false);
  });

  it('treats completed and cancelled as ends', () => {
    /*
     * Reopening one is not a status change, it is a decision somebody should
     * have to make deliberately — and nothing yet needs it. An end that can be
     * undone by a dropdown is not an end.
     */
    expect(ORDER_STATUS_FLOW.COMPLETED).toEqual([]);
    expect(ORDER_STATUS_FLOW.CANCELLED).toEqual([]);
    expect(canMoveOrderTo('CANCELLED', 'CONFIRMED')).toBe(false);
  });

  it('allows cancelling anything that has not ended', () => {
    expect(canMoveOrderTo('CONFIRMED', 'CANCELLED')).toBe(true);
    expect(canMoveOrderTo('IN_PRODUCTION', 'CANCELLED')).toBe(true);
  });

  it('lets a status stay where it is', () => {
    // A PATCH that changes only the due date sends the status it already has.
    for (const status of ORDER_STATUSES) expect(canMoveOrderTo(status, status)).toBe(true);
  });
});

/**
 * What an order is worth, computed once and stored.
 *
 * Shared so the form showing the total and the server writing it cannot
 * disagree: an order whose screen and record differ by a rounding rule is one
 * nobody can defend over the phone.
 */
describe('what an order is worth', () => {
  it('prices by the kilogram when that is how it was taken', () => {
    expect(
      orderAmount({ quantityKg: 500, ratePerKg: 281.24, quantityPouches: 0, ratePerPouch: 0 }),
    ).toBe(140620);
  });

  it('prices by the pouch when both halves of that are there', () => {
    expect(
      orderAmount({
        quantityKg: 500,
        ratePerKg: 281.24,
        quantityPouches: 21565,
        ratePerPouch: 6.52,
      }),
    ).toBe(140603.8);
  });

  it('does not let a pouch count with no rate zero the order', () => {
    /*
     * A count is not a price. The quotation carries both units whether or not
     * the line was sold per pouch, so a 21,565-pouch order at no per-pouch
     * rate must still be worth its kilograms.
     */
    expect(
      orderAmount({ quantityKg: 500, ratePerKg: 281.24, quantityPouches: 21565, ratePerPouch: 0 }),
    ).toBe(140620);
  });

  it('comes to nothing rather than NaN on nonsense', () => {
    // A total of NaN prints as a blank on a document, which is worse than zero:
    // one is obviously wrong and the other is not.
    expect(
      orderAmount({ quantityKg: Number.NaN, ratePerKg: 10, quantityPouches: 0, ratePerPouch: 0 }),
    ).toBe(0);
  });

  it('rounds to the paisa', () => {
    expect(
      orderAmount({ quantityKg: 3, ratePerKg: 33.333, quantityPouches: 0, ratePerPouch: 0 }),
    ).toBe(100);
  });
});
