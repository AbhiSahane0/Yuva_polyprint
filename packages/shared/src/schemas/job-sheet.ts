import { z } from 'zod';
import { JOB_SHEET_STAGES } from '../lib/job-sheet-costing.js';
import { partialWithoutDefaults } from './partial-update.js';
import { isoDateSchema } from './common.js';

/**
 * What the app will accept onto a job sheet.
 *
 * Weights are allowed to be **negative**, which is the one rule here worth
 * explaining. A drum that comes back fuller than it went out is a real event —
 * a colour topped up from an earlier job's leftovers — and the works' own
 * sheets carry several. Rejecting it would force the person at the machine to
 * type something they know is untrue.
 *
 * Nothing else is. A rate below zero, a headcount below zero and a share
 * outside 0–100 are all typing mistakes, and each one would quietly move a cost
 * per kilogram that somebody is about to quote from.
 */

/** Issued, returned and mixed weights: signed, because stock genuinely moves both ways. */
const weight = z.coerce.number().min(-100_000).max(1_000_000);
/** A rate or an amount: never negative. */
const money = z.coerce.number().min(0).max(100_000_000);
const percent = z.coerce.number().min(0).max(100);
const days = z.coerce.number().min(0).max(366);

export const jobSheetLineSchema = z.object({
  position: z.coerce.number().int().min(1),
  section: z.enum(['PRINTING', 'LAMINATION']),
  kind: z.enum(['FILM', 'SOLVENT', 'INK', 'ADHESIVE', 'OTHER']),
  materialId: z.string().trim().min(1).nullable().default(null),
  name: z.string().trim().min(1).max(120),

  issuedKg: weight.default(0),
  returnedKg: weight.default(0),

  mixIssuedKg: weight.default(0),
  mixReturnedKg: weight.default(0),
  mixSharePercent: percent.default(0),

  /** Null unless the office replaced the computed figure. */
  consumedOverrideKg: weight.nullable().default(null),
  ratePerKg: money.default(0),
});

export const jobSheetLabourSchema = z.object({
  position: z.coerce.number().int().min(1),
  role: z.string().trim().min(1).max(80),
  headcount: z.coerce.number().min(0).max(500).default(0),
  ratePerDay: money.default(0),
  days: days.default(0),
});

export const jobSheetStageSchema = z.object({
  stage: z.enum(JOB_SHEET_STAGES),
  sharePercent: percent.default(0),
  days: days.default(0),
  shifts: z.coerce.number().min(0).max(4).default(1),
});

export const jobSheetSchema = z.object({
  date: isoDateSchema('date'),
  status: z.enum(['OPEN', 'COSTED', 'CLOSED']).default('OPEN'),

  jobId: z.string().trim().min(1).nullable().default(null),
  jobName: z.string().trim().max(200).default(''),
  customerId: z.string().trim().min(1).nullable().default(null),

  /**
   * The job card this sheet costs. Null unlinks it.
   *
   * Refused by the server when another sheet already has that card: one run,
   * one costing, and two sheets claiming to be what a run cost is a question
   * nothing can answer.
   */
  productionOrderId: z.string().trim().min(1).nullable().default(null),

  // ---- The job card ------------------------------------------------------
  workOrderNo: z.string().trim().max(60).default(''),
  poDate: isoDateSchema('PO date').nullable().default(null),
  dispatchDate: isoDateSchema('despatch date').nullable().default(null),
  transport: z.string().trim().max(120).default(''),
  quantityKg: weight.default(0),
  jobReceivedBy: z.string().trim().max(120).default(''),
  printingNote: z.string().trim().max(120).default(''),
  printSpeedMPerMin: z.coerce.number().min(0).max(1_000).default(0),
  printMetersOverride: z.coerce.number().min(0).max(1_000_000).nullable().default(null),
  metPetCoatingGsm: z.coerce.number().min(0).max(50).default(0),
  polyCoatingGsm: z.coerce.number().min(0).max(50).default(0),
  pouchingSpeedPerMin: z.coerce.number().min(0).max(100_000).default(0),
  otherSettingMinutes: z.coerce.number().min(0).max(1_440).default(0),
  singleRollWeight: z.string().trim().max(60).default(''),
  pouchSorting: z.string().trim().max(120).default(''),
  specialInstructions: z.string().trim().max(1_000).default(''),
  preparedBy: z.string().trim().max(120).default(''),
  approvedBy: z.string().trim().max(120).default(''),

  operatorName: z.string().trim().max(120).default(''),

  filmType: z.string().trim().max(80).default(''),
  webWidthMm: z.coerce.number().min(0).max(5000).nullable().default(null),
  micron: z.coerce.number().min(0).max(1000).nullable().default(null),
  circumferenceMm: z.coerce.number().min(0).max(5000).nullable().default(null),
  cylinderCount: z.coerce.number().int().min(0).max(24).default(0),

  printMixIssuedKg: weight.default(0),
  printMixReturnedKg: weight.default(0),
  lamMixIssuedKg: weight.default(0),
  lamMixReturnedKg: weight.default(0),

  makeReadyDays: days.default(0),
  productionDays: days.default(0),

  printedGrossKg: weight.default(0),
  printedCoreKg: weight.default(0),
  producedGrossKg: weight.default(0),
  producedCoreKg: weight.default(0),
  finalOutputKg: weight.default(0),
  pouchingWeightKg: weight.default(0),

  electricityPerDay: money.default(0),
  transportPerKg: money.default(0),
  pouchingPerKg: money.default(0),
  packagingCost: money.default(0),
  emiPerDay: money.default(0),
  profitPercent: percent.default(0),
  expectedWastagePercent: percent.default(5),

  electricityOverride: money.nullable().default(null),
  salaryOverride: money.nullable().default(null),
  transportOverride: money.nullable().default(null),
  pouchingOverride: money.nullable().default(null),
  emiOverride: money.nullable().default(null),
  profitOverride: money.nullable().default(null),

  notes: z.string().trim().max(2000).default(''),

  lines: z.array(jobSheetLineSchema).max(60).default([]),
  labour: z.array(jobSheetLabourSchema).max(40).default([]),
  stages: z.array(jobSheetStageSchema).max(10).default([]),
});

export type JobSheetInput = z.infer<typeof jobSheetSchema>;
export type JobSheetFormValues = z.input<typeof jobSheetSchema>;

/*
 * `partialWithoutDefaults`, never `.partial()`. Zod's own partial leaves every
 * `.default()` in place and a default fires exactly when the key is absent — so
 * a PATCH carrying one field would arrive at Prisma carrying all of them, and
 * quietly reset the whole sheet to zero. See `partial-update.ts`.
 */
export const updateJobSheetSchema = partialWithoutDefaults(jobSheetSchema);

/** The list screen's filters. */
export const jobSheetQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(120).default(''),
  status: z.enum(['OPEN', 'COSTED', 'CLOSED']).optional(),
  from: isoDateSchema('from date').optional(),
  to: isoDateSchema('to date').optional(),
});
