import type { MaterialCategory } from '../schemas/material.js';
import type { StockHealth, StockMovementKind } from '../lib/inventory.js';

/** A material as the inventory list shows it: the catalogue row plus its stock. */
export interface StockSummary {
  materialId: string;
  name: string;
  category: MaterialCategory;
  /** KG for films, inks and adhesives; L for solvents; pcs for consumables. */
  unit: string;
  /** Everything on hand, across every batch. */
  quantity: number;
  /** How many batches that is spread over. */
  batchCount: number;
  /** The level below which stock reads as low, or null when nobody set one. */
  reorderLevel: number | null;
  health: StockHealth;
  /** Today's catalogue rate, for comparison with what was paid. */
  currentRate: number | null;
  /** Valued at what was paid, per batch, falling back to the catalogue rate. */
  value: number;
  /** Where the stock sits, deduplicated. Empty when there is none. */
  locations: string[];
  /** When stock last moved, so a stale material is visible as one. */
  lastMovedAt: string | null;
}

/** One delivery, as it sits in the works. */
export interface StockBatch {
  id: string;
  materialId: string;
  materialName: string;
  unit: string;
  batchCode: string;
  location: string;
  receivedOn: string;
  initialQuantity: number;
  quantity: number;
  /**
   * What the delivery note said, when it was in a different unit — 2 and 'TON'
   * against an `initialQuantity` of 2000 kg. Null on an ordinary delivery.
   */
  purchaseQuantity: number | null;
  purchaseUnit: string | null;
  /** Per the stocked unit, whatever unit it was bought in. */
  ratePerUnit: number | null;
  reference: string;
  notes: string;
  /** Valued at what was paid, falling back to the catalogue rate. */
  value: number;
  createdAt: string;
}

/** One change to a quantity, or to where it sits. */
export interface StockMovement {
  id: string;
  batchId: string;
  batchCode: string;
  materialId: string;
  kind: StockMovementKind;
  /** Signed: positive added, negative taken away, zero on a transfer. */
  quantity: number;
  /** The material's total across every batch, immediately after this movement. */
  balanceAfter: number;
  jobId: string | null;
  jobName: string | null;
  fromLocation: string;
  toLocation: string;
  reference: string;
  notes: string;
  enteredBy: string;
  createdAt: string;
}

/** The figures across the top of the inventory screen. */
export interface StockTotals {
  /** Materials with stock on hand. */
  materialsInStock: number;
  /** Materials at or below their reorder level, or out entirely. */
  lowStock: number;
  /** Materials nobody has set a reorder level for. */
  withoutLevel: number;
  /** Total value of everything on hand. */
  totalValue: number;
}

/** What the inventory screen answers with. */
export interface StockList {
  items: StockSummary[];
  totals: StockTotals;
}

/** One material's stock in full: its batches and its history. */
export interface MaterialStock {
  summary: StockSummary;
  batches: StockBatch[];
  movements: StockMovement[];
}
