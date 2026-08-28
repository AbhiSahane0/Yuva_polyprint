/**
 * What a job physically is, and — for pouches — which style.
 *
 * A roll is printed film delivered on the reel; a pouch is that film converted
 * into a bag. The distinction changes what the customer receives, so it is
 * recorded on the quotation line rather than left to the job's name.
 */
export const JOB_KINDS = ['ROLL', 'POUCH'] as const;
export type JobKind = (typeof JOB_KINDS)[number];

export const JOB_KIND_LABELS: Record<JobKind, string> = {
  ROLL: 'Roll',
  POUCH: 'Pouch',
};

/**
 * Pouch styles the works produces.
 *
 * The first four are what the company's own letterhead advertises; centre seal
 * and three side seal appear throughout the imported job names. `OTHER` exists
 * because a fixed list that cannot describe a real order is worse than no list
 * — it carries a free-text note alongside it.
 */
export const POUCH_TYPES = [
  'STANDUP',
  'STANDUP_ZIPPER',
  'ZIPPER',
  'SPOUT',
  'CENTRE_SEAL',
  'THREE_SIDE_SEAL',
  'OTHER',
] as const;
export type PouchType = (typeof POUCH_TYPES)[number];

export const POUCH_TYPE_LABELS: Record<PouchType, string> = {
  STANDUP: 'Standup',
  STANDUP_ZIPPER: 'Standup zipper',
  ZIPPER: 'Zipper',
  SPOUT: 'Spout pouch',
  CENTRE_SEAL: 'Centre seal',
  THREE_SIDE_SEAL: 'Three side seal',
  OTHER: 'Other',
};

/**
 * The film plies in a structure.
 *
 * Two-layer is PET over poly. Three-layer inserts a metallised PET in the
 * middle — the same 12µ of thickness, but a different material at a different
 * price, which is why it is named rather than treated as a second PET.
 */
export const LAYER_STRUCTURE: Record<number, string[]> = {
  2: ['PET', 'Poly'],
  3: ['PET', 'MET PET', 'Poly'],
};

/**
 * How a line is priced.
 *
 * Rolls and most pouches are sold by weight. Standup and standup-zipper pouches
 * are sold by the piece — the converting work dominates their cost, so the
 * trade quotes them per pouch and the customer's order is written in pieces.
 */
export const PRICING_BASES = ['PER_KG', 'PER_POUCH'] as const;
export type PricingBasis = (typeof PRICING_BASES)[number];

/** The styles the trade prices by the piece. */
const PER_POUCH_STYLES: readonly PouchType[] = ['STANDUP', 'STANDUP_ZIPPER'];

/**
 * Which basis a line uses.
 *
 * Derived from the pouch style rather than chosen separately, so the two can
 * never disagree — changing the style reprices the line, which is correct: a
 * standup pouch is not sold the way a centre-seal one is.
 */
export function pricingBasisFor(jobKind: JobKind, pouchType: PouchType | null): PricingBasis {
  if (jobKind === 'ROLL' || pouchType === null) return 'PER_KG';
  return PER_POUCH_STYLES.includes(pouchType) ? 'PER_POUCH' : 'PER_KG';
}
