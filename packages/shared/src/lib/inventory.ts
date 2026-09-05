import { round } from './quotation-math.js';

/**
 * Stock arithmetic, shared so the screen and the server agree.
 *
 * The ledger is the source of truth: a material's quantity is the sum of every
 * movement against it, and a batch's is the sum of its own. Nothing here reads
 * a stored total — these are the functions that produce one.
 */

/** What a movement does to a balance. */
export const STOCK_MOVEMENT_KINDS = [
  'RECEIPT',
  'ISSUE',
  'WASTE',
  'ADJUSTMENT',
  'TRANSFER',
] as const;
export type StockMovementKind = (typeof STOCK_MOVEMENT_KINDS)[number];

export const MOVEMENT_LABELS: Record<StockMovementKind, string> = {
  RECEIPT: 'Received',
  ISSUE: 'Issued',
  WASTE: 'Waste',
  ADJUSTMENT: 'Adjustment',
  TRANSFER: 'Transfer',
};

/**
 * Which way a kind moves stock, before the office types a figure.
 *
 * `RECEIPT` only ever adds and `ISSUE`/`WASTE` only ever take away, so the form
 * asks for a plain positive number and the sign is decided here. Letting
 * somebody type "-50" to issue material is how 50 kg gets added by a typo.
 *
 * `ADJUSTMENT` is the exception and is signed by the office, because a cycle
 * count can go either way. `TRANSFER` moves nothing.
 */
export function signOf(kind: StockMovementKind): -1 | 0 | 1 {
  if (kind === 'RECEIPT') return 1;
  if (kind === 'ISSUE' || kind === 'WASTE') return -1;
  if (kind === 'TRANSFER') return 0;
  return 1; // ADJUSTMENT carries its own sign.
}

/** The signed figure a movement of this kind and size writes to the ledger. */
export function signedQuantity(kind: StockMovementKind, quantity: number): number {
  if (kind === 'TRANSFER') return 0;
  if (kind === 'ADJUSTMENT') return round(quantity, 3);
  return round(Math.abs(quantity) * signOf(kind), 3);
}

/** How stock is doing against the level somebody set for it. */
export type StockHealth = 'HEALTHY' | 'LOW' | 'OUT' | 'UNSET';

export const HEALTH_LABELS: Record<StockHealth, string> = {
  HEALTHY: 'Healthy',
  LOW: 'Low stock',
  OUT: 'Out of stock',
  UNSET: 'No level set',
};

/**
 * Whether a material needs reordering.
 *
 * `UNSET` rather than `HEALTHY` when no reorder level exists, because those are
 * different facts: one says the stock is fine, the other says nobody has said
 * what fine would be. Reporting the second as the first is how a material sits
 * at 3 kg for a month without anybody being told.
 *
 * A level of zero is a real level — "shout only when we have run out" — which
 * is why this tests for null rather than for falsiness.
 */
export function stockHealth(quantity: number, reorderLevel: number | null): StockHealth {
  if (quantity <= 0) return 'OUT';
  if (reorderLevel === null || reorderLevel === undefined) return 'UNSET';
  return quantity <= reorderLevel ? 'LOW' : 'HEALTHY';
}

/**
 * What a quantity of stock is worth.
 *
 * At what was **paid** for it, falling back to the material's current rate when
 * a batch never recorded one. Today's rate answers "what would it cost to
 * replace this", which is a different question from "what is this worth", and
 * it is not the one a stock sheet asks — valuing at it makes the inventory
 * figure jump every morning when the rates are keyed in.
 */
export function batchValue(
  quantity: number,
  ratePerUnit: number | null,
  currentRate: number | null,
): number {
  const rate = ratePerUnit ?? currentRate;
  if (rate === null || rate === undefined) return 0;
  return round(quantity * rate, 2);
}
