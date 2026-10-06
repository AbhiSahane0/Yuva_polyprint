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

/**
 * Yield allowance, for a structure whose plies have no density on record.
 *
 * A fallback, not the model. It stands in for the film's density with a flat
 * 1.1, which is only right when the laminate happens to average that: PET over
 * white-opaque poly averages 0.985, so a pouch came out 9.1% heavy and 500 kg
 * was quoted as 8,730 pouches where the works' own sheet says 9,524. Foil is
 * 2.71 and would go the other way, badly.
 *
 * `structureGsm` is the model. This is what is left when a ply has no density
 * to work from, and a wrong weight is still better than a weightless one.
 */
export function layerFactor(layer: number): number {
  return layer === 2 ? 1.1 : 1.2;
}

/**
 * What a square metre of the finished laminate weighs.
 *
 * Each ply at its own density, plus the ink and the adhesive it carries —
 * exactly the column the works' sheet totals to reach its 125 GSM, and the
 * same arithmetic the rate costing uses. Density is a property of the film and
 * is edited on the Rates screen beside its price.
 *
 * Returns 0 when any ply has no density on record, so the caller falls back
 * rather than quietly under-weighing the structure by a whole ply.
 */
export function structureGsm(
  plies: { micron: number; density: number | null | undefined }[],
  coats: { inkGsm: number; adhesiveGsm: number },
): number {
  if (plies.length === 0) return 0;

  let substrate = 0;
  for (const ply of plies) {
    /* A ply left at zero microns is a ply the structure does not have. */
    if (!(ply.micron > 0)) continue;
    if (!(Number(ply.density) > 0)) return 0;
    substrate += ply.micron * Number(ply.density);
  }
  if (substrate <= 0) return 0;

  return round(substrate + Math.max(0, coats.inkGsm) + Math.max(0, coats.adhesiveGsm), 4);
}

/**
 * **What the works' pouch workbook weighs a square metre at.**
 *
 * Not the same quantity as `structureGsm`, and not an approximation of it. The
 * workbook reaches a pouch weight a different way:
 *
 *     grams = width_cm × height_cm × (average density) × (total micron) ÷ 10,000
 *
 * where the average is taken flat across its rows — every film ply, then INKS
 * and ADHESIVE, both carried at density 1 — and the total micron sums the same
 * rows. Written here as an effective GSM, `average density × total micron`, so
 * it drops into exactly the arithmetic `structureGsm` feeds.
 *
 * **It is arithmetically wrong and it is what the works prices on.** A flat
 * mean of 1.4, 1.4, 0.92, 1, 1 over-weights the thick low-density poly, so a
 * 12/12/75 standup comes out at 116.9 against its real 105.8 — about ten per
 * cent heavy, and therefore about ten per cent dearer a pouch. The works has
 * quoted this way for years and asked for it kept; `structureGsm` stays the
 * physical figure and is what production reserves film against, so the two
 * must not be substituted for one another.
 *
 * Only the pouch workbook's styles use this. The Estimation sheet's — centre
 * seal, three side seal, spout — weigh with `structureGsm`, which is what the
 * seven 2022 quotations reproduce to the paisa.
 */
export function workbookStructureGsm(
  plies: { micron: number; density: number | null | undefined }[],
  coats: { inkGsm: number; adhesiveGsm: number },
): number {
  /* A ply left at zero microns is a ply the structure does not have, and it is
     not a row on the sheet either — so it does not dilute the average. */
  const live = plies.filter((ply) => ply.micron > 0);
  if (live.length === 0) return 0;
  if (live.some((ply) => !(Number(ply.density) > 0))) return 0;

  const ink = Math.max(0, coats.inkGsm);
  const adhesive = Math.max(0, coats.adhesiveGsm);

  /* The two coats are rows on the sheet like any other, at density 1 — which
     is why their GSM and their "micron" are the same number there. */
  const densities = [...live.map((ply) => Number(ply.density)), 1, 1];
  const averageDensity = densities.reduce((total, d) => total + d, 0) / densities.length;
  const totalMicron = live.reduce((total, ply) => total + ply.micron, 0) + ink + adhesive;

  return round(averageDensity * totalMicron, 4);
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
  /** The engraver's mounting margin — see `DEFAULT_CYLINDER_MOUNTING_MM`. */
  mountingMm?: number;
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

  const cylinderWidth = round(
    input.widthMm * input.repeatWidth + (input.mountingMm ?? DEFAULT_CYLINDER_MOUNTING_MM),
    2,
  );
  const cylinderCircumference = round(input.heightMm * input.repeatHeight, 2);
  const costPerCylinder = round(((cylinderWidth * cylinderCircumference) / 100) * cylinderRate, 2);
  /* No cylinders, no cylinder cost — the transport too, since there is nothing
     to deliver. See the same rule in `computeItemGeometry`. */
  const totalCylinderCost =
    input.cylinderCount > 0
      ? round(costPerCylinder * input.cylinderCount + (input.transportCost ?? 0), 2)
      : 0;

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
  /**
   * Grams per square metre of the finished laminate — see `structureGsm`.
   *
   * What decides the pouch's weight where it is known. Omitted or zero falls
   * back to the micron proxy, which is what a ply with no density leaves.
   */
  gsm?: number;
  /**
   * The pouch workbook's own weight basis — see `workbookStructureGsm`.
   *
   * Set only on the styles that workbook costs, and preferred over `gsm` when
   * it is. `gsm` stays the physical figure either way: it is what the line's
   * material cost and production's film reservation work from, and only the
   * pouch COUNT moves onto the workbook's reading.
   */
  workbookGsm?: number;
  /**
   * Cylinder face beyond the web, in millimetres — the engraver's mounting
   * margin. Set on the Costing screen; omitted falls back to the works' 80.
   */
  mountingMm?: number;
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
  /**
   * Cylinders being re-engraved on this line, and what each costs to put right.
   *
   * Charged whether or not a new set is. A repeat order charges nothing for the
   * set it already has and may still be quoted for a repair of one of them.
   */
  repairs?: readonly { cost: number }[];
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
 * The circumferences the works can have engraved, in millimetres.
 *
 * **400 to 600 is the works' own answer**, given for this purpose: outside it
 * the engraver cannot cut the cylinder, so a job that lands outside is not a
 * job that can be run as drawn.
 *
 * `PREFERRED` is where the suggestion aims, and is not a limit. It came off the
 * 347 imported jobs that record a circumference — they cluster around 480, and
 * aiming at 490 reproduces the repeat the works actually chose on 85% of them.
 * The other 15% are jobs where two repeats both fit and the works took the
 * other one: which cylinder was free that week, not arithmetic. That is exactly
 * why the suggested repeat stays editable.
 *
 * Those same imported jobs run 310 to 740, wider than this. They are a record
 * of what was cut over years, not of what can be cut now — so the range here is
 * the stated one and the suggestion stays inside it, rather than proposing a
 * repeat the form would immediately warn about.
 */
export const CYLINDER_CIRCUMFERENCE = { MIN: 400, MAX: 600, PREFERRED: 490 } as const;

/**
 * The cylinder faces the works can have engraved, in millimetres.
 *
 * Also the works' own answer. Note it is **not** `MAX_CYLINDER_FACE_MM`, which
 * is a different figure for a different job: 800 is what the works actually
 * runs and what the lane suggestion is built on, 1060 is what the engraver can
 * cut. A cylinder between the two is unusual rather than impossible, and
 * nothing here should quietly start proposing wider ones — the number of lanes
 * decides the running metres, and therefore the price of every job.
 */
export const CYLINDER_FACE = { MIN: 450, MAX: 1060 } as const;

/** One cylinder dimension being outside what can be engraved. */
export interface CylinderWarning {
  /** 'width' or 'circumference' — which box to put it under. */
  field: 'width' | 'circumference';
  /** Said in full, because it is read without the field's label in reach. */
  message: string;
}

/**
 * Whether this line's cylinder can be cut, and what is wrong when it cannot.
 *
 * A **warning, not a refusal**. An enquiry is allowed to describe something the
 * works cannot make — that is half of what an enquiry is for — and the office
 * answers it by changing the lanes or the repeat, which are two boxes above.
 * Refusing to price it would leave them with a blocked form and no figure to
 * talk to the customer about.
 *
 * Zero is silent. A line still being typed has no size yet, and a form that
 * complains before anything has been entered is one people learn to ignore.
 */
export function cylinderWarnings(geometry: {
  cylinderWidth: number;
  cylinderCircumference: number;
}): CylinderWarning[] {
  const warnings: CylinderWarning[] = [];

  const { cylinderWidth: width, cylinderCircumference: around } = geometry;

  if (width > 0 && (width < CYLINDER_FACE.MIN || width > CYLINDER_FACE.MAX)) {
    warnings.push({
      field: 'width',
      message:
        `${round(width, 2)} mm is outside the ${CYLINDER_FACE.MIN}–${CYLINDER_FACE.MAX} mm ` +
        `the works can have engraved. Change the lanes across.`,
    });
  }

  if (around > 0 && (around < CYLINDER_CIRCUMFERENCE.MIN || around > CYLINDER_CIRCUMFERENCE.MAX)) {
    warnings.push({
      field: 'circumference',
      message:
        `${round(around, 2)} mm is outside the ${CYLINDER_CIRCUMFERENCE.MIN}–` +
        `${CYLINDER_CIRCUMFERENCE.MAX} mm the works can have engraved. Change the repeats around.`,
    });
  }

  return warnings;
}

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
 * Millimetres of cylinder face beyond the printed web, when nothing says.
 *
 * The engraver's mounting margin. A fallback only: the works sets its own on
 * the Costing screen, because it is what their engraver charges for and the
 * client's workbook does not reach cylinders at all. 80 is what their own jobs
 * show — `width × lanes + 80` is at or under the press's face on 95% of them.
 */
export const DEFAULT_CYLINDER_MOUNTING_MM = 80;

/**
 * How many lanes of the design fit across the web.
 *
 * As many as the machine's face will take, which is what the works does on most
 * jobs — running fewer lanes than will fit means printing the same order over
 * more passes. Never less than 1, so an unusually wide design is still quotable
 * rather than being quoted as zero lanes and priced at nothing.
 */
export function suggestRepeatWidth(
  filmWidthMm: number,
  mountingMm: number = DEFAULT_CYLINDER_MOUNTING_MM,
): number {
  if (!Number.isFinite(filmWidthMm) || filmWidthMm <= 0) return 1;
  /* The same margin `cylinderWidth` adds, so the lanes it suggests fit. */
  const usable = MAX_CYLINDER_FACE_MM - Math.max(0, mountingMm);
  return Math.max(1, Math.floor(usable / filmWidthMm));
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
  /*
   * Grams of film per pouch.
   *
   * From the structure's real GSM where the plies carry a density — the sheet's
   * own arithmetic — and from the micron proxy where they do not.
   */
  /*
   * The workbook's basis first where the style is costed on it, then the real
   * GSM, then the micron proxy for a structure with no densities at all.
   */
  const weighsAt =
    input.workbookGsm && input.workbookGsm > 0
      ? input.workbookGsm
      : input.gsm && input.gsm > 0
        ? input.gsm
        : 0;
  const gramsPerPouch =
    weighsAt > 0
      ? (filmWidthMm * filmHeightMm * weighsAt) / 1_000_000
      : ((filmWidthMm * filmHeightMm) / 100) * input.micron * factor * 0.0001;
  /*
   * **Rounded UP to a whole pouch on the workbook's basis**, which is what its
   * own `ROUNDUP(...,0)` does — a 12/12/75 standup at 129.01 is quoted as 130
   * to the kilogram. It is the works' arithmetic, and it is also the whole
   * number the office asked to read rather than two decimal places of a thing
   * that only comes in ones.
   *
   * Everything else keeps the two places. A reel has no pouches at all, and
   * the Estimation sheet's styles are costed to the paisa against documents
   * that do not round.
   */
  const perKg = gramsPerPouch > 0 ? 1000 / gramsPerPouch : 0;
  const pouchesPerKg =
    !(input.makesPouches ?? true) || perKg <= 0
      ? 0
      : input.workbookGsm && input.workbookGsm > 0
        ? Math.ceil(perKg)
        : round(perKg, 2);

  const cylinderWidth = round(
    filmWidthMm * input.repeatWidth + (input.mountingMm ?? DEFAULT_CYLINDER_MOUNTING_MM),
    2,
  );
  const cylinderCircumference = round(filmHeightMm * input.repeatHeight, 2);
  const costPerCylinder = round(((cylinderWidth * cylinderCircumference) / 100) * cylinderRate, 2);

  /*
   * A design whose cylinders already exist is quoted without them — transport
   * included, because there is nothing to deliver. The per-cylinder figure is
   * still reported so the office can see what a new set would have cost.
   */
  /*
   * What the customer pays for cylinders on this line.
   *
   * Three cases, and they are not exclusive in principle though the form only
   * offers one at a time: a new set is cut and charged; an existing set has one
   * or more put right, charged at what the office typed against each; or
   * neither, which is the ordinary repeat order.
   *
   * The repair sits in this bucket rather than in the material rate because it
   * is a cylinder cost — the quotation bills it 100% in advance with the rest
   * of them, and the customer reads it on the cylinder line.
   */
  const repairCost = round(
    (input.repairs ?? []).reduce((total, repair) => total + (Number(repair.cost) || 0), 0),
    2,
  );
  /*
   * **No cylinders means no cylinder cost**, transport included.
   *
   * The arithmetic already gave nought for the cylinders themselves, but it
   * went on adding the transport — so a line with no cylinders on it quoted a
   * delivery charge for delivering nothing. It happens on every unprinted job:
   * a line with no colours asks for no cylinders at all, and the works still
   * saw a figure on the cylinder line.
   *
   * A repair is charged whatever the count: a cylinder being put right is one
   * that already exists and was never going to be counted here.
   */
  const charged = (input.chargeCylinders ?? true) && input.cylinderCount > 0;
  const totalCylinderCost = charged
    ? round(costPerCylinder * input.cylinderCount + (input.transportCost ?? 0) + repairCost, 2)
    : repairCost;

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

/**
 * Which quantity a quotation is actually for, 1-based.
 *
 * Clamped rather than trusted. The selection and the quantities are edited on
 * the same screen and saved together, so a quotation cut from three quantities
 * down to one arrives still pointing at the third — and rejecting that would
 * make trimming a quotation an error the office has to clear rather than an
 * edit. Falling back to the first is the harmless reading: it is the quantity
 * that certainly exists.
 */
export function resolveSelectedQuantity(
  selected: number | null | undefined,
  count: number,
): number {
  if (count <= 0) return 1;
  const asked = Number(selected ?? 1);
  if (!Number.isFinite(asked) || asked < 1) return 1;
  return Math.min(Math.floor(asked), count);
}
