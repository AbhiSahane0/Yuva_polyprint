import { round } from './quotation-math.js';

/**
 * **Counting pouches by weighing them.**
 *
 * Nobody counts thirty thousand pouches. The works counts ten of them — a
 * hundred at a time, three times — weighs that, and from the average weight of
 * one pouch works out how many are in each box on the lorry. This is that
 * arithmetic, transcribed from the Pouch Count tab of their job card workbook.
 *
 * Two details of it matter and are easy to lose:
 *
 *  - The average is the mean of the **per-set weights**, not the total weight
 *    over the total count. With equal sets the two agree; with unequal ones
 *    they do not, and the sheet means the first.
 *  - The consignment total is the sum of the **rounded box counts**, not the
 *    rounding of the total. Their own sheet reads 31,512 where the total
 *    weight alone would say 31,510, and the boxes are what the customer
 *    counts.
 */

/** One set of pouches put on the scale. The works weighs a hundred at a time. */
export interface PouchWeighing {
  /** How many were on the scale. 100 unless somebody had fewer to hand. */
  pouchCount: number;
  /** What they weighed, in grams. */
  grams: number;
}

/** The works weighs a hundred at a time, so a new row starts there. */
export const POUCHES_PER_WEIGHING = 100;

const positive = (value: number): number => (Number.isFinite(value) && value > 0 ? value : 0);

/**
 * What one pouch weighs, in grams.
 *
 * Zero where nothing has been weighed — never a division by nothing, and never
 * a guess from the design's own gsm: this figure exists precisely because the
 * pouch in the box weighs what it weighs rather than what it was drawn to.
 */
export function averagePouchGrams(weighings: readonly PouchWeighing[]): number {
  const each = weighings
    .filter((set) => positive(set.pouchCount) > 0 && positive(set.grams) > 0)
    .map((set) => set.grams / set.pouchCount);

  if (each.length === 0) return 0;
  return round(each.reduce((sum, grams) => sum + grams, 0) / each.length, 4);
}

/** How many pouches a box holds, from what it weighs net. */
export function pouchesInBox(netKg: number, pouchGrams: number): number {
  const net = positive(netKg);
  const grams = positive(pouchGrams);
  if (net === 0 || grams === 0) return 0;
  return Math.round((net * 1000) / grams);
}

/**
 * What a box weighs empty: the gross less the net.
 *
 * Stored that way round because the scale shows a gross and the packer knows
 * the carton — the net is what the two of them leave.
 */
export function boxTareKg(pack: { netKg: number; grossKg?: number | null }): number {
  const gross = positive(pack.grossKg ?? 0);
  if (gross === 0) return 0;
  return round(Math.max(0, gross - positive(pack.netKg)), 3);
}

/**
 * The consignment's count: every box counted, then added.
 *
 * Box by box on purpose. A customer who opens the third carton and counts 3,214
 * is reading this row; a total worked out from the whole weight would not match
 * any box they could check.
 */
export function countedPouches(packages: readonly { netKg: number }[], pouchGrams: number): number {
  if (positive(pouchGrams) === 0) return 0;
  return packages.reduce((sum, pack) => sum + pouchesInBox(pack.netKg, pouchGrams), 0);
}

/**
 * What a full box ought to weigh, so the packer can check a carton on the scale
 * instead of counting it out.
 *
 * The works' own block: a standard count of pouches, what they weigh, the
 * carton on top of them, and the figure the scale should read.
 */
export function standardBoxWeight(input: {
  pouchesPerBox: number;
  pouchGrams: number;
  boxKg: number;
}): { pouchesKg: number; grossKg: number } {
  const pouchesKg = round((positive(input.pouchesPerBox) * positive(input.pouchGrams)) / 1000, 3);
  return { pouchesKg, grossKg: round(pouchesKg + positive(input.boxKg), 3) };
}
