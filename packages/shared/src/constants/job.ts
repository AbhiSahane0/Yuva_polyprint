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
  'D_PUNCH',
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
  D_PUNCH: 'D punch',
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

/**
 * Process or special, for an ink.
 *
 * Cyan, magenta, yellow and black are the four every press carries and any job
 * may use. Everything else is a job's own decision — a white base coat, a
 * brand's Pantone, a metallic — and belongs to the works only once somebody has
 * bought a tin of it.
 *
 * Named here rather than written inline in three places, which is what it was
 * before a quotation needed to store which kind each of its colours is.
 */
export const INK_KINDS = ['PROCESS', 'SPECIAL'] as const;
export type InkKind = (typeof INK_KINDS)[number];

/** The styles the trade prices by the piece. */
const PER_POUCH_STYLES: readonly PouchType[] = ['STANDUP', 'STANDUP_ZIPPER'];

/**
 * The basis a style is conventionally sold on.
 *
 * A suggestion, not a rule. It is what a line takes when nobody says otherwise,
 * and what changing the style resets it to — but the office can sell a standup
 * pouch by the kilogram if that is how the customer buys, which is a real order
 * this could not describe while the style was the only answer.
 *
 * A roll is the one case with no choice: there are no pouches on a reel to
 * count. That is enforced by the schema, not here.
 */
export function pricingBasisFor(jobKind: JobKind, pouchType: PouchType | null): PricingBasis {
  if (jobKind === 'ROLL' || pouchType === null) return 'PER_KG';
  return PER_POUCH_STYLES.includes(pouchType) ? 'PER_POUCH' : 'PER_KG';
}
