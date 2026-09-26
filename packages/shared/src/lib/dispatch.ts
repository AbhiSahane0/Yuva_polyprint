import { round } from './quotation-math.js';

/**
 * **What left the building, and what that settles.**
 *
 * The rule worth stating first, because everything here follows from it: a
 * dispatch note is a **lorry**, not an order. One vehicle, one date, one
 * consignment note, and a line for each order it carries — which is what
 * actually leaves the gate when three jobs for one customer go out together.
 *
 * The second rule: **an order's delivery is a fact about its dispatches, not a
 * flag somebody sets.** Completing a job card never completed the order, and it
 * was right not to — for a customer, complete means delivered. This is the part
 * that knows. Nothing here is stored on the order except the status that falls
 * out of the arithmetic.
 */

export const DISPATCH_STATUSES = ['DRAFT', 'DISPATCHED', 'CANCELLED'] as const;
export type DispatchStatus = (typeof DISPATCH_STATUSES)[number];

export const DISPATCH_STATUS_LABELS: Record<DispatchStatus, string> = {
  DRAFT: 'Draft',
  DISPATCHED: 'Dispatched',
  CANCELLED: 'Cancelled',
};

/**
 * Where a note may go from where it is.
 *
 * A dispatched note can still be cancelled, which is not an oversight: a lorry
 * turned back at the customer's gate is a real afternoon, and the goods are
 * back in the godown. Cancelling gives the quantities back to the order and
 * reopens it if this note was what completed it, so the alternative — editing
 * the note quietly — would leave an order completed against a delivery that
 * never happened.
 *
 * A draft is not a delivery. Nothing it says counts anywhere until it is
 * dispatched.
 */
export const DISPATCH_STATUS_FLOW: Record<DispatchStatus, readonly DispatchStatus[]> = {
  DRAFT: ['DISPATCHED', 'CANCELLED'],
  DISPATCHED: ['CANCELLED'],
  CANCELLED: [],
};

/** True when a note may move from `from` to `to`. Staying put is allowed. */
export function canMoveDispatchTo(from: DispatchStatus, to: DispatchStatus): boolean {
  return from === to || DISPATCH_STATUS_FLOW[from].includes(to);
}

/** True once this note counts against the orders it names. */
export function countsAsDelivered(status: DispatchStatus): boolean {
  return status === 'DISPATCHED';
}

/**
 * What a set of packages weighs.
 *
 * The works lists the reels — each one with the weight written on it — and the
 * line total is their sum. A customer who weighs the lorry back and finds it
 * 12 kg short can then be told which reel, which is the whole reason the rows
 * exist rather than one total.
 */
export function packagesNetKg(packages: readonly { netKg: number }[]): number {
  return round(
    packages.reduce((sum, pack) => sum + (Number.isFinite(pack.netKg) ? pack.netKg : 0), 0),
    3,
  );
}

/**
 * What a line actually delivers.
 *
 * **The packages win where there are any.** A typed total and a list of reels
 * that disagree is a challan the customer and the works read differently, so
 * the total is not a second figure to be kept in step — it is the sum, and the
 * form shows it rather than asking for it. Where the office has only a total
 * and no reel weights, the total is all there is and it stands.
 */
export function lineNetKg(line: {
  quantityKg: number;
  packages?: readonly { netKg: number }[];
}): number {
  const packages = line.packages ?? [];
  if (packages.length > 0) return packagesNetKg(packages);
  return round(Number.isFinite(line.quantityKg) ? Math.max(0, line.quantityKg) : 0, 3);
}

/** How many packages a line is made of. What the driver counts off the lorry. */
export function packageCount(line: { packages?: readonly { netKg: number }[] }): number {
  return line.packages?.length ?? 0;
}

/**
 * How an order is judged delivered — the same rule that decides how it is
 * priced.
 *
 * A pouch order is taken in pouches, so a lorry of the right weight carrying
 * the wrong count is not a completed order. Mirrors `orderAmount`, which reads
 * per-pouch only when both the count and the rate are there; a pouch count with
 * no per-pouch rate is a count, not a basis.
 */
export function deliveryBasis(order: {
  quantityPouches: number;
  ratePerPouch: number;
}): 'PER_KG' | 'PER_POUCH' {
  return order.quantityPouches > 0 && order.ratePerPouch > 0 ? 'PER_POUCH' : 'PER_KG';
}

export interface OrderDeliveryInput {
  /** What the customer committed to. */
  quantityKg: number;
  quantityPouches: number;
  ratePerPouch: number;
  /**
   * What the works actually made and can send: the finished cards' real output.
   * Not the ordered quantity — a run that made 512 kg of a 500 kg order has 12
   * kg more to give, and one that made 480 has 20 kg it cannot.
   */
  producedKg: number;
  producedPouches: number;
  /** What dispatched notes have already taken out. Drafts count for nothing. */
  dispatchedKg: number;
  dispatchedPouches: number;
}

/** Where an order's delivery has got to. Every figure worked out, none stored. */
export interface OrderDelivery {
  basis: 'PER_KG' | 'PER_POUCH';
  producedKg: number;
  dispatchedKg: number;
  dispatchedPouches: number;
  /**
   * In the godown: made, not yet gone. Floored at zero — a negative would be
   * an over-dispatch, which is its own figure below and not a negative stock.
   */
  readyKg: number;
  readyPouches: number;
  /** What the customer is still waiting for. */
  pendingKg: number;
  pendingPouches: number;
  /** Against what was ordered, on the basis the order was taken. 0 to 100. */
  percentDispatched: number;
  /** True once the whole order has gone out. This is what completes it. */
  isFullyDispatched: boolean;
  /**
   * Sent beyond what was produced — which is physically impossible, so it means
   * either a card that made more than its sheet has admitted to yet, or a
   * mistake. Never blocks a figure from being read; it blocks a note from
   * posting, and that block is overridable with a reason.
   */
  overProducedKg: number;
}

/**
 * The state of one order's delivery.
 *
 * Deliberately pure and deliberately total: give it the six figures and it
 * answers everything both the godown screen and the posting check need, so the
 * two can never come to different conclusions about the same order.
 */
export function orderDelivery(input: OrderDeliveryInput): OrderDelivery {
  const n = (value: number) => (Number.isFinite(value) ? Math.max(0, value) : 0);

  const orderedKg = n(input.quantityKg);
  const orderedPouches = Math.round(n(input.quantityPouches));
  const producedKg = n(input.producedKg);
  const producedPouches = Math.round(n(input.producedPouches));
  const dispatchedKg = n(input.dispatchedKg);
  const dispatchedPouches = Math.round(n(input.dispatchedPouches));

  const basis = deliveryBasis({
    quantityPouches: orderedPouches,
    ratePerPouch: n(input.ratePerPouch),
  });

  const ordered = basis === 'PER_POUCH' ? orderedPouches : orderedKg;
  const dispatched = basis === 'PER_POUCH' ? dispatchedPouches : dispatchedKg;

  return {
    basis,
    producedKg: round(producedKg, 3),
    dispatchedKg: round(dispatchedKg, 3),
    dispatchedPouches,
    readyKg: round(Math.max(0, producedKg - dispatchedKg), 3),
    readyPouches: Math.max(0, producedPouches - dispatchedPouches),
    pendingKg: round(Math.max(0, orderedKg - dispatchedKg), 3),
    pendingPouches: Math.max(0, orderedPouches - dispatchedPouches),
    /* An order with nothing ordered on its own basis is not 0% delivered — it
       is unanswerable, and 100 keeps it off the chase list rather than putting
       a nonsense figure on it. */
    percentDispatched: ordered <= 0 ? 100 : Math.min(100, Math.round((dispatched / ordered) * 100)),
    isFullyDispatched: ordered > 0 && dispatched >= ordered,
    overProducedKg: round(Math.max(0, dispatchedKg - producedKg), 3),
  };
}

/**
 * What one line of a note is worth, at the rate the order was taken at.
 *
 * Derived, never stored. A challan carries a value because the goods on the
 * lorry have one, but it is not a price anybody agreed separately — it is this
 * order's rate against what actually went, and storing a second copy of it is
 * how a challan and its order come to disagree.
 */
export function lineValue(input: {
  netKg: number;
  pouches: number;
  ratePerKg: number;
  ratePerPouch: number;
}): number {
  const n = (value: number) => (Number.isFinite(value) && value > 0 ? value : 0);
  const perPouch = n(input.pouches) > 0 && n(input.ratePerPouch) > 0;
  const raw = perPouch
    ? n(input.pouches) * n(input.ratePerPouch)
    : n(input.netKg) * n(input.ratePerKg);
  return round(raw, 2);
}
