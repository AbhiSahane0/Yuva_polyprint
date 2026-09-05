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

import type { PricingBasis } from '../constants/job.js';

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
  /** How this line is sold — the office's choice, defaulting to weight. */
  pricingBasis?: PricingBasis;
  /** Entered on a per-kg line; derived on a per-pouch one. */
  quantityKg: number;
  ratePerKg: number;
  /** Entered on a per-pouch line; derived on a per-kg one. */
  quantityPouches?: number;
  ratePerPouch?: number;
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
  /**
   * Both units, whichever was typed. A per-pouch line still reports the weight
   * — the film is ordered by it — and a per-kg line still reports what a single
   * pouch works out at.
   */
  quantityKg: number;
  ratePerKg: number;
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

  /*
   * On a per-pouch line the office types a pouch count and a rate per pouch,
   * and the weight is worked back from pouches-per-kg — that is the figure the
   * film is ordered against, so it still has to exist. A per-kg line works the
   * pouch count back the same way, for the same reason in reverse.
   */
  const basis = input.pricingBasis ?? 'PER_KG';
  const perPouch = basis === 'PER_POUCH';

  const quantityPouches = perPouch ? Math.max(0, Math.round(input.quantityPouches ?? 0)) : 0;
  const quantityKg = perPouch
    ? pouchesPerKg > 0
      ? round(quantityPouches / pouchesPerKg, 3)
      : 0
    : input.quantityKg;

  const totalPouches = perPouch ? quantityPouches : round(pouchesPerKg * input.quantityKg, 0);

  const totalAmount = perPouch
    ? round(quantityPouches * (input.ratePerPouch ?? 0), 2)
    : round(input.quantityKg * input.ratePerKg, 2);

  // The equivalent rate in the other unit, so lines on a mixed quotation can
  // still be compared with each other.
  const ratePerKg = perPouch
    ? quantityKg > 0
      ? round(totalAmount / quantityKg, 2)
      : 0
    : input.ratePerKg;

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
    quantityKg,
    ratePerKg,
    cylinderWidth,
    cylinderCircumference,
    costPerCylinder,
    totalCylinderCost,
    costPerPouch: totalPouches > 0 ? round(totalAmount / totalPouches, 4) : 0,
  };
}

/* ---------------------------------------------------------------------------
 * Geometry and tiers
 *
 * A quotation line has two halves that change at different rates. The geometry
 * — thickness, pouches per kilogram, the cylinders — depends only on the design
 * and holds for every quantity quoted. The money depends on the quantity, and a
 * quotation may now carry two or three of those side by side so the customer
 * can see what ordering more does to the unit price.
 *
 * Splitting them is what makes that comparison honest: cylinders do not scale
 * with the order, so they are costed once here and spread across whichever
 * quantity is being looked at. That is the entire reason the price per pouch
 * falls as the quantity rises.
 * ------------------------------------------------------------------------- */

/**
 * The depth a gazette pouch opens out to, in millimetres.
 *
 * A gazette is not a flat bag: it gussets at the sides and the base so it stands
 * and holds volume. That depth is film the flat sheet has to carry — the pouch
 * the customer holds is `widthMm × heightMm`, and the film it is cut from is
 * bigger by exactly this.
 */
export interface GazetteInputs {
  bottom: number;
  left: number;
  right: number;
}

export interface ItemGeometryInputs {
  /** How many plies. Only the yield allowance depends on it. */
  layerCount: number;
  /** Total structure thickness — see `totalMicronForLayers` in material-cost. */
  micron: number;
  /** The finished pouch, before any gusset is added. */
  widthMm: number;
  heightMm: number;
  /**
   * False for a roll.
   *
   * Film on a reel has not been converted into anything: there is no pouch to
   * count, so pouches-per-kilogram is not a small number or an approximate one,
   * it is not a quantity that exists. The customer buys the weight.
   */
  makesPouches?: boolean;
  /** Absent, or all zero, on an ordinary flat pouch. */
  gazette?: GazetteInputs | undefined;
  repeatWidth: number;
  repeatHeight: number;
  cylinderCount: number;
  transportCost?: number;
  /**
   * False when the design's cylinders already exist, so nothing is charged for
   * them. Decided per line rather than per customer: a long-standing customer
   * ordering a new design still needs new cylinders engraved, and the printed
   * terms say exactly that — "each job/design requires a separate cylinder".
   */
  chargeCylinders?: boolean;
}

export interface ItemGeometry {
  micron: number;
  /**
   * The flat film one pouch is cut from — the pouch plus its gussets.
   *
   * Reported because it is what the office checks against the machine, and
   * because on a gazette job it is the figure that explains why the weight and
   * the cylinder are larger than the pouch's own dimensions suggest.
   */
  filmWidthMm: number;
  filmHeightMm: number;
  /** Zero on a roll: nothing has been converted into a pouch. */
  pouchesPerKg: number;
  cylinderWidth: number;
  cylinderCircumference: number;
  costPerCylinder: number;
  totalCylinderCost: number;
}

/**
 * The circumferences the works' cylinders actually come in, in millimetres.
 *
 * Not invented — read off the 347 imported jobs that record one. They run 310
 * to 740 and cluster around 480; `PREFERRED` is the figure the suggestion aims
 * at, and reproduces the repeat the works actually chose on 85% of those jobs.
 *
 * The remaining 15% are jobs where two repeats both fit and the works picked
 * the other one — which cylinder was free that week, not arithmetic. That is
 * precisely why the suggested repeat stays editable.
 */
export const CYLINDER_CIRCUMFERENCE = { MIN: 310, MAX: 740, PREFERRED: 490 } as const;

/**
 * The widest cylinder face the works can print, in millimetres.
 *
 * Also read off the imported jobs: `width × ups + 80` is at or under 800 on 95%
 * of them, and `floor((800 − 80) ÷ width)` reproduces the number of lanes the
 * works actually ran on 82%. The 80 is the mounting allowance already in
 * `cylinderWidth`.
 */
export const MAX_CYLINDER_FACE_MM = 800;

/**
 * How many lanes of the design fit across the web.
 *
 * As many as the machine's face will take, which is what the works does on most
 * jobs — running fewer lanes than will fit means printing the same order over
 * more passes. Never less than 1, so an unusually wide design is still quotable
 * rather than being quoted as zero lanes and priced at nothing.
 */
export function suggestRepeatWidth(filmWidthMm: number): number {
  if (!Number.isFinite(filmWidthMm) || filmWidthMm <= 0) return 1;
  return Math.max(1, Math.floor((MAX_CYLINDER_FACE_MM - 80) / filmWidthMm));
}

/**
 * How many times a design repeats around the cylinder.
 *
 * The cylinder's circumference is the design's height times this, so the repeat
 * is whichever whole number lands the circumference inside the range the works'
 * cylinders come in — and, where several do, closest to the size it uses most.
 *
 * Returns 1 for a height that cannot be measured, rather than 0: a repeat of
 * zero would make the circumference zero and the cylinder free.
 */
export function suggestRepeatHeight(filmHeightMm: number): number {
  if (!Number.isFinite(filmHeightMm) || filmHeightMm <= 0) return 1;

  let best: { n: number; distance: number } | null = null;
  for (let n = 1; n <= 12; n += 1) {
    const circumference = filmHeightMm * n;
    if (circumference < CYLINDER_CIRCUMFERENCE.MIN) continue;
    if (circumference > CYLINDER_CIRCUMFERENCE.MAX) break;
    const distance = Math.abs(circumference - CYLINDER_CIRCUMFERENCE.PREFERRED);
    if (!best || distance < best.distance) best = { n, distance };
  }
  if (best) return best.n;

  /*
   * Nothing fits: a design taller than the largest cylinder, or so short that
   * even twelve repeats do not fill the smallest. Fall back to whatever comes
   * closest rather than refusing — an unusual size is still quotable, and the
   * office can see the circumference it produces and override.
   */
  let fallback = 1;
  let closest = Infinity;
  for (let n = 1; n <= 12; n += 1) {
    const distance = Math.abs(filmHeightMm * n - CYLINDER_CIRCUMFERENCE.PREFERRED);
    if (distance < closest) [fallback, closest] = [n, distance];
  }
  return fallback;
}

/** Everything about a line that does not depend on how much is ordered. */
export function computeItemGeometry(input: ItemGeometryInputs, cylinderRate: number): ItemGeometry {
  const factor = layerFactor(input.layerCount);

  /*
   * The film, not the pouch.
   *
   * A gusset is depth the flat sheet has to carry: the sides widen it, the base
   * lengthens it. Everything downstream works from this rather than from the
   * finished size — the weight, because that film is what is bought, and the
   * cylinder, because that film is what is printed.
   */
  const filmWidthMm = round(
    input.widthMm + (input.gazette?.left ?? 0) + (input.gazette?.right ?? 0),
    2,
  );
  const filmHeightMm = round(input.heightMm + (input.gazette?.bottom ?? 0), 2);

  /*
   * Grams of film per pouch, and from that pouches per kilogram:
   *
   *     grams  = width × height × micron × factor ÷ 1,000,000
   *     per kg = 1000 ÷ grams
   *
   * Written as one expression below, but that is the arithmetic. The 1 Kg
   * Paneer Bag — 560 × 220 at 74µ over two plies — comes to 10.03 g of film and
   * so 99.72 pouches to the kilogram, matching the client's sheet exactly.
   *
   * A roll is skipped: film on a reel is not pouches, and a confident figure
   * there would be worse than none.
   */
  const areaTerm = ((filmWidthMm * filmHeightMm) / 100) * input.micron * factor;
  const pouchesPerKg =
    (input.makesPouches ?? true) && areaTerm > 0 ? round(1000 / (areaTerm / 10000), 2) : 0;

  const cylinderWidth = round(filmWidthMm * input.repeatWidth + 80, 2);
  const cylinderCircumference = round(filmHeightMm * input.repeatHeight, 2);
  const costPerCylinder = round(((cylinderWidth * cylinderCircumference) / 100) * cylinderRate, 2);

  /*
   * A design whose cylinders already exist is quoted without them — transport
   * included, because there is nothing to deliver. The per-cylinder figure is
   * still reported so the office can see what a new set would have cost.
   */
  const totalCylinderCost =
    (input.chargeCylinders ?? true)
      ? round(costPerCylinder * input.cylinderCount + (input.transportCost ?? 0), 2)
      : 0;

  return {
    micron: round(input.micron, 2),
    filmWidthMm,
    filmHeightMm,
    pouchesPerKg,
    cylinderWidth,
    cylinderCircumference,
    costPerCylinder,
    totalCylinderCost,
  };
}

/** One quantity a line is priced at. */
export interface TierInputs {
  pricingBasis?: PricingBasis;
  /** Entered on a per-kg line; derived on a per-pouch one. */
  quantityKg: number;
  ratePerKg: number;
  /** Entered on a per-pouch line; derived on a per-kg one. */
  quantityPouches?: number;
  ratePerPouch?: number;
}

export interface TierComputed {
  /** Both units, whichever was typed — the film is ordered by weight either way. */
  quantityKg: number;
  ratePerKg: number;
  totalPouches: number;
  totalAmount: number;
  /** Effective cost of a single pouch — useful when comparing quotes. */
  costPerPouch: number;
}

/**
 * One quantity on one line.
 *
 * Note the rounding order: pouches-per-kg arrives already rounded to 2dp, and
 * is multiplied by the quantity afterwards. The spreadsheet does this, and it
 * is what makes the 1 Kg Paneer Bag line read 24,930 rather than 24,929.
 */
export function computeTier(pouchesPerKg: number, input: TierInputs): TierComputed {
  const perPouch = (input.pricingBasis ?? 'PER_KG') === 'PER_POUCH';

  const quantityPouches = perPouch ? Math.max(0, Math.round(input.quantityPouches ?? 0)) : 0;

  const quantityKg = perPouch
    ? pouchesPerKg > 0
      ? round(quantityPouches / pouchesPerKg, 3)
      : 0
    : input.quantityKg;

  const totalPouches = perPouch ? quantityPouches : round(pouchesPerKg * input.quantityKg, 0);

  const totalAmount = perPouch
    ? round(quantityPouches * (input.ratePerPouch ?? 0), 2)
    : round(input.quantityKg * input.ratePerKg, 2);

  // The equivalent rate in the other unit, so tiers and lines priced on
  // different bases can still be compared with each other.
  const ratePerKg = perPouch
    ? quantityKg > 0
      ? round(totalAmount / quantityKg, 2)
      : 0
    : input.ratePerKg;

  return {
    quantityKg,
    ratePerKg,
    totalPouches,
    totalAmount,
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
  items: Array<{
    quantityKg: number;
    cylinderCount: number;
    totalAmount: number;
    totalCylinderCost: number;
  }>,
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
