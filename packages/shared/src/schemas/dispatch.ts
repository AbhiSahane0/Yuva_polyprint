import { z } from 'zod';
import { isoDateSchema, paginationQuerySchema } from './common.js';
import { partialWithoutDefaults } from './partial-update.js';
import { DISPATCH_STATUSES } from '../lib/dispatch.js';

const isoDate = isoDateSchema;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .default('')
    .transform((value) => (value.toUpperCase() === 'NA' ? '' : value));

/**
 * One reel, carton or bag.
 *
 * A weight is the only thing insisted on: the reel number is often written on
 * the reel and nowhere else, and refusing the row for want of it would push the
 * office back to a single typed total — which is the thing this replaces.
 */
export const dispatchPackageSchema = z.object({
  reelNumber: z.string().trim().max(60).default(''),
  netKg: z.coerce
    .number({ message: 'Enter the weight of this reel' })
    .positive('A reel weighs more than 0')
    .max(100_000, 'That weight looks wrong — check it'),
  grossKg: z.coerce.number().min(0).max(100_000).nullable().default(null),
  widthMm: z.coerce.number().min(0).max(10_000).nullable().default(null),
});

/** One order being delivered on this note. */
export const dispatchLineSchema = z
  .object({
    orderId: z.string().min(1, 'Choose which order this is against'),
    /** Which run it came out of, where the godown knows. */
    productionOrderId: z.string().min(1).nullable().default(null),
    /**
     * Ignored where the line lists its reels — the packages are the total then,
     * and see `lineNetKg` for why there is only ever one figure.
     */
    quantityKg: z.coerce
      .number({ message: 'Enter what is going' })
      .min(0, 'Cannot be negative')
      .max(1_000_000, 'That weight looks wrong — check it')
      .default(0),
    quantityPouches: z.coerce
      .number()
      .int('A part pouch is not a pouch')
      .min(0, 'Cannot be negative')
      .max(100_000_000, 'That count looks wrong — check it')
      .default(0),
    remarks: optionalText(500),
    packages: z
      .array(dispatchPackageSchema)
      .max(200, 'Two hundred reels is the most one line can carry')
      .default([]),
  })
  /*
   * A line that delivers nothing is a line somebody started and abandoned. It
   * would post, settle nothing, and leave a challan with a row on it that the
   * customer cannot make sense of.
   */
  .refine(
    (line) => line.packages.length > 0 || line.quantityKg > 0 || line.quantityPouches > 0,
    'Enter what is going on this line — the reels, a weight, or a pouch count',
  );

export const createDispatchSchema = z.object({
  /**
   * One note, one customer. A lorry that drops at two customers is two
   * deliveries and two challans, because each customer signs for their own.
   */
  customerId: z.string().min(1).nullable().default(null),
  customerName: z.string().trim().min(2, 'Enter who it is going to').max(160),
  dispatchDate: isoDate('dispatch date'),
  /** Snapshotted, because a customer's address can change and a challan cannot. */
  deliveryAddress: optionalText(400),

  /* The lorry. None of it is insisted on at draft — the vehicle often turns up
     after the note is written, and posting is where it is asked for. */
  vehicleNumber: z.string().trim().toUpperCase().max(24).default(''),
  transporter: optionalText(160),
  driverName: optionalText(120),
  driverPhone: optionalText(40),
  /** The transporter's own consignment note. */
  lrNumber: optionalText(60),

  notes: optionalText(1000),
  lines: z
    .array(dispatchLineSchema)
    .min(1, 'A dispatch note needs at least one order on it')
    .max(30, 'Thirty orders is the most one lorry can carry')
    /*
     * The same order twice on one note makes "how much of this has gone"
     * ambiguous on the one screen that exists to answer it. One line, and the
     * reels go under it.
     */
    .refine(
      (lines) => new Set(lines.map((line) => line.orderId)).size === lines.length,
      'The same order appears twice — put all of it on one line',
    ),
});

/**
 * Corrections to a note nobody has sent yet.
 *
 * `partialWithoutDefaults` rather than `.partial()`, and the difference is not
 * cosmetic: zod's defaults fire when a key is *absent*, so a patch carrying only
 * the notes would have arrived at the service with `vehicleNumber: ''` and
 * `customerId: null` alongside it — blanking the lorry and orphaning the
 * customer on a note somebody meant only to annotate.
 */
export const updateDispatchSchema = partialWithoutDefaults(createDispatchSchema);

/**
 * Send it.
 *
 * The vehicle number is asked for here and not before: a challan with no lorry
 * on it is not a delivery note, it is a list. `overrideReason` is only looked at
 * when the note sends more than the works has made — see the service.
 */
export const postDispatchSchema = z.object({
  vehicleNumber: z.string().trim().toUpperCase().min(4, 'Enter the lorry’s number').max(24),
  overrideReason: optionalText(500),
});

export const cancelDispatchSchema = z.object({
  reason: z.string().trim().min(3, 'Say briefly why it did not go').max(500),
});

export const listDispatchesQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(200).optional(),
  status: z.enum(DISPATCH_STATUSES).optional(),
  customerId: z.string().min(1).optional(),
  from: isoDate('from date').optional(),
  to: isoDate('to date').optional(),
});

export const readyToSendQuerySchema = z.object({
  customerId: z.string().min(1).optional(),
  q: z.string().trim().max(200).optional(),
});

export type DispatchPackageInput = z.infer<typeof dispatchPackageSchema>;
export type DispatchLineInput = z.infer<typeof dispatchLineSchema>;
export type CreateDispatchInput = z.infer<typeof createDispatchSchema>;
export type UpdateDispatchInput = z.infer<typeof updateDispatchSchema>;
export type PostDispatchInput = z.infer<typeof postDispatchSchema>;
export type CancelDispatchInput = z.infer<typeof cancelDispatchSchema>;
export type ListDispatchesQuery = z.infer<typeof listDispatchesQuerySchema>;
export type ReadyToSendQuery = z.infer<typeof readyToSendQuerySchema>;
