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
}

/** The same, with what the works can actually put against it. */
export interface MaterialAvailability extends MaterialRequirement {
  /** Everything on the shelves, across every batch. */
  onHand: number;
  /** Committed to other job cards that have not finished. */
  held: number;
  /** `onHand − held`. What this job could actually draw on. */
  free: number;
  /** How much is missing. Zero when there is enough. */
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
  stock: { onHand: Map<string, number>; held: Map<string, number> },
): MaterialAvailability[] {
  return requirements.map((requirement) => {
    const onHand = round3(stock.onHand.get(requirement.materialId) ?? 0);
    const held = round3(stock.held.get(requirement.materialId) ?? 0);
    const free = round3(onHand - held);
    return {
      ...requirement,
      onHand,
      held,
      free,
      shortBy: round3(Math.max(0, requirement.quantity - free)),
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
