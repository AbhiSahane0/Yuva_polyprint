import type { MaterialRequirement } from './material-availability.js';
import { parseAdhesiveRatio, batchSolidsFor } from './rate-costing.js';

/**
 * **What a run takes off the shelf besides film.**
 *
 * Ink, the solvents it is thinned with, the adhesive and its hardener. The
 * arithmetic is the costing's, to the letter — a job card that asked for
 * different quantities than the quotation charged for would be two answers to
 * one question.
 *
 * It is written out here rather than taken from `costRate` because the
 * quantities depend on **none** of what makes a rate: not the machines, not the
 * wages, not the overheads. A kilogram of ink is a kilogram of ink whatever the
 * press costs to run. Dragging the whole engine in to learn that would tie the
 * floor's stock check to figures that have nothing to do with it.
 */

const round3 = (value: number): number =>
  Number.isFinite(value) ? Math.round(value * 1000) / 1000 : 0;

/** Nothing bought in a drum comes on a reel, so no width can be asked of it. */
const NO_WIDTH = 0;

function add(
  into: Map<string, MaterialRequirement>,
  materialId: string | null,
  name: string,
  kg: number,
): void {
  if (!materialId || !(kg > 0)) return;
  const held = into.get(materialId);
  if (held) held.quantity = round3(held.quantity + kg);
  else into.set(materialId, { materialId, name, quantity: round3(kg), needsWidthMm: NO_WIDTH });
}

/** One colour as the quotation stored it. */
export interface ColourRequirement {
  /** Null on a special nobody has chosen the ink for yet. */
  materialId: string | null;
  name: string;
  laydownGsm: number;
  solidsPercent: number;
}

/**
 * Ink, and the solvent it is let down with.
 *
 * **What comes off the shelf is the WET weight.** A colour's laydown is what
 * stays on the film once it has dried; the tin is bought at its wet weight, and
 * a reservation that asked for the dry figure would under-claim every job by
 * whatever the solids percentage is — three or four times over, on an ink at
 * 23% solids.
 *
 * Every colour is laid on the same area, which is the first ply's: its
 * kilograms at its own GSM.
 */
export function inkRequirements(input: {
  colours: ColourRequirement[];
  /** The printed ply's weight for this run, and its GSM. */
  printedLayerKg: number;
  printedLayerGsm: number;
  /** The works' thinning, as parts of ink to parts of solvent. */
  inkParts: number;
  solventParts: number;
  ethylAcetatePercent: number;
  ethylAcetateMaterialId: string | null;
  ethylAcetateName: string;
  tolueneMaterialId: string | null;
  tolueneName: string;
}): MaterialRequirement[] {
  const out = new Map<string, MaterialRequirement>();
  if (!(input.printedLayerGsm > 0) || !(input.printedLayerKg > 0)) return [];

  const printedAreaSqm = (input.printedLayerKg * 1000) / input.printedLayerGsm;
  const totalParts = input.inkParts + input.solventParts;
  const solventShare = totalParts > 0 ? input.solventParts / totalParts : 0;

  let solventKg = 0;

  for (const colour of input.colours) {
    const dryKg = (printedAreaSqm * colour.laydownGsm) / 1000;
    const wetKg = colour.solidsPercent > 0 ? (dryKg * 100) / colour.solidsPercent : 0;
    /*
     * A special whose ink nobody has chosen still uses solvent — the works
     * mixes SOMETHING — but there is no drum to hold. Its solvent counts and
     * its pigment does not, which is the honest half of what is known.
     */
    add(out, colour.materialId, colour.name, wetKg);
    solventKg += wetKg * solventShare;
  }

  const ethyl = solventKg * (input.ethylAcetatePercent / 100);
  add(out, input.ethylAcetateMaterialId, input.ethylAcetateName, ethyl);
  add(out, input.tolueneMaterialId, input.tolueneName, solventKg - ethyl);

  return [...out.values()];
}

/**
 * Adhesive, as the batch it is actually mixed as.
 *
 * Spread over the **substrate** rather than the whole laminate, because it goes
 * between the films and not over itself or the ink. Then let down to the
 * works' own ratio — 100 parts adhesive to 146 of ethyl acetate to 15 of
 * hardener — so what leaves the store is three drums, not one.
 */
export function adhesiveRequirements(input: {
  adhesiveGsm: number;
  /** The plies' own GSM, without ink or adhesive. */
  substrateGsm: number;
  consumedKg: number;
  /** As "100:146:15". */
  splitRatio: string;
  adhesiveMaterialId: string | null;
  adhesiveName: string;
  ethylAcetateMaterialId: string | null;
  ethylAcetateName: string;
  hardenerMaterialId: string | null;
  hardenerName: string;
}): MaterialRequirement[] {
  const out = new Map<string, MaterialRequirement>();
  if (!(input.substrateGsm > 0) || !(input.adhesiveGsm > 0) || !(input.consumedKg > 0)) return [];

  const batchSolids = batchSolidsFor(input.splitRatio) ?? 100;
  if (!(batchSolids > 0)) return [];

  const batchKg = ((input.adhesiveGsm / input.substrateGsm) * input.consumedKg * 100) / batchSolids;

  const parts = parseAdhesiveRatio(input.splitRatio) ?? [100, 0, 0];
  const total = parts[0] + parts[1] + parts[2];
  if (!(total > 0)) return [];

  add(out, input.adhesiveMaterialId, input.adhesiveName, (parts[0] / total) * batchKg);
  add(out, input.ethylAcetateMaterialId, input.ethylAcetateName, (parts[1] / total) * batchKg);
  add(out, input.hardenerMaterialId, input.hardenerName, (parts[2] / total) * batchKg);

  return [...out.values()];
}
