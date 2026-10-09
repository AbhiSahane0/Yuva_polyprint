import type { DispatchStatus } from '../lib/dispatch.js';
import type { OrderStatus } from '../constants/order.js';

/**
 * One reel, carton or bag on the lorry.
 *
 * The works writes a weight on every reel. Listing them is what lets a customer
 * who weighs the load back be told *which* reel is light, instead of being told
 * the total disagrees.
 */
export interface DispatchPackage {
  id: string;
  /** 1..n, as printed down the challan. */
  position: number;
  /** What is written on the reel. Blank where nothing was. */
  reelNumber: string;
  netKg: number;
  /** With the core and the wrap. Null where the works only weighed net. */
  grossKg: number | null;
  /** The width it was slit to, where it is known. */
  widthMm: number | null;
}

/** One set of pouches put on the scale, to find what one weighs. */
export interface DispatchPouchWeighing {
  id: string;
  position: number;
  /** How many were on the scale. A hundred, as the works does it. */
  pouchCount: number;
  grams: number;
}

/** One order being delivered on this note. */
export interface DispatchLine {
  id: string;
  position: number;

  orderId: string;
  orderNumber: number;
  /** Where the order stands now — so the note says what it settled. */
  orderStatus: OrderStatus;
  customerPoNumber: string;

  /** Snapshots, so an old challan still reads after a design is renamed. */
  jobName: string;
  jobId: string | null;

  /** Which run it came out of, where the godown knows. Null when it is mixed. */
  productionOrderId: string | null;
  productionOrderNumber: number | null;

  /** The sum of the packages where there are any — see `lineNetKg`. */
  quantityKg: number;
  quantityPouches: number;
  packageCount: number;
  /** At the order's own rate, worked out and never stored. */
  value: number;

  remarks: string;
  packages: DispatchPackage[];

  /**
   * How the pouch count was arrived at, where it was weighed rather than
   * typed. Empty on a reel line and on any line nobody counted.
   */
  pouchWeighings: DispatchPouchWeighing[];
  /** What one pouch weighs, averaged from those. 0 where none were taken. */
  pouchGrams: number;

  /** Where this order's delivery stands, counting this note. */
  orderedKg: number;
  producedKg: number;
  dispatchedKg: number;
  pendingKg: number;
}

export interface DispatchSummary {
  id: string;
  number: number;
  status: DispatchStatus;

  customerId: string | null;
  customerName: string;

  dispatchDate: string;
  vehicleNumber: string;
  transporter: string;
  lrNumber: string;

  lineCount: number;
  packageCount: number;
  totalKg: number;
  totalPouches: number;
  /** What is on the lorry, at the orders' own rates. */
  totalValue: number;

  raisedBy: string;
  dispatchedAt: string | null;
  createdAt: string;
}

export interface Dispatch extends DispatchSummary {
  deliveryAddress: string;
  driverName: string;
  driverPhone: string;
  notes: string;

  lines: DispatchLine[];

  dispatchedBy: string;
  cancelledAt: string | null;
  cancelledReason: string;

  /** Why it went out with more than the works had made. Blank when it did not. */
  overrideReason: string;
  overrideBy: string;
  overrideAt: string | null;

  updatedAt: string;
}

/** The figures across the top of the Dispatch screen. */
export interface DispatchTotals {
  /** Notes still being built. Nothing they say counts anywhere yet. */
  drafts: number;
  /** Orders with finished goods in the godown waiting to go. */
  ordersReadyToSend: number;
  readyKg: number;
  /** Went out this calendar month. */
  dispatchedThisMonthKg: number;
  /** Ordered, past its due date, not yet fully delivered. */
  overdueOrders: number;
}

export interface DispatchList {
  items: DispatchSummary[];
  total: number;
  page: number;
  pageSize: number;
  totals: DispatchTotals;
}

/**
 * One order with goods in the godown, ready to be put on a lorry.
 *
 * The queue the despatch clerk works from: what has been made, what has already
 * gone, and what is therefore standing on the floor. Every figure is worked out
 * from the cards and the notes — there is no "ready" flag anybody has to
 * remember to set, because that is the flag that is always wrong.
 */
export interface ReadyToSend {
  orderId: string;
  orderNumber: number;
  orderStatus: OrderStatus;
  customerId: string | null;
  customerName: string;
  jobId: string | null;
  jobName: string;
  customerPoNumber: string;
  dueDate: string | null;
  /** Against today. Never stored — see the order's own status comment. */
  isOverdue: boolean;

  orderedKg: number;
  orderedPouches: number;
  producedKg: number;
  producedPouches: number;
  dispatchedKg: number;
  dispatchedPouches: number;
  readyKg: number;
  readyPouches: number;
  pendingKg: number;
  percentDispatched: number;

  ratePerKg: number;
  ratePerPouch: number;

  /** The finished runs this is standing on, newest first. */
  cards: { id: string; number: number; producedKg: number; completedAt: string | null }[];
}
