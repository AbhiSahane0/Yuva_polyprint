import type { OrderStatus } from '../constants/order.js';

/** One customer order, as every screen reads it. */
export interface Order {
  id: string;
  number: number;
  status: OrderStatus;

  customerId: string | null;
  customerName: string;

  jobId: string | null;
  jobName: string;

  /** Where it came from. Null on one typed for repeat business. */
  quotationId: string | null;
  quotationNumber: number | null;
  quotationItemId: string | null;

  quantityKg: number;
  ratePerKg: number;
  quantityPouches: number;
  ratePerPouch: number;
  amount: number;

  customerPoNumber: string;
  /** ISO dates. */
  orderDate: string;
  dueDate: string | null;

  notes: string;

  completedAt: string | null;
  cancelledAt: string | null;
  cancelledReason: string;

  createdAt: string;
  updatedAt: string;
}

/** What winning a quotation turned into, reported rather than assumed. */
export interface OrdersFromQuotation {
  created: number[];
  /** Lines that already had an order — winning twice creates nothing. */
  skipped: number[];
}
