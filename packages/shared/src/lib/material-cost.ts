import { round } from './quotation-math.js';

/**
 * Material cost of a quotation line, from the day's rates.
 *
 * A quotation is priced in rupees per kilogram of finished film, so every
 * component has to be expressed as a weight before it can be costed. Films are
 * specified by thickness, which becomes weight through density:
 *
 *     GSM = microns × density        (12µ PET at 1.4 g/cm³ = 16.8 GSM)
 *
 * Ink and adhesive are laid down by weight already, so their GSM is taken from
 * settings rather than derived. The line's cost per kilogram is then the
 * weighted average of the component rates:
 *
 *     cost/kg = Σ(component GSM × component rate) ÷ Σ(component GSM)
 *
 * Verified against job YPP2605001: PET 16.8 + Poly 79.9 + ink 1.8 + adhesive 3
 * is 101.5 GSM composite, matching the imported sheet exactly.
 */

/** PET is the constant layer in every structure the client produces. */
export const PET_DENSITY = 1.4;
export const PET_MICRON_PER_LAYER = 12;

export interface MaterialCostInputs {
  /** 2 or 3. A 3-layer structure carries two PET plies. */
  layer: number;
  polyMicron: number;
  /** Density of the chosen film, g/cm³. */
  polyDensity: number | null;

  /** Rates in rupees per kg on the quotation's date. Null when unknown. */
  petRate: number | null;
  polyRate: number | null;
  inkRate: number | null;
  adhesiveRate: number | null;

  /** Laid down by weight, so taken from settings rather than thickness. */
  inkGsm: number;
  adhesiveGsm: number;
}

export interface MaterialCostResult {
  /** Null when nothing could be costed — no film chosen, or no rate that day. */
  costPerKg: number | null;
  compositeGsm: number;
  /** What each component contributes, for showing the working. */
  breakdown: { component: string; gsm: number; rate: number | null; share: number }[];
}

export function computeMaterialCostPerKg(input: MaterialCostInputs): MaterialCostResult {
  const petLayers = input.layer === 3 ? 2 : 1;
  const petGsm = round(petLayers * PET_MICRON_PER_LAYER * PET_DENSITY, 3);
  const polyGsm =
    input.polyDensity && input.polyMicron > 0 ? round(input.polyMicron * input.polyDensity, 3) : 0;

  const components = [
    { component: 'PET', gsm: petGsm, rate: input.petRate },
    { component: 'Poly', gsm: polyGsm, rate: input.polyRate },
    { component: 'Ink', gsm: input.inkGsm, rate: input.inkRate },
    { component: 'Adhesive', gsm: input.adhesiveGsm, rate: input.adhesiveRate },
  ].filter((c) => c.gsm > 0);

  const compositeGsm = round(
    components.reduce((total, c) => total + c.gsm, 0),
    3,
  );

  const breakdown = components.map((c) => ({
    ...c,
    share: compositeGsm > 0 ? round((c.gsm / compositeGsm) * 100, 2) : 0,
  }));

  // A missing rate on any component would understate the cost, which is worse
  // than showing none at all — a quotation must not look more profitable than
  // it is because a rate was not keyed in that morning.
  const anyRateMissing = components.some((c) => c.rate === null || c.rate === undefined);
  if (compositeGsm <= 0 || anyRateMissing) {
    return { costPerKg: null, compositeGsm, breakdown };
  }

  const weighted = components.reduce((total, c) => total + c.gsm * (c.rate ?? 0), 0);
  return { costPerKg: round(weighted / compositeGsm, 4), compositeGsm, breakdown };
}

/** Margin on the selling rate: (selling − cost) ÷ selling. */
export function computeMargin(sellingPerKg: number, costPerKg: number | null): number | null {
  if (costPerKg === null || sellingPerKg <= 0) return null;
  return round(((sellingPerKg - costPerKg) / sellingPerKg) * 100, 2);
}
