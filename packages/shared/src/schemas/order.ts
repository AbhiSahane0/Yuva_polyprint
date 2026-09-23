import { z } from 'zod';
import { partialWithoutDefaults } from './partial-update.js';
import { ORDER_STATUSES } from '../constants/order.js';

/**
 * What a customer has committed to.
 *
 * The gap this fills: a won quotation says what the price would be and a job
 * sheet says what the run cost once it was over. Neither records that somebody
 * asked for 500 kg by the fifth, against their own purchase order number.
 */
export const createOrderSchema = z.object({
  /** Null where the office typed a name that is not on the customer master. */
  customerId: z.string().min(1).nullable().default(null),
  customerName: z.string().trim().min(2, 'Enter the company name').max(200),

  /** The design. Null while it is a name and nothing more. */
  jobId: z.string().min(1).nullable().default(null),
  jobName: z.string().trim().min(1, 'Name what is being made').max(200),

  /**
   * Kilograms, and the rate agreed for them.
   *
   * Both units travel, as they do on a quotation line: an order taken as "a
   * lakh pouches at six-fifty" is keyed that way and reaches the arithmetic as
   * kilograms, which is what the works buys film in.
   */
  quantityKg: z.coerce.number().positive('An order of nothing is not an order').max(10_000_000),
  ratePerKg: z.coerce.number().min(0).max(1_000_000),
  quantityPouches: z.coerce.number().int().min(0).max(1_000_000_000).default(0),
  ratePerPouch: z.coerce.number().min(0).max(100_000).default(0),

  /** The customer's own reference — what they quote back on the phone. */
  customerPoNumber: z.string().trim().max(60).default(''),
  /** ISO date. Today unless the office says otherwise. */
  orderDate: z.string().min(1, 'An order needs a date'),
  /** ISO date, or blank while nobody has promised one. */
  dueDate: z
    .union([z.literal(''), z.null(), z.undefined()])
    .transform(() => null)
    .or(z.string().min(1))
    .nullable()
    .default(null),

  notes: z.string().trim().max(2000).default(''),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

/**
 * Everything above may be corrected, and the status moved, on one endpoint.
 *
 * `partialWithoutDefaults` rather than `.partial()`, so a field left out of a
 * PATCH is left alone instead of being reset to its default — the rule the
 * whole API follows and has a test for.
 */
export const updateOrderSchema = partialWithoutDefaults(createOrderSchema).extend({
  status: z.enum(ORDER_STATUSES).optional(),
  /** Only read when the status is moving to CANCELLED. */
  cancelledReason: z.string().trim().max(500).optional(),
});

export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;

/** The list screen's filters. */
export const listOrdersQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  status: z.enum(ORDER_STATUSES).optional(),
  customerId: z.string().min(1).optional(),
  /** Due on or after / on or before, for "what is late" and "what is this week". */
  dueFrom: z.string().min(1).optional(),
  dueTo: z.string().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});

export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;
