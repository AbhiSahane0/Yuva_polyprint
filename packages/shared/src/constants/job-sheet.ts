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
    key: 'ldpe',
    name: 'LDPE Milky / Natural',
    section: 'LAMINATION',
    kind: 'FILM',
    mixSource: 'NONE',
    mixSharePercent: 0,
    materialName: 'LDPE Milky / Natural',
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
 * Each machine's share of a day on the meter, and how many shifts it runs.
 *
 * Pouching is the only one that routinely runs two shifts, which is why the
 * works' sheets multiply it and nothing else.
 */
export const JOB_SHEET_STAGE_DEFAULTS: readonly {
  stage: JobSheetStage;
  sharePercent: number;
  shifts: number;
}[] = [
  { stage: 'PRINTING', sharePercent: 60, shifts: 1 },
  { stage: 'LAMINATION_1', sharePercent: 20, shifts: 1 },
  { stage: 'LAMINATION_2', sharePercent: 20, shifts: 1 },
  { stage: 'SLITTING', sharePercent: 10, shifts: 1 },
  { stage: 'POUCHING', sharePercent: 10, shifts: 2 },
];
