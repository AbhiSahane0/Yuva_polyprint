/**
 * **What a job needs, and whether the works has it free.**
 *
 * Two ideas, and keeping them apart is the whole design.
 *
 * *On hand* is what is physically on the shelves — the sum of the batches, and
 * the only figure the stock ledger ever changes.
 *
 * *Held* is what has been committed to job cards that have not finished. It is
 * not a movement and never appears in the ledger. Nothing is deducted for it.
 *
 * So the figure a shortage is measured against is neither of those:
 *
 *     free = on hand − held
 *
 * **This is what guarantees stock is never reduced twice.** The job sheet
 * remains the only thing that issues material, because it is the only thing
 * that knows what was actually weighed at the machine. Production knows what a
 * job *should* take, which is a different and earlier question — and answering
 * it by taking stock off would be answering it twice.
 */

/** One material a job needs, and how much. */
export interface MaterialRequirement {
  materialId: string;
  name: string;
  /** In the material's own unit. */
  quantity: number;
  /**
   * **How wide the reel has to be** — the web this job runs at.
   *
   * `film width × lanes + trim`. A reel narrower than this cannot run the job
   * at all: film can be slit down and never widened. Zero where the job's
   * geometry is not known, which turns the width test off rather than failing
   * everything.
   */
  needsWidthMm: number;
}

/** What the works holds of one material, reel by reel. */
export interface ReelStock {
  /** Null where nobody recorded it — ink and adhesive, or an old delivery. */
  widthMm: number | null;
  quantity: number;
}

/** The same, with what the works can actually put against it. */
export interface MaterialAvailability extends MaterialRequirement {
  /** Everything on the shelves, across every batch. */
  onHand: number;
  /** Committed to other job cards that have not finished. */
  held: number;
  /** `onHand − held`. Everything not promised, at any width. */
  free: number;
  /**
   * **What this job could actually be given.**
   *
   * Free stock, less whatever sits on reels too narrow to run it. This is the
   * figure a shortage is measured against, because kilograms on a 340 mm reel
   * are no use to a job that runs at 650.
   */
  usable: number;
  /**
   * Free stock that is the right film and the wrong size.
   *
   * Worth its own figure: "you have 2,900 kg and 2,100 kg of it is too narrow"
   * is a different problem from "you have none", and it is solved by buying
   * differently rather than by buying more.
   */
  tooNarrowKg: number;
  /** How much is missing, measured against `usable`. Zero when there is enough. */
  shortBy: number;
}

const round3 = (value: number): number =>
  Number.isFinite(value) ? Math.round(value * 1000) / 1000 : 0;

/**
 * The film a run consumes, ply by ply.
 *
 * **The same arithmetic the costing charges for**, so a job card and the
 * quotation behind it cannot disagree about how much film the job takes:
 *
 *     consumed  = ordered × (1 + wastage%)
 *     ply share = that ply's GSM ÷ the whole structure's GSM
 *     ply kg    = share × consumed
 *
 * Note the divisor is the **structure**, which carries the ink and the adhesive
 * as well as the plies. A kilogram of finished laminate is not a kilogram of
 * film, and treating it as one would over-reserve every job by a few per cent —
 * quietly, and in the direction that makes the works look short.
 *
 * Wastage is included on purpose: it is film that has to be on the shelf before
 * the run starts, not an accounting adjustment afterwards.
 */
export function filmRequirements(input: {
  layers: { materialId: string | null; name: string; gsm: number }[];
  /** What this card is making. */
  quantityKg: number;
  /** The structure's own GSM — plies plus ink plus adhesive. */
  structureGsm: number;
  wastagePercent: number;
  /** The web this job runs at. Zero turns the width test off. */
  needsWidthMm: number;
}): MaterialRequirement[] {
  const consumed = input.quantityKg * (1 + (input.wastagePercent || 0) / 100);
  const structure = input.structureGsm > 0 ? input.structureGsm : 0;
  if (structure <= 0 || consumed <= 0) return [];

  /* One line per MATERIAL, not per ply: a laminate using the same film twice
     needs both halves reserved against the one batch, and two rows for one
     material would each be checked against the whole of free stock. */
  const byMaterial = new Map<string, MaterialRequirement>();

  for (const layer of input.layers) {
    if (!layer.materialId || !(layer.gsm > 0)) continue;
    const kg = (layer.gsm / structure) * consumed;
    const held = byMaterial.get(layer.materialId);
    if (held) held.quantity = round3(held.quantity + kg);
    else
      byMaterial.set(layer.materialId, {
        materialId: layer.materialId,
        name: layer.name,
        quantity: round3(kg),
        /* Every ply of one job runs at the same web — they go through the
           laminator together. */
        needsWidthMm: input.needsWidthMm,
      });
  }

  return [...byMaterial.values()];
}

/**
 * What the works can put against each requirement.
 *
 * `held` excludes this card's own reservation where one is passed, so
 * re-checking a card that already holds its film does not report it short
 * against itself — which it would, every time, and nobody could get past it.
 */
export function availabilityFor(
  requirements: MaterialRequirement[],
  stock: { reels: Map<string, ReelStock[]>; held: Map<string, number> },
): MaterialAvailability[] {
  return requirements.map((requirement) => {
    const reels = stock.reels.get(requirement.materialId) ?? [];
    const onHand = round3(reels.reduce((sum, reel) => sum + reel.quantity, 0));
    const held = round3(stock.held.get(requirement.materialId) ?? 0);
    const free = round3(onHand - held);

    /*
     * A reel of unknown width counts as usable.
     *
     * Not an assumption that it fits — an admission that nothing here can say
     * it does not. A works that has never recorded a width is left exactly
     * where it was before widths existed, which is the only honest way to
     * degrade; recording them is what sharpens the answer.
     */
    const wideEnough = round3(
      reels
        .filter((reel) => reel.widthMm === null || reel.widthMm >= requirement.needsWidthMm)
        .reduce((sum, reel) => sum + reel.quantity, 0),
    );

    /*
     * Claims come off the wide pool first.
     *
     * Nothing records WHICH reel a claim is against, so this has to assume
     * something. Assuming the widest suitable reels were taken understates what
     * is left, and of the two ways to be wrong that is the one that does not
     * send a job to a machine it cannot run on.
     */
    const usable = round3(Math.max(0, wideEnough - held));

    return {
      ...requirement,
      onHand,
      held,
      free,
      usable,
      tooNarrowKg: round3(Math.max(0, onHand - wideEnough)),
      shortBy: round3(Math.max(0, requirement.quantity - usable)),
    };
  });
}

/** The ones there is not enough of. Empty means the job can run. */
export function shortages(availability: MaterialAvailability[]): MaterialAvailability[] {
  return availability.filter((line) => line.shortBy > 0);
}

/**
 * Whether a card should be flagged short — which a finished one never is.
 *
 * "Is there enough film" is a question about a job that is still to run. A
 * completed card has already had its material; what is free now says nothing
 * about it, and flagging it red sends somebody to solve a problem that was
 * solved. The figures stay on the card, because what a run was expected to take
 * is worth reading afterwards. Only the alarm goes.
 */
export function flagsShort(card: {
  status: string;
  materials: MaterialAvailability[];
}): MaterialAvailability[] {
  if (card.status === 'COMPLETED') return [];
  return shortages(card.materials);
}
