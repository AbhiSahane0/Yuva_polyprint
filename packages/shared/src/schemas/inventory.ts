import { z } from 'zod';
import { paginationQuerySchema } from './common.js';
import { materialCategorySchema } from './material.js';
import { STOCK_MOVEMENT_KINDS } from '../lib/inventory.js';

/**
 * What the office may record against stock.
 *
 * Four actions, deliberately separate rather than one "movement" form with a
 * type dropdown: receiving asks for a batch and a rate, issuing asks which job
 * it is for, a count asks for the figure that was counted, and a transfer asks
 * where to. A single form carrying every field would ask most of them at the
 * wrong moment.
 */

const quantity = (label: string) =>
  z.coerce
    .number({ message: `${label} is required` })
    .positive(`${label} must be more than 0`)
    .max(1_000_000, `${label} looks wrong — check the figure`);

/** Trimmed, and 'NA' means nothing, matching the importer's placeholder. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .default('')
    .transform((value) => (value.toUpperCase() === 'NA' ? '' : value));

export const receiveStockSchema = z.object({
  materialId: z.string().min(1, 'Choose a material'),
  /**
   * The supplier's lot number, or one the office invents.
   *
   * Required, because a batch nobody can name cannot be matched to a delivery
   * note when the count comes up short. Unique per material, which the server
   * enforces — two deliveries with one code would be indistinguishable.
   */
  batchCode: z.string().trim().min(1, 'Enter a batch or lot number').max(60),
  quantity: quantity('Quantity'),
  /** Free text. The works has one building; a location table nobody maintains
   * is worse than a field somebody types. */
  location: z
    .string()
    .trim()
    .max(80)
    .default('')
    .transform((value) => value || 'NA'),
  receivedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter the date as yyyy-mm-dd'),
  /** What was actually paid. Optional — the catalogue rate stands in. */
  ratePerUnit: z
    .union([z.literal(''), z.null(), z.undefined()])
    .transform(() => null)
    .or(z.coerce.number().positive('Rate must be more than 0'))
    .nullable()
    .default(null),
  reference: optionalText(120),
  notes: optionalText(500),
});

export const issueStockSchema = z.object({
  batchId: z.string().min(1, 'Choose which batch it came from'),
  quantity: quantity('Quantity'),
  /** Issued or scrapped. The two answer different questions and are counted
   * separately: one is what a job consumed, the other what the works lost. */
  kind: z.enum(['ISSUE', 'WASTE']).default('ISSUE'),
  /** Which design it went to. Optional — not every issue has one yet. */
  jobId: z.string().min(1).nullable().default(null),
  reference: optionalText(120),
  notes: optionalText(500),
});

export const adjustStockSchema = z.object({
  batchId: z.string().min(1, 'Choose which batch was counted'),
  /**
   * What was physically counted, not the difference.
   *
   * The office counts a shelf and types what is on it; the server works out the
   * correction. Asking for the difference means doing the subtraction by hand
   * and getting the sign right, which is exactly the arithmetic a cycle count
   * exists to check.
   */
  countedQuantity: z.coerce
    .number({ message: 'Enter what was counted' })
    .min(0, 'A count cannot be negative')
    .max(1_000_000, 'That figure looks wrong — check it'),
  /** Required: an unexplained correction is the one nobody can learn from. */
  notes: z.string().trim().min(3, 'Say briefly what the count found').max(500),
  reference: optionalText(120),
});

export const transferStockSchema = z.object({
  batchId: z.string().min(1, 'Choose which batch is moving'),
  toLocation: z.string().trim().min(1, 'Where is it going?').max(80),
  notes: optionalText(500),
});

export const listStockQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(200).optional(),
  category: materialCategorySchema.optional(),
  /** Only what needs reordering — the reason anybody opens this screen twice. */
  lowOnly: z
    .union([z.boolean(), z.literal('true'), z.literal('false')])
    .transform((value) => value === true || value === 'true')
    .optional(),
});

/** Set or clear the level below which a material reads as low. */
export const setReorderLevelSchema = z.object({
  reorderLevel: z
    .union([z.literal(''), z.null(), z.undefined()])
    .transform(() => null)
    .or(z.coerce.number().min(0, 'A level cannot be negative').max(1_000_000))
    .nullable()
    .default(null),
});

export const stockMovementKindSchema = z.enum(STOCK_MOVEMENT_KINDS);

export type ReceiveStockInput = z.infer<typeof receiveStockSchema>;
export type IssueStockInput = z.infer<typeof issueStockSchema>;
export type AdjustStockInput = z.infer<typeof adjustStockSchema>;
export type TransferStockInput = z.infer<typeof transferStockSchema>;
export type ListStockQuery = z.infer<typeof listStockQuerySchema>;
export type SetReorderLevelInput = z.infer<typeof setReorderLevelSchema>;
