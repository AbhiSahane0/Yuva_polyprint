/**
 * Quotation costing — the exact arithmetic from the client's spreadsheet.
 *
 * This module is shared so the form, the API and the PDF all produce the same
 * numbers from the same inputs. Verified against quotation #118:
 *
 *   5 Kg Paneer Bag  670x460  74µ  ->  39.86/kg, 9,965 pouches, Rs. 8,625/cyl
 *   1 Kg Paneer Bag  560x220  74µ  ->  99.72/kg, 24,930 pouches, Rs. 7,040/cyl
 *   Material 147,500 + GST = 174,050 | Cylinder 62,660 + GST = 73,939
 *   Grand 210,160 + GST = 247,989    | Advance 195,774
 */

/** Rounds to `dp` decimal places, avoiding the usual floating-point drift. */
export function round(value: number, dp = 2): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** dp;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export const LAYER_OPTIONS = [2, 3] as const;
export type LayerCount = (typeof LAYER_OPTIONS)[number];

/** PET is 12µ per layer and adhesive adds 2µ, so a 3-layer job carries two PET plies. */
export function totalMicron(layer: number, polyMicron: number): number {
  return layer === 2 ? 12 + polyMicron + 2 : 12 + 12 + polyMicron + 2;
}

/** Yield allowance: 3-layer film wastes more, hence the higher factor. */
export function layerFactor(layer: number): number {
  return layer === 2 ? 1.1 : 1.2;
}

export interface QuotationItemInputs {
  layer: number;
  widthMm: number;
  heightMm: number;
  polyMicron: number;
  quantityKg: number;
  ratePerKg: number;
  repeatWidth: number;
  repeatHeight: number;
  cylinderCount: number;
  transportCost?: number;
}

export interface QuotationItemComputed {
  micron: number;
  pouchesPerKg: number;
  totalPouches: number;
  totalAmount: number;
  cylinderWidth: number;
  cylinderCircumference: number;
  costPerCylinder: number;
  totalCylinderCost: number;
  /** Effective cost of a single pouch — useful when comparing quotes. */
  costPerPouch: number;
}

/**
 * One quotation line.
 *
 * Note the rounding order: pouches-per-kg is rounded to 2dp BEFORE being
 * multiplied by the quantity. The spreadsheet does this, and it is what makes
 * the 1 Kg Paneer Bag line read 24,930 rather than 24,929.
 */
export function computeItem(
  input: QuotationItemInputs,
  cylinderRate: number,
): QuotationItemComputed {
  const micron = totalMicron(input.layer, input.polyMicron);
  const factor = layerFactor(input.layer);

  const areaTerm = ((input.widthMm * input.heightMm) / 100) * micron * factor;
  const pouchesPerKg = areaTerm > 0 ? round(1000 / (areaTerm / 10000), 2) : 0;
  const totalPouches = round(pouchesPerKg * input.quantityKg, 0);

  const totalAmount = round(input.quantityKg * input.ratePerKg, 2);

  const cylinderWidth = round(input.widthMm * input.repeatWidth + 80, 2);
  const cylinderCircumference = round(input.heightMm * input.repeatHeight, 2);
  const costPerCylinder = round(((cylinderWidth * cylinderCircumference) / 100) * cylinderRate, 2);
  const totalCylinderCost = round(
    costPerCylinder * input.cylinderCount + (input.transportCost ?? 0),
    2,
  );

  return {
    micron,
    pouchesPerKg,
    totalPouches,
    totalAmount,
    cylinderWidth,
    cylinderCircumference,
    costPerCylinder,
    totalCylinderCost,
    costPerPouch: totalPouches > 0 ? round(totalAmount / totalPouches, 4) : 0,
  };
}

export interface QuotationTotals {
  totalQuantityKg: number;
  totalCylinderCount: number;
  materialSubtotal: number;
  materialWithGst: number;
  cylinderSubtotal: number;
  cylinderWithGst: number;
  grandSubtotal: number;
  grandWithGst: number;
  materialAdvance: number;
  cylinderAdvance: number;
  totalAdvance: number;
}

export interface QuotationRates {
  gstPercent: number;
  materialAdvancePercent: number;
  cylinderAdvancePercent: number;
}

/**
 * Document totals.
 *
 * Advances are taken on the GST-INCLUSIVE amounts, confirmed with the client:
 * the spreadsheet printed pre-GST figures on the two advance rows but a
 * GST-inclusive Advance total, which did not reconcile. GST-inclusive is what
 * they actually collect, so both rows and the total now use it.
 */
export function computeTotals(
  items: Array<{ quantityKg: number; cylinderCount: number } & QuotationItemComputed>,
  rates: QuotationRates,
): QuotationTotals {
  const gst = 1 + rates.gstPercent / 100;

  const totalQuantityKg = round(
    items.reduce((sum, item) => sum + item.quantityKg, 0),
    3,
  );
  const totalCylinderCount = items.reduce((sum, item) => sum + item.cylinderCount, 0);

  const materialSubtotal = round(
    items.reduce((sum, item) => sum + item.totalAmount, 0),
    2,
  );
  const cylinderSubtotal = round(
    items.reduce((sum, item) => sum + item.totalCylinderCost, 0),
    2,
  );

  const materialWithGst = round(materialSubtotal * gst, 0);
  const cylinderWithGst = round(cylinderSubtotal * gst, 0);
  const grandSubtotal = round(materialSubtotal + cylinderSubtotal, 2);
  const grandWithGst = round(grandSubtotal * gst, 0);

  const materialAdvance = round((materialWithGst * rates.materialAdvancePercent) / 100, 0);
  const cylinderAdvance = round((cylinderWithGst * rates.cylinderAdvancePercent) / 100, 0);

  return {
    totalQuantityKg,
    totalCylinderCount,
    materialSubtotal,
    materialWithGst,
    cylinderSubtotal,
    cylinderWithGst,
    grandSubtotal,
    grandWithGst,
    materialAdvance,
    cylinderAdvance,
    totalAdvance: round(materialAdvance + cylinderAdvance, 0),
  };
}

/**
 * Indian-format currency with a plain "Rs." prefix.
 *
 * The client hit glyph-substitution problems with ₹ (it rendered as ₱ in some
 * PDF exports), so their sheet switched to ASCII "Rs." — we match that.
 */
export function formatRs(value: number, decimals = 0): string {
  return `Rs. ${value.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

export function formatNumber(value: number, decimals = 0): string {
  return value.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
