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
