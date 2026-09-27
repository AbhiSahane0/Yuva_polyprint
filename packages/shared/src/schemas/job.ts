import { z } from 'zod';
import { paginationQuerySchema } from './common.js';

export const listDesignsQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(200).optional(),
  /** The worklist — designs nobody could put a customer to. */
  needsCustomer: z
    .union([z.boolean(), z.literal('true'), z.literal('false')])
    .transform((value) => value === true || value === 'true')
    .optional(),
  /** Only the ones that have actually been priced. */
  quotedOnly: z
    .union([z.boolean(), z.literal('true'), z.literal('false')])
    .transform((value) => value === true || value === 'true')
    .optional(),
  customerId: z.string().min(1).optional(),
});

/**
 * Putting a customer to a design.
 *
 * The one thing the worklist exists to do. Once a design has a customer it
 * appears on that customer's page and is edited there like any other — this
 * is only the way in for the ones that arrived off the old sheets with
 * nobody's name on them.
 */
export const assignDesignCustomerSchema = z.object({
  customerId: z.string().min(1, 'Choose the customer this design belongs to'),
});

export type ListDesignsQuery = z.infer<typeof listDesignsQuerySchema>;
export type AssignDesignCustomerInput = z.infer<typeof assignDesignCustomerSchema>;
