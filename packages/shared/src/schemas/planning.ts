import { z } from 'zod';
import { PLANNING_STATUSES } from '../lib/planning.js';

const isoDate = (label: string) =>
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `Enter the ${label} as yyyy-mm-dd`);

/**
 * Booking an order onto a machine, on a day.
 *
 * Both halves are optional and independent, because the works does not always
 * know both at once: a job can be dated before anybody decides which press, and
 * a job can be given to a press before the day is settled. Clearing a plan is
 * sending both as null.
 */
export const planOrderSchema = z.object({
  plannedStart: z
    .union([z.literal(''), z.null()])
    .transform(() => null)
    .or(isoDate('planned start'))
    .nullable()
    .default(null),
  plannedMachineId: z
    .union([z.literal(''), z.null()])
    .transform(() => null)
    .or(z.string().min(1))
    .nullable()
    .default(null),
  planNote: z
    .string()
    .trim()
    .max(500)
    .default('')
    .transform((value) => (value.toUpperCase() === 'NA' ? '' : value)),
});

export const planningQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  status: z.enum(PLANNING_STATUSES).optional(),
  customerId: z.string().min(1).optional(),
  /** Only what cannot run, which is the reason anybody opens this twice a day. */
  blockedOnly: z
    .union([z.boolean(), z.literal('true'), z.literal('false')])
    .transform((value) => value === true || value === 'true')
    .optional(),
});

export type PlanOrderInput = z.infer<typeof planOrderSchema>;
export type PlanningQuery = z.infer<typeof planningQuerySchema>;
