import { z } from 'zod';
import { isoDateSchema, paginationQuerySchema } from './common.js';
import { partialWithoutDefaults } from './partial-update.js';

/**
 * **What the app will accept onto a job card.**
 *
 * A card is a work instruction, written before the run: the office raises it
 * when the order is in hand, the setter fills in what he is going to do, and
 * three people sign the printed sheet. Everything else on the card — the
 * structure, the weights, the metreage, the times — is worked out from the
 * design master and the works' own figures by `computeJobCard`, and is never
 * accepted from the client.
 *
 * It is **not** a job sheet. A job sheet is written after a stage finishes and
 * says what that stage drew from the shelf and what came back. The two were
 * briefly one record and the boxes below are the half that did not belong
 * there.
 */
export const jobCardSchema = z.object({
  date: isoDateSchema('date'),

  /** The order this card is making. Null on a card raised off its own bat. */
  orderId: z.string().trim().min(1).nullable().default(null),
  /** The design every worked-out figure comes from. */
  jobId: z.string().trim().min(1).nullable().default(null),
  customerId: z.string().trim().min(1).nullable().default(null),
  jobName: z.string().trim().max(200).default(''),

  // ---- The boxes somebody fills in ----------------------------------------
  workOrderNo: z.string().trim().max(60).default(''),
  poDate: isoDateSchema('PO date').nullable().default(null),
  dispatchDate: isoDateSchema('despatch date').nullable().default(null),
  transport: z.string().trim().max(120).default(''),
  quantityKg: z.coerce.number().min(0).max(1_000_000).default(0),
  jobReceivedBy: z.string().trim().max(120).default(''),
  printingNote: z.string().trim().max(120).default(''),
  printSpeedMPerMin: z.coerce.number().min(0).max(1_000).default(0),
  /** Null means the card shows what the PET ply works out to. */
  printMetersOverride: z.coerce.number().min(0).max(1_000_000).nullable().default(null),
  metPetCoatingGsm: z.coerce.number().min(0).max(50).default(0),
  polyCoatingGsm: z.coerce.number().min(0).max(50).default(0),
  pouchingSpeedPerMin: z.coerce.number().min(0).max(100_000).default(0),
  otherSettingMinutes: z.coerce.number().min(0).max(1_440).default(0),
  singleRollWeight: z.string().trim().max(60).default(''),
  pouchSorting: z.string().trim().max(120).default(''),
  specialInstructions: z.string().trim().max(1_000).default(''),

  preparedBy: z.string().trim().max(120).default(''),
  operatedBy: z.string().trim().max(120).default(''),
  approvedBy: z.string().trim().max(120).default(''),
});

/*
 * `partialWithoutDefaults`, never `.partial()`. Zod's own partial leaves every
 * `.default()` in place and a default fires exactly when the key is absent — so
 * a PATCH carrying one field would arrive at Prisma carrying all of them, and
 * quietly reset the whole card. See `partial-update.ts`.
 */
export const updateJobCardSchema = partialWithoutDefaults(jobCardSchema);

/** The list screen's filters. */
export const jobCardQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(120).default(''),
  from: isoDateSchema('from date').optional(),
  to: isoDateSchema('to date').optional(),
});

export type JobCardInput = z.infer<typeof jobCardSchema>;
export type JobCardFormValues = z.input<typeof jobCardSchema>;
export type UpdateJobCardInput = z.infer<typeof updateJobCardSchema>;
export type JobCardQuery = z.infer<typeof jobCardQuerySchema>;
