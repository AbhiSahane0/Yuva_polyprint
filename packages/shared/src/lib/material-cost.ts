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
 *
 * The plies are supplied by the caller as a list. Earlier versions hard-coded
 * "one PET, optionally one MET PET, then the poly the office typed", which is
 * the structure this works produces today but not one the office could state on
 * the quotation — a 19µ PET or a foil ply needed a code change. A list also
 * means a four-ply structure costs correctly the day it is first quoted.
 */

/*
 * The structure this works produces by default.
 *
 * No longer baked into the calculation — the office states the plies now — but
 * still the right thing to offer as a starting point when a new line is added,
 * and the basis on which existing lines were migrated to per-ply data.
 */
export const PET_DENSITY = 1.4;
export const PET_MICRON_PER_LAYER = 12;
export const METPET_DENSITY = 1.4;
export const METPET_MICRON_PER_LAYER = 12;

/** What one ply of the laminate contributes. */
export interface LayerInput {
  /** For the breakdown, so a saved line reads back without a rate lookup. */
  name: string;
  micron: number;
  /** g/cm³. Null when the chosen material has none recorded — see below. */
  density: number | null;
  /** Rupees per kg on the quotation's date. Null when no rate was entered. */
  ratePerKg: number | null;
}

export interface MaterialCostInputs {
  layers: LayerInput[];

  /** Laid down by weight, so taken from settings rather than thickness. */
  inkGsm: number;
  adhesiveGsm: number;
  inkRate: number | null;
  adhesiveRate: number | null;
}

export interface MaterialComponent {
  component: string;
  gsm: number;
  rate: number | null;
  /** Percentage of the composite weight — also the share of a kilogram. */
  share: number;
}

export interface MaterialCostResult {
  /** Null when nothing could be costed — no ply chosen, or a rate missing. */
  costPerKg: number | null;
  compositeGsm: number;
  /** What each component contributes, for showing the working. */
  breakdown: MaterialComponent[];
}

/**
 * Adhesive thickness added to the structure, in microns.
 *
 * Flat, not per bond. A three-ply laminate is glued twice and so ought to carry
 * twice the adhesive, but the client's spreadsheet adds a single 2µ either way
 * and every imported job matches it. Changing this moves pouches-per-kg on
 * every 3-layer line, so it stays as the sheet has it until the works says
 * otherwise.
 */
export const ADHESIVE_MICRON = 2;

/** Total structure thickness: every ply, plus the adhesive between them. */
export function totalMicronForLayers(layers: { micron: number }[]): number {
  const plies = layers.reduce((total, layer) => total + (layer.micron || 0), 0);
  return round(plies + ADHESIVE_MICRON, 2);
}

export function computeMaterialCostPerKg(input: MaterialCostInputs): MaterialCostResult {
  const plies = input.layers.map((layer) => ({
    component: layer.name,
    /*
     * A material with no density recorded cannot be turned into a weight, so it
     * contributes nothing and is filtered out below. That is deliberate: a
     * silent 0 g/cm³ would quietly price the ply at nothing, and a quotation
     * must never look cheaper to make than it is.
     */
    gsm: layer.density && layer.micron > 0 ? round(layer.micron * layer.density, 3) : 0,
    rate: layer.ratePerKg,
  }));

  const components = [
    ...plies,
    { component: 'Ink', gsm: input.inkGsm, rate: input.inkRate },
    { component: 'Adhesive', gsm: input.adhesiveGsm, rate: input.adhesiveRate },
  ].filter((c) => c.gsm > 0);

  const compositeGsm = round(
    components.reduce((total, c) => total + c.gsm, 0),
    3,
  );

  const breakdown: MaterialComponent[] = components.map((c) => ({
    ...c,
    share: compositeGsm > 0 ? round((c.gsm / compositeGsm) * 100, 2) : 0,
  }));

  /*
   * A missing rate on any component would understate the cost, which is worse
   * than showing none at all — a quotation must not look more profitable than
   * it is because a rate was not keyed in that morning.
   *
   * A ply the user chose but which carries no density is the same problem
   * wearing a different hat: it drops out of `components` above, so the
   * composite would be the remaining plies and the cost/kg an average of the
   * wrong things. Catch it here rather than reporting a confident wrong number.
   */
  const anyRateMissing = components.some((c) => c.rate === null || c.rate === undefined);
  const anyPlyUnweighable = input.layers.some((l) => l.micron > 0 && !l.density);

  if (compositeGsm <= 0 || anyRateMissing || anyPlyUnweighable) {
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

/**
 * The gauge a film's own name states, in microns.
 *
 * Every film in the rates master is named with its thickness — "PET 12µm",
 * "PE 60µm", "PVC / PETG 45µm" — because a 12µ PET and a 19µ PET are bought,
 * stocked and priced as two different materials. The name is therefore the
 * authority on thickness, and the quotation stopped asking for it a second
 * time: choosing the film sets the micron, so the two cannot disagree. Typing
 * them separately is how quotation #123 came to carry a "PET 19µm" ply
 * recorded at 60 microns.
 *
 * Null when the name states no gauge — "PP Woven" — which the caller has to
 * handle. Returning zero instead would quietly under-weigh the laminate and
 * report a confident, wrong cost per kilogram.
 */
export function micronFromFilmName(name: string): number | null {
  // The first number that is followed by a micron unit, so a name carrying an
  // unrelated figure ahead of the gauge is not mistaken for one.
  const match = /(\d+(?:\.\d+)?)\s*(?:µ|mic)/i.exec(name);
  if (!match) return null;

  const micron = Number(match[1]);
  return Number.isFinite(micron) && micron > 0 ? micron : null;
}

/**
 * A film's name with its gauge taken off — the material as the office names it.
 *
 * `PET 12µm` and `PET 19µm` are two rows in the rates master with two prices,
 * but they are one film to anybody standing at the machine: PET. The gauge is
 * typed on the line, so offering both in a dropdown asks the same question
 * twice and invites the two answers to disagree.
 *
 * A name that states no gauge comes back unchanged — `PP Woven` is its own
 * family of one.
 */
export function filmFamily(name: string): string {
  return name
    .replace(/(\d+(?:\.\d+)?)\s*(?:µm?|mic(?:ron)?s?)/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The stocked film a family and a gauge name between them.
 *
 * The works keeps one rate per film and uses it at every gauge, so this is no
 * longer choosing between prices — every row in a family carries the same
 * figure. What it is choosing is a **row**: a density, a name, and the rate
 * that goes with them.
 *
 * An exact gauge match first, so a master that does still hold `PET 12µm` and
 * `PET 19µm` separately picks the one the office actually named. Then a row
 * whose name states no gauge at all, which is a family stocked at whatever
 * thickness is typed. Failing both, the nearest gauge in the family — which
 * costs the ply at that row's rate, because that rate is the film's rate.
 *
 * The density is the reason the fallback has to return something rather than
 * nothing: it is a property of the polymer and not of the gauge (every PET in
 * the master is 1.4, every PE 0.94), and without it a micron figure cannot be
 * turned into weight at all.
 *
 * Undefined when the family holds nothing at all.
 */
export function resolveFilm<T extends { name: string }>(
  family: string,
  micron: number,
  films: readonly T[],
): T | undefined {
  const inFamily = films.filter((film) => filmFamily(film.name) === family);
  if (inFamily.length === 0) return undefined;

  const exact = inFamily.find((film) => micronFromFilmName(film.name) === micron);
  if (exact) return exact;

  // A family named without a gauge is stocked at whatever thickness is typed.
  const gaugeless = inFamily.find((film) => micronFromFilmName(film.name) === null);
  if (gaugeless) return gaugeless;

  if (!Number.isFinite(micron) || micron <= 0) return inFamily[0];

  return inFamily.reduce((nearest, film) => {
    const a = Math.abs((micronFromFilmName(film.name) ?? 0) - micron);
    const b = Math.abs((micronFromFilmName(nearest.name) ?? 0) - micron);
    return a < b ? film : nearest;
  });
}

/**
 * What one ply costs per kilogram.
 *
 * **A film has one rate, and it applies at every gauge.** The works buys PET
 * at a rupee figure a kilogram and pays near enough the same whether the reel
 * is 12 micron or 15, so it keeps one rate per film rather than one per gauge —
 * and the same for MET PET, PE and the rest. A kilogram of PET is a kilogram of
 * PET; the thickness decides how many metres that kilogram covers, which the
 * GSM already carries, not what the kilogram costs.
 *
 * So two cases, not three:
 *
 * - A rate typed for this job: that rate.
 * - Otherwise the film's own rate, whatever gauge was quoted.
 *
 * This used to refuse to cost a ply whose gauge was not the one named in the
 * film's row — `PET 12µm` quoted at 20µ came back null and the line read as
 * uncostable until somebody typed a price. That was built on the premise that
 * the master holds `PET 12µm` and `PET 19µm` as two materials at two prices.
 * The works does not price that way, so the refusal asked for a figure nobody
 * had a reason to give and left the margin reading as a dash until they made
 * one up.
 *
 * Null still means "cannot be costed", and still happens: no film chosen, or a
 * film with no rate on record.
 */
export function plyRatePerKg(ply: {
  /** Null when no film has been chosen at all. */
  materialName: string | null;
  /** The chosen film's current rate, or null when it has none on record. */
  stockRate: number | null;
  /** What the office agreed for this job, when it differs from the list. */
  override: number | null;
}): number | null {
  if (ply.override !== null && ply.override > 0) return ply.override;
  if (ply.materialName === null) return null;
  return ply.stockRate;
}

/**
 * The rate on a ply stored before there was a column to store it in.
 *
 * **For old rows only.** There was a period when the rates master was read as
 * pricing a film at the gauge it was stocked in — `PET 12µm` and `PET 19µm` as
 * two materials at two prices — so a 20µ PET matched neither and the office was
 * asked for a figure. Nothing recorded that it had been asked: the ply kept the
 * film's name, so a name stating a gauge different from the one quoted **was**
 * the override, and reading it back meant inferring it.
 *
 * Rows written since carry `rateOverride` themselves and never reach this. It
 * survives so that quotations saved in that period reprice to exactly the
 * figures they were sent at — which is the whole reason not to delete it, even
 * though the premise underneath it is no longer how films are priced.
 *
 * Null in every ordinary case, which leaves repricing free to pick up the
 * material's current rate as it always has.
 *
 * Shared because the server and the form must agree on it. The server carries
 * this rate through when repricing from storage, and the form puts it back in
 * the box when a quotation is reopened; if the two read it differently, a
 * quotation would show one rate and be repriced at another.
 */
export function overriddenRate(layer: {
  materialName: string;
  micron: number | string;
  ratePerKg: number | string | null;
}): number | null {
  if (layer.ratePerKg === null) return null;
  const stocked = micronFromFilmName(layer.materialName);
  if (stocked === null || stocked === Number(layer.micron)) return null;
  const rate = Number(layer.ratePerKg);
  return Number.isFinite(rate) ? rate : null;
}
