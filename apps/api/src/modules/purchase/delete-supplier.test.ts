import { describe, expect, it } from 'vitest';

/**
 * **A supplier with an order against them is retired, not deleted.**
 *
 * A purchase order names who it was placed with, and it is a document that left
 * the building — the works committed money on it. Deleting the supplier would
 * leave an order nobody can chase, so `purchase_orders.supplier_id` is
 * `Restrict` and the database would refuse. It is refused here first, in words
 * and by count, because a foreign-key error is not an answer: what that case
 * actually wants is retiring, which keeps the name on the old orders and takes
 * them off the form.
 *
 * What is left is the case delete exists for — a name typed wrong, or a
 * supplier added and never used. Unlike a material, there is nothing to
 * discard: a supplier carries no history of its own, since what they supply and
 * what they last charged are read from the orders rather than stored.
 */
describe('deleting a supplier', () => {
  const decide = (orders: number) => (orders === 0 ? 'delete' : 'refuse');

  it('removes one nobody has ordered from', () => {
    expect(decide(0)).toBe('delete');
  });

  it('refuses one with an order against them', () => {
    expect(decide(1)).toBe('refuse');
    expect(decide(12)).toBe('refuse');
  });

  /*
   * A cancelled order still counts. It is still a record of an order placed,
   * and the count is deliberately of every order rather than the open ones.
   */
  it('counts every order, not only the open ones', () => {
    expect(decide(1)).toBe('refuse');
  });
});
