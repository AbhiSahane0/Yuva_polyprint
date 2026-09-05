import type { PurchaseOrderStatus } from '../lib/purchase.js';

/** A supplier, with what the orders placed with them say about them. */
export interface Supplier {
  id: string;
  name: string;
  contactPerson: string;
  mobile: string;
  email: string;
  address: string;
  gstNumber: string;
  notes: string;
  isActive: boolean;
  /**
   * Derived from the orders placed with them, never stored — a second copy is
   * a list somebody has to maintain and nobody would.
   */
  materials: string[];
  orderCount: number;
  /** What they last charged, and for what. Null before the first order. */
  lastRate: { material: string; ratePerUnit: number; unit: string; on: string } | null;
  openOrders: number;
  createdAt: string;
}

/** One material on an order, with what has arrived against it. */
export interface PurchaseOrderLine {
  id: string;
  position: number;
  materialId: string;
  materialName: string;
  /** The unit the material is stocked in, which may differ from `unit`. */
  stockUnit: string;
  quantity: number;
  unit: string;
  ratePerUnit: number;
  total: number;
  acceptedQuantity: number;
  rejectedQuantity: number;
  /** Nothing more expected: fully settled, or closed short. */
  outstanding: number;
  settled: boolean;
  closedAt: string | null;
  closedReason: string;
}

/** One delivery against one line. */
export interface PurchaseReceipt {
  id: string;
  lineId: string;
  materialName: string;
  receivedOn: string;
  acceptedQuantity: number;
  rejectedQuantity: number;
  rejectionReason: string;
  unit: string;
  /** The stock this became. Null when everything was rejected. */
  batchId: string | null;
  batchCode: string | null;
  notes: string;
  enteredBy: string;
  createdAt: string;
}

export interface PurchaseOrderSummary {
  id: string;
  number: number;
  supplierId: string;
  supplierName: string;
  status: PurchaseOrderStatus;
  /** Computed against today, never stored. */
  isDelayed: boolean;
  orderedOn: string;
  expectedOn: string | null;
  lineCount: number;
  /** What the whole order is worth at the rates agreed. */
  total: number;
  /** How much of that has actually been accepted into stock. */
  receivedValue: number;
  raisedBy: string;
  createdAt: string;
}

export interface PurchaseOrder extends PurchaseOrderSummary {
  notes: string;
  lines: PurchaseOrderLine[];
  receipts: PurchaseReceipt[];
}

/** The figures across the top of the purchase screen. */
export interface PurchaseTotals {
  activeSuppliers: number;
  openOrders: number;
  delayed: number;
  /** Ordered value awaiting delivery, not money already spent. */
  outstandingValue: number;
  /** Accepted into stock this calendar month. */
  spendThisMonth: number;
}

export interface PurchaseOrderList {
  items: PurchaseOrderSummary[];
  totals: PurchaseTotals;
}
