import { round } from './quotation-math.js';

/**
 * **The job card, as the works' own sheet works it out.**
 *
 * The card is the paper an operator is handed before a run: what film, cut to
 * what size, at what micron, how many kilograms of each ply to draw, how many
 * metres that is, how long the press will take and how long the whole job will
 * stand on the floor. Everything on it but a handful of boxes is worked out,
 * and this is the arithmetic that works it out.
 *
 * It is a transcription of the works' Job Sheet tab, formula for formula, and
 * the test beside it reproduces their own Amruta card to the figure. Where the
 * sheet does something unusual it is kept and the reason is written down —
 * replicating it is the whole point, so a "tidier" version that disagrees with
 * the paper on the floor would be worse than no module at all.
 */

/** What the design master holds. Every one of these is a column on Jobs Data. */
export interface JobCardDesign {
  /** Microns per ply. A ply the structure does not have is 0. */
  petMicron: number;
  metPetMicron: number;
  polyMicron: number;
  /** Grams a square metre, per ply, and for the finished laminate. */
  petGsm: number;
  metPetGsm: number;
  polyGsm: number;
  /** Includes the ink and the adhesive, so the plies do not sum to it. */
  compositeGsm: number;
  /** The rubber roller the lamination runs on. Everything else is cut from it. */
  rubberSizeMm: number;
  /** Pouches a kilogram, which the design's own geometry decides. */
  pouchesPerKg: number;
  totalCylinders: number;
}

/** The figures the works sets once and the card reads. All dated on Costing. */
export interface JobCardRates {
  /** Minutes to change one cylinder over, and to change its rubber. */
  cylinderChangeoverMinutes: number;
  rubberChangeMinutes: number;
  /**
   * What the plies are grossed up by, as a percentage.
   *
   * The sheet writes it as a bare `110%` against each ply. It is the film
   * spoiled setting up and running, the same allowance the quotation calls
   * wastage — held as a works figure rather than a constant because the works
   * has already said these move.
   */
  plyAllowancePercent: number;
  /** Days from the customer's order to the promised despatch. The sheet's +15. */
  dispatchLeadDays: number;
}

/** The boxes an operator fills in. Yellow on the sheet. */
export interface JobCardEntry {
  quantityKg: number;
  /** Metres through the press, and how fast it runs. */
  printSpeedMPerMin: number;
  /** Pouches a minute off the pouching machine. Zero until it is known. */
  pouchingSpeedPerMin: number;
  /** Everything that is neither a changeover nor a rubber change. */
  otherSettingMinutes: number;
}

export interface JobCardPly {
  /** 0 where the structure does not have this ply, and then nothing prints. */
  micron: number;
  gsm: number;
  /** Kilograms to draw for this run, allowance included. */
  kg: number;
  /** The width it is cut to. Same for every ply: the rubber plus ten. */
  sizeMm: number;
}

export interface JobCardWorking {
  /** Every ply is cut from the rubber roller plus ten millimetres. */
  materialSizeMm: number;
  /**
   * The structure's thickness as the CARD states it.
   *
   * Plies plus three, and the three is the sheet's own flat allowance for the
   * ink and the adhesive — not the laminate's real coat weights, which the
   * quotation costs separately. A card saying 127µ where the quotation says
   * 124µ is the two documents measuring different things, not a disagreement.
   */
  totalMicron: number;
  pet: JobCardPly;
  metPet: JobCardPly;
  poly: JobCardPly;
  /**
   * Metres of film through the press.
   *
   * Worked off the PET ply alone — its kilograms, its micron, the cut width —
   * because that is the web the press pulls. 1.395 is the density the sheet
   * divides by; it is PET's, and it stays whatever the other plies are.
   */
  printMeters: number;
  /** Minutes, each of them, and the total the job stands on the floor. */
  printMinutes: number;
  cylinderChangeoverMinutes: number;
  rubberChangeMinutes: number;
  otherSettingMinutes: number;
  totalMinutes: number;
  /** Null where the pouching speed is not known yet, never zero or Infinity. */
  pouchingMinutes: number | null;
  totalPouches: number;
}

/** PET's density, which the sheet divides the metreage by. */
const PET_DENSITY = 1.395;

/** The ink and adhesive the card allows for, in microns. The sheet's `+ 3`. */
const COAT_MICRON_ALLOWANCE = 3;

/** Every ply is cut ten millimetres wider than the rubber it runs on. */
const MATERIAL_OVERSIZE_MM = 10;

const at = (value: number | null | undefined): number =>
  Number.isFinite(value) && (value as number) > 0 ? (value as number) : 0;

/**
 * A ply's draw: its share of the laminate's weight, times the order, grossed
 * up by the allowance.
 *
 * The share is taken against the COMPOSITE gsm, which carries the ink and the
 * adhesive — so the three plies come to a little under the order weight before
 * the allowance is added. That is the sheet's arithmetic and it is deliberate:
 * what is drawn from the shelf is film, and the ink and glue are drawn
 * separately.
 */
function plyKg(gsm: number, compositeGsm: number, quantityKg: number, allowance: number): number {
  if (!(compositeGsm > 0) || !(gsm > 0) || !(quantityKg > 0)) return 0;
  /* Unrounded on purpose. The sheet chains these straight into the metreage,
     so rounding here moves the metres and then the press time with them —
     the card is rounded where it is PRINTED, not while it is worked out. */
  return (gsm / compositeGsm) * quantityKg * (1 + allowance / 100);
}

export function computeJobCard(
  design: JobCardDesign,
  rates: JobCardRates,
  entry: JobCardEntry,
): JobCardWorking {
  const materialSizeMm = round(at(design.rubberSizeMm) + MATERIAL_OVERSIZE_MM, 2);
  const quantityKg = at(entry.quantityKg);
  const composite = at(design.compositeGsm);
  const allowance = at(rates.plyAllowancePercent);

  const ply = (micron: number, gsm: number): JobCardPly => ({
    micron: at(micron),
    gsm: at(gsm),
    kg: plyKg(at(gsm), composite, quantityKg, allowance),
    /* A ply the structure does not have is not cut to anything. */
    sizeMm: at(micron) > 0 ? materialSizeMm : 0,
  });

  const pet = ply(design.petMicron, design.petGsm);
  const metPet = ply(design.metPetMicron, design.metPetGsm);
  const poly = ply(design.polyMicron, design.polyGsm);

  const totalMicron = round(pet.micron + metPet.micron + poly.micron + COAT_MICRON_ALLOWANCE, 2);

  /* Nothing to pull through the press until the web has a thickness and a
     width — and a metreage worked out from a zero would be an infinity. */
  const printMeters =
    pet.kg > 0 && pet.micron > 0 && materialSizeMm > 0
      ? (pet.kg * 1_000_000) / (pet.micron * materialSizeMm * PET_DENSITY)
      : 0;

  const speed = at(entry.printSpeedMPerMin);
  const printMinutes = speed > 0 && printMeters > 0 ? printMeters / speed : 0;

  const cylinders = at(design.totalCylinders);
  const cylinderChangeoverMinutes = round(cylinders * at(rates.cylinderChangeoverMinutes), 2);
  const rubberChangeMinutes = round(cylinders * at(rates.rubberChangeMinutes), 2);
  const otherSettingMinutes = at(entry.otherSettingMinutes);

  const totalPouches = at(design.pouchesPerKg) * quantityKg;
  const pouchingSpeed = at(entry.pouchingSpeedPerMin);
  /*
   * Null, not zero and not a division by nothing.
   *
   * The works' own sheet prints #DIV/0! here until somebody types the pouching
   * speed, which is honest but unreadable on a card handed to an operator. The
   * screen says it is not known yet instead.
   */
  const pouchingMinutes =
    pouchingSpeed > 0 && totalPouches > 0 ? totalPouches / pouchingSpeed : null;

  return {
    materialSizeMm,
    totalMicron,
    pet,
    metPet,
    poly,
    printMeters,
    printMinutes,
    cylinderChangeoverMinutes,
    rubberChangeMinutes,
    otherSettingMinutes,
    totalMinutes:
      cylinderChangeoverMinutes + rubberChangeMinutes + otherSettingMinutes + printMinutes,
    pouchingMinutes,
    totalPouches,
  };
}

/**
 * Minutes as the card prints them — `4:33`, never `273 minutes`.
 *
 * The floor reads hours and minutes and the sheet writes `h:mm`, so this does
 * too. Rounded to the minute: a card is a plan, and a plan to the second is a
 * false precision an operator would rightly ignore.
 */
export function asHoursMinutes(minutes: number | null): string {
  if (minutes === null || !Number.isFinite(minutes) || minutes < 0) return '—';
  const whole = Math.round(minutes);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/** The promised despatch: the customer's order date plus the works' lead. */
export function dispatchDateFrom(poDate: string, leadDays: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(poDate)) return '';
  const date = new Date(`${poDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';
  date.setUTCDate(date.getUTCDate() + Math.max(0, Math.round(leadDays)));
  return date.toISOString().slice(0, 10);
}
