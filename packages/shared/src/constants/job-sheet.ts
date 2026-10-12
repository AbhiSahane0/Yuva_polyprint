import type { JobSheetStage } from '../lib/job-sheet-costing.js';

/**
 * **The rows of the works' paper job sheet, in the order they are on it.**
 *
 * A job sheet is filled in by whoever is standing at the machine, against a
 * printed form they have used for years. Reordering it, renaming its rows or
 * making it a free list of "add a material" would be a worse form, however much
 * more general it looks in a database: the person filling it in is reading down
 * a column and typing what the drum says.
 *
 * So the twenty-one lines below are fixed, named as the works names them, and
 * in the works' order. What is *not* fixed is the rate — that comes from the
 * materials catalogue as at the day of the run — and any line can be left at
 * zero, which is what most of the twelve colours are on most jobs.
 */

export type JobSheetSection = 'PRINTING' | 'LAMINATION';
export type JobSheetLineKind = 'FILM' | 'SOLVENT' | 'INK' | 'ADHESIVE' | 'OTHER';

/** Where a line's mix share is drawn from. */
export type JobSheetMixSource =
  /** Nothing mixed: used exactly as bought. */
  | 'NONE'
  /** Its own drum, on the same row — how an ink is supplied. */
  | 'OWN'
  /** The pooled drum for the stage — how the solvents are booked back. */
  | 'PRINT_POOL'
  | 'LAM_POOL';

export interface JobSheetLineTemplate {
  /** Stable key, so a renamed row still matches the one before it. */
  key: string;
  name: string;
  section: JobSheetSection;
  kind: JobSheetLineKind;
  mixSource: JobSheetMixSource;
  /** This line's share of the drum it draws from. */
  mixSharePercent: number;
  /**
   * The catalogue row to price it from, by name.
   *
   * A name rather than an id, matching how the rest of the costing names its
   * defaults — the catalogue is the works' own list and its ids mean nothing to
   * anyone. Empty where the works has no single row for it and the office picks.
   */
  materialName: string;
}

/**
 * The printing mix: 40% pigment, 40% ethyl acetate, 20% toluene.
 * The lamination mix: 40% adhesive, 5% hardener, 60% ethyl acetate.
 *
 * The first comes to 100% and the second to 105%. Both are the works' own
 * figures and both are left exactly as they are — see the costing module.
 */
export const JOB_SHEET_LINES: readonly JobSheetLineTemplate[] = [
  {
    key: 'pet',
    name: '12 PET Polyester',
    section: 'PRINTING',
    kind: 'FILM',
    mixSource: 'NONE',
    mixSharePercent: 0,
    materialName: 'PET 12µm',
  },
  {
    key: 'ethyl_print',
    name: 'Ethyl Acetate',
    section: 'PRINTING',
    kind: 'SOLVENT',
    mixSource: 'PRINT_POOL',
    mixSharePercent: 40,
    materialName: 'Solvent — Ethyl Acetate',
  },
  {
    key: 'toluene',
    name: 'Toluene',
    section: 'PRINTING',
    kind: 'SOLVENT',
    mixSource: 'PRINT_POOL',
    mixSharePercent: 20,
    materialName: 'Solvent — Toluene',
  },
  /*
   * Every one of these resolves to a catalogue row, MIBK and the eight spot
   * colours included — `seed:job-sheet-materials` adds them at the works' own
   * rates. A line that still finds nothing carries no rate and says so on the
   * screen rather than pricing at a figure nobody agreed.
   */
  {
    key: 'mibk',
    name: 'MIBK',
    section: 'PRINTING',
    kind: 'SOLVENT',
    mixSource: 'NONE',
    mixSharePercent: 0,
    materialName: 'Solvent — MIBK',
  },
  ...(
    [
      'Cyan',
      'Magenta',
      'Yellow',
      'Black',
      'White',
      'Red',
      'Medium',
      'Orange',
      'Dark Green',
      'Gold',
      'Pink',
      'Violet',
    ] as const
  ).map((colour): JobSheetLineTemplate => ({
    key: `ink_${colour.toLowerCase().replace(/\s+/g, '_')}`,
    name: colour,
    section: 'PRINTING',
    kind: 'INK',
    /* Its own drum: each colour is mixed separately and booked back separately. */
    mixSource: 'OWN',
    mixSharePercent: 40,
    materialName: `Ink — ${colour}`,
  })),
  {
    key: 'metpet',
    name: 'Met PET',
    section: 'LAMINATION',
    kind: 'FILM',
    mixSource: 'NONE',
    mixSharePercent: 0,
    materialName: 'MET PET 12µm',
  },
  {
    /**
     * The sealant ply, and the one row on this form that cannot name its own
     * material.
     *
     * The works' printed sheet has a single "LDPE Milky / Natural" line, which
     * was true when the rates master had a single LDPE. It now carries twelve
     * derived grades — natural, milky, high clarity, nitrogen flush, vacuum,
     * easy tear and the rest — and they are different films at different
     * prices. A fixed name here resolved to a RETIRED row, so the line arrived
     * with no material behind it: it priced at nothing and could not be taken
     * off stock, which on a three-ply job is a third of the film.
     *
     * So it names nothing, and the sheet binds the grade the job actually ran
     * — see `filmsForJob` in the job sheet service. Where that cannot be
     * worked out, the office picks it on the screen.
     */
    key: 'ldpe',
    name: 'LDPE',
    section: 'LAMINATION',
    kind: 'FILM',
    mixSource: 'NONE',
    mixSharePercent: 0,
    materialName: '',
  },
  {
    key: 'adhesive',
    name: 'Adhesive (NCO)',
    section: 'LAMINATION',
    kind: 'ADHESIVE',
    mixSource: 'LAM_POOL',
    mixSharePercent: 40,
    materialName: 'Adhesive — PU',
  },
  {
    key: 'hardener',
    name: 'Hardener (OH)',
    section: 'LAMINATION',
    kind: 'ADHESIVE',
    mixSource: 'LAM_POOL',
    mixSharePercent: 5,
    materialName: 'Adhesive — Hardener',
  },
  {
    key: 'ethyl_lam',
    name: 'Ethyl Acetate',
    section: 'LAMINATION',
    kind: 'SOLVENT',
    mixSource: 'LAM_POOL',
    mixSharePercent: 60,
    materialName: 'Solvent — Ethyl Acetate',
  },
];

export interface JobSheetCrewRole {
  role: string;
  headcount: number;
  ratePerDay: number;
}

/**
 * The crew, at the rates the works' September sheets pay.
 *
 * A starting point and nothing more: the March sheets in the same workbook pay
 * a printing operator Rs 1,461 and the September ones Rs 1,200, and the
 * headcount on the helpers moves between five and nine job to job. Every figure
 * is editable on the sheet, and the sheet keeps what was typed.
 */
export const JOB_SHEET_CREW: readonly JobSheetCrewRole[] = [
  { role: 'Office 1', headcount: 2, ratePerDay: 576 },
  { role: 'Office 2', headcount: 2, ratePerDay: 550 },
  { role: 'Operator 1', headcount: 1, ratePerDay: 1200 },
  { role: 'Printing operator 2', headcount: 1, ratePerDay: 1000 },
  { role: 'Slitting operator 3', headcount: 1, ratePerDay: 596 },
  { role: 'Pouch operator', headcount: 2, ratePerDay: 800 },
  { role: 'Helper — general', headcount: 9, ratePerDay: 540 },
  { role: 'Helper — lamination', headcount: 1, ratePerDay: 270 },
];

/**
 * **Each machine's share of a day on the meter, and how many shifts it runs.**
 *
 * The works' spreadsheet splits the day 60 / 20 / 20 / 10 / 10, which comes to
 * 120 — and the works has confirmed it should come to 100. These are shares of
 * one day's bill, so anything over 100 charges a job for electricity nobody
 * bought.
 *
 * The figures below are that same split rescaled, not a new one invented to fit.
 * Printing is still three times a lamination pass and six times slitting,
 * because which machine draws what is the works' knowledge and none of it is in
 * question — only the total was. Rescaling asserts nothing new; picking round
 * numbers would have quietly claimed one of the five was the mis-stated one.
 *
 * Pouching is the only stage that routinely runs two shifts, which is why the
 * works' sheets multiply it and nothing else. Shifts are deliberately outside
 * the 100: a second shift is a second day's running on that machine, and the
 * shares divide one day between machines rather than capping what a job can use.
 */
export const JOB_SHEET_STAGE_DEFAULTS: readonly {
  stage: JobSheetStage;
  sharePercent: number;
  shifts: number;
}[] = [
  { stage: 'PRINTING', sharePercent: 50, shifts: 1 },
  { stage: 'LAMINATION_1', sharePercent: 16.667, shifts: 1 },
  { stage: 'LAMINATION_2', sharePercent: 16.667, shifts: 1 },
  { stage: 'SLITTING', sharePercent: 8.333, shifts: 1 },
  { stage: 'POUCHING', sharePercent: 8.333, shifts: 2 },
];

/** What the shares must add up to: one day's bill, divided between machines. */
export const JOB_SHEET_STAGE_SHARE_TOTAL = 100;

/**
 * **What the final costing block calls each row.**
 *
 * Their workbook names the same material twice, differently. The stage blocks
 * say `Tolvin` and `Ethyle`, because that is what is written on the drum; the
 * costing block at the foot of the sheet says `Tolluene` and `Ethyle Acetate`,
 * because that is what the invoice says. `Hardner`, `METPET`, `Polysyter` and
 * `Mily` are theirs too, spelled as their sheet spells them.
 *
 * The spellings are kept rather than corrected, and kept *per block* rather
 * than globally, for one reason: the office cross-checks the screen against the
 * paper line by line, and a row that reads differently in the two places is a
 * row somebody has to stop and think about. The stored name is untouched — this
 * is what the costing screen prints above it.
 *
 * Keyed by the row's template key. The twelve colours are deliberately absent:
 * their sheet writes `=A15` there, so a colour's costing name IS its row name.
 */
export const JOB_SHEET_COSTING_NAMES: Readonly<Record<string, string>> = {
  pet: '12 PET Polysyter',
  ethyl_print: 'Ethyle Acetate',
  toluene: 'Tolluene',
  mibk: 'MIBK',
  metpet: 'METPET',
  ldpe: 'LDPE Mily/Natural',
  adhesive: 'Adhesive',
  hardener: 'Hardner',
  ethyl_lam: 'Ethyle Acetate',
};

/**
 * The costing block's name for the row at this position, or the row's own.
 *
 * Positions are one-based and follow `JOB_SHEET_LINES`, which is how the rest
 * of the sheet addresses its rows. A position off the end of the form — an
 * imported sheet with a row the template does not have — falls back to the
 * stored name rather than inventing one.
 */
export function costingNameAt(position: number, storedName: string): string {
  const template = JOB_SHEET_LINES[position - 1];
  if (!template) return storedName;
  return JOB_SHEET_COSTING_NAMES[template.key] ?? storedName;
}
