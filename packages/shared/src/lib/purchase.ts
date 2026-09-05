import { round } from './quotation-math.js';

/**
 * Where an order stands, and how much of it is still outstanding.
 *
 * The rule worth stating: **an order's progress is a fact about its receipts,
 * not a flag somebody sets.** Three statuses are decisions — placed, on the
 * road, cancelled — and the rest is arithmetic over what has actually arrived.
 * A stored "received" flag is one somebody forgets to tick, and the order then
 * sits on the chase list forever.
 */

export const PURCHASE_ORDER_STATUSES = [
  'ORDERED',
  'IN_TRANSIT',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'CANCELLED',
] as const;
export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number];

/** The three the office may choose. The other two follow from receipts. */
export const CHOOSABLE_STATUSES = ['ORDERED', 'IN_TRANSIT', 'CANCELLED'] as const;
export type ChoosableStatus = (typeof CHOOSABLE_STATUSES)[number];

export const PURCHASE_STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  ORDERED: 'Ordered',
  IN_TRANSIT: 'In transit',
  PARTIALLY_RECEIVED: 'Part received',
  RECEIVED: 'Received',
  CANCELLED: 'Cancelled',
};

/**
 * What a line still owes, given what has arrived against it.
 *
 * Rejected material counts as settled but not as received: 40 kg sent back is
 * 40 kg the works does not have and will not be sent again on this delivery.
 * Whether the supplier replaces it is a new delivery, and the line stays open
 * for the balance until somebody closes it short.
 */
export function lineOutstanding(input: {
  quantity: number;
  accepted: number;
  rejected: number;
  closed: boolean;
}): number {
  if (input.closed) return 0;
  return round(Math.max(0, input.quantity - input.accepted - input.rejected), 3);
}

/** True once nothing more is expected against this line. */
export function lineSettled(input: {
  quantity: number;
  accepted: number;
  rejected: number;
  closed: boolean;
}): boolean {
  return input.closed || lineOutstanding(input) <= 0;
}

/**
 * The status an order's receipts imply, or null when they imply nothing.
 *
 * Null means "leave whatever the office chose alone" — an order nobody has
 * received against is still ORDERED or IN_TRANSIT, and it is not this
 * function's business which.
 */
export function statusFromReceipts(
  lines: { quantity: number; accepted: number; rejected: number; closed: boolean }[],
): 'PARTIALLY_RECEIVED' | 'RECEIVED' | null {
  if (lines.length === 0) return null;

  const touched = lines.some((line) => line.accepted > 0 || line.rejected > 0 || line.closed);
  if (!touched) return null;

  return lines.every((line) => lineSettled(line)) ? 'RECEIVED' : 'PARTIALLY_RECEIVED';
}

/**
 * Whether an order is late, as of a given day.
 *
 * Computed, never stored. A stored flag needs a nightly job to maintain and is
 * wrong every hour in between; this is right whenever anybody looks.
 *
 * An order with no expected date is never late — nothing was promised, and
 * inventing a deadline the supplier never gave would put orders on the chase
 * list that nobody agreed to chase.
 */
export function isDelayed(
  order: { status: PurchaseOrderStatus; expectedOn: string | null },
  today: string,
): boolean {
  if (order.status === 'RECEIVED' || order.status === 'CANCELLED') return false;
  if (!order.expectedOn) return false;
  return order.expectedOn < today;
}

/** What a line is worth, at the rate agreed. */
export function lineTotal(quantity: number, ratePerUnit: number): number {
  return round(quantity * ratePerUnit, 2);
}
