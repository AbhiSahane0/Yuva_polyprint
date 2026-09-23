import { z } from 'zod';
import { partialWithoutDefaults } from './partial-update.js';
import { MACHINE_KINDS } from '../lib/rate-costing.js';
import { PRODUCTION_STATUSES, STAGE_STATUSES } from '../constants/production.js';

/**
 * Raising a job card.
 *
 * Only the order and how much of it this card is making. **Everything else is
 * derived** — the customer, the design and the stages all come from the order
 * and the structure behind it, and asking for them again would be asking
 * somebody to retype what is already on the screen, with a chance of disagreeing
 * with it.
 */
export const createProductionOrderSchema = z.object({
  orderId: z.string().min(1, 'Which order is this making?'),
  /** Blank means the whole order, which is the ordinary case. */
  quantityKg: z.coerce.number().min(0).max(10_000_000).optional(),
  notes: z.string().trim().max(2000).default(''),
});

export type CreateProductionOrderInput = z.infer<typeof createProductionOrderSchema>;

export const updateProductionOrderSchema = z.object({
  status: z.enum(PRODUCTION_STATUSES).optional(),
  quantityKg: z.coerce.number().min(0).max(10_000_000).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export type UpdateProductionOrderInput = z.infer<typeof updateProductionOrderSchema>;

/**
 * Recording what a stage did.
 *
 * Both weights, never the waste: a third figure that can disagree with the two
 * it is computed from is a figure nobody can trust.
 */
export const updateProductionStageSchema = z.object({
  status: z.enum(STAGE_STATUSES).optional(),
  machineId: z.string().min(1).nullable().optional(),
  operator: z.string().trim().max(120).optional(),
  inputKg: z.coerce.number().min(0).max(10_000_000).optional(),
  outputKg: z.coerce.number().min(0).max(10_000_000).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export type UpdateProductionStageInput = z.infer<typeof updateProductionStageSchema>;

/** Adding a stage back that the derivation left out, or the office ticked off. */
export const addProductionStageSchema = z.object({
  stage: z.enum(MACHINE_KINDS),
});

export type AddProductionStageInput = z.infer<typeof addProductionStageSchema>;

/**
 * Letting a card run on film the works has not got.
 *
 * The reason is required and not a tick box, because the tick box is what this
 * is for: a stop nobody can explain gets worked around, and a stop that costs
 * one sentence gets explained. Blank clears it and puts the block back.
 */
export const overrideMaterialsSchema = z.object({
  reason: z.string().trim().max(500).default(''),
});

export type OverrideMaterialsInput = z.infer<typeof overrideMaterialsSchema>;

export const listProductionQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  status: z.enum(PRODUCTION_STATUSES).optional(),
  /** What is on a given machine's list right now. */
  stage: z.enum(MACHINE_KINDS).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});

export type ListProductionQuery = z.infer<typeof listProductionQuerySchema>;

/* Exported for the partial-update guard, which checks every update schema in
   the package uses `partialWithoutDefaults` rather than `.partial()`. */
export const updateProductionNotesSchema = partialWithoutDefaults(
  z.object({ notes: z.string().trim().max(2000).default('') }),
);
