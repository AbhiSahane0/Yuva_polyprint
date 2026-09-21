/**
 * Where a customer order has got to.
 *
 * **Four, and deliberately not the wireframe's seven.** "Pending Materials" and
 * "Awaiting QC" describe gates that Planning and Quality will own — a status
 * nobody can honestly move an order out of is worse than no status at all,
 * because the screen then says something the office cannot act on. They belong
 * here the day those modules exist.
 */
export const ORDER_STATUSES = ['CONFIRMED', 'IN_PRODUCTION', 'COMPLETED', 'CANCELLED'] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  CONFIRMED: 'Confirmed',
  IN_PRODUCTION: 'In production',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

/**
 * Where an order may go from where it is.
 *
 * Written down rather than left to the screen, because the screen is not the
 * only way in: a status moved by an API call has to obey the same rule, and a
 * completed order quietly returning to production is the kind of thing nobody
 * notices until the month's figures disagree.
 *
 * Completed and cancelled are ends. Reopening one is not a status change, it is
 * a decision somebody should have to make deliberately — and there is nothing
 * yet that needs it.
 */
export const ORDER_STATUS_FLOW: Record<OrderStatus, readonly OrderStatus[]> = {
  CONFIRMED: ['IN_PRODUCTION', 'COMPLETED', 'CANCELLED'],
  IN_PRODUCTION: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

/** True when an order may move from `from` to `to`. Staying put is allowed. */
export function canMoveOrderTo(from: OrderStatus, to: OrderStatus): boolean {
  return from === to || ORDER_STATUS_FLOW[from].includes(to);
}

/**
 * What an order is worth.
 *
 * Per pouch where it was taken that way, per kilogram otherwise. Shared so the
 * form showing the total and the server storing it cannot disagree — an order
 * whose screen and record differ by a rounding rule is one nobody can defend
 * over the phone.
 *
 * The total is STORED rather than worked out on read, so an order already
 * confirmed with a customer cannot change its own figure the day a rule moves.
 * This is what computes it, once, at the moment it is written.
 */
export function orderAmount(input: {
  quantityKg: number;
  ratePerKg: number;
  quantityPouches: number;
  ratePerPouch: number;
}): number {
  const n = (value: number) => (Number.isFinite(value) && value > 0 ? value : 0);
  /* Taken per pouch only when BOTH halves are there. A pouch count with no
     per-pouch rate is a count, not a price, and it must not zero the order. */
  const perPouch = n(input.quantityPouches) > 0 && n(input.ratePerPouch) > 0;
  const raw = perPouch
    ? n(input.quantityPouches) * n(input.ratePerPouch)
    : n(input.quantityKg) * n(input.ratePerKg);
  return Math.round(raw * 100) / 100;
}
