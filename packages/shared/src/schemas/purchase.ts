import { z } from 'zod';
import { partialWithoutDefaults } from './partial-update.js';
import { paginationQuerySchema } from './common.js';
import { CHOOSABLE_STATUSES, PURCHASE_ORDER_STATUSES } from '../lib/purchase.js';

const isoDate = (label: string) =>
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `Enter the ${label} as yyyy-mm-dd`);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .default('')
    .transform((value) => (value.toUpperCase() === 'NA' ? '' : value));

export const supplierSchema = z.object({
  name: z.string().trim().min(2, 'Enter the supplier’s name').max(160),
  contactPerson: optionalText(120),
  mobile: optionalText(40),
  email: optionalText(160),
  address: optionalText(300),
  /** GSTIN. Upper-cased, because it is printed and read back over the phone. */
  gstNumber: z.string().trim().toUpperCase().max(20).default(''),
  notes: optionalText(500),
  isActive: z.boolean().default(true),
});

export const updateSupplierSchema = partialWithoutDefaults(supplierSchema);

export const listSuppliersQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(200).optional(),
  includeInactive: z
    .union([z.boolean(), z.literal('true'), z.literal('false')])
    .transform((value) => value === true || value === 'true')
    .optional(),
});

/** One material on an order. */
export const purchaseOrderLineSchema = z.object({
  materialId: z.string().min(1, 'Choose a material'),
  quantity: z.coerce
    .number({ message: 'Quantity is required' })
    .positive('Quantity must be more than 0')
    .max(1_000_000, 'That quantity looks wrong — check it'),
  /**
   * The unit it is ordered in, which is the unit deliveries are entered in.
   *
   * Blank means the material's own. Converted to the stocked unit only when the
   * stock is actually created, so the order reads the way the supplier
   * invoices it.
   */
  unit: z.string().trim().max(10).default(''),
  ratePerUnit: z.coerce
    .number({ message: 'Rate is required' })
    .positive('Rate must be more than 0')
    .max(10_000_000, 'That rate looks wrong — check it'),
});

export const createPurchaseOrderSchema = z.object({
  supplierId: z.string().min(1, 'Choose a supplier'),
  orderedOn: isoDate('order date'),
  /** Null when the supplier would not promise one. Such an order is never late. */
  expectedOn: z
    .union([z.literal(''), z.null(), z.undefined()])
    .transform(() => null)
    .or(isoDate('expected date'))
    .nullable()
    .default(null),
  notes: optionalText(1000),
  lines: z
    .array(purchaseOrderLineSchema)
    .min(1, 'An order needs at least one material')
    .max(20, 'Twenty lines is the most one order can carry')
    /*
     * The same material twice on one order is almost always a mistake, and if
     * it is not, two lines that receive independently against one material make
     * "how much of this is still coming" unanswerable.
     */
    .refine(
      (lines) => new Set(lines.map((line) => line.materialId)).size === lines.length,
      'The same material appears twice — put the whole quantity on one line',
    ),
});

export const updatePurchaseOrderSchema = z.object({
  expectedOn: z
    .union([z.literal(''), z.null(), z.undefined()])
    .transform(() => null)
    .or(isoDate('expected date'))
    .nullable()
    .optional(),
  notes: optionalText(1000).optional(),
  /**
   * Only the three the office decides.
   *
   * Part received and received are facts about what has arrived, set by
   * recording a delivery — offering them here would let an order be marked
   * received with nothing in stock against it.
   */
  status: z.enum(CHOOSABLE_STATUSES).optional(),
});

/**
 * A delivery against one line.
 *
 * Accepted stock opens a batch; rejected stock is recorded and never reaches
 * inventory. Faulty goods are not stock, and counting them would overstate what
 * the works can actually print with.
 */
export const receivePurchaseLineSchema = z
  .object({
    lineId: z.string().min(1, 'Choose which line arrived'),
    receivedOn: isoDate('delivery date'),
    acceptedQuantity: z.coerce
      .number({ message: 'Enter what was accepted' })
      .min(0, 'Cannot be negative')
      .max(1_000_000, 'That figure looks wrong — check it'),
    rejectedQuantity: z.coerce
      .number({ message: 'Enter what was rejected' })
      .min(0, 'Cannot be negative')
      .max(1_000_000, 'That figure looks wrong — check it')
      .default(0),
    rejectionReason: optionalText(500),
    /** Needed only when something was accepted — rejected goods open no batch. */
    batchCode: z.string().trim().max(60).default(''),
    location: z.string().trim().max(80).default(''),
    notes: optionalText(500),
  })
  .refine((value) => value.acceptedQuantity > 0 || value.rejectedQuantity > 0, {
    message: 'Enter what arrived — accepted, rejected, or both',
    path: ['acceptedQuantity'],
  })
  /*
   * A rejection nobody explained is one nobody can take up with the supplier,
   * and it is the record that matters months later when the same thing happens
   * again.
   */
  .refine((value) => value.rejectedQuantity === 0 || value.rejectionReason.length >= 3, {
    message: 'Say briefly what was wrong with it',
    path: ['rejectionReason'],
  })
  .refine((value) => value.acceptedQuantity === 0 || value.batchCode.trim().length > 0, {
    message: 'Enter the batch or lot number from the delivery note',
    path: ['batchCode'],
  });

/** Give up on the balance of a line, with a reason. */
export const closePurchaseLineSchema = z.object({
  lineId: z.string().min(1),
  reason: z.string().trim().min(3, 'Say briefly why the rest is not coming').max(500),
});

export const listPurchaseOrdersQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(200).optional(),
  status: z.enum(PURCHASE_ORDER_STATUSES).optional(),
  supplierId: z.string().min(1).optional(),
  /** Only what is late, which is the reason anybody opens this screen twice. */
  delayedOnly: z
    .union([z.boolean(), z.literal('true'), z.literal('false')])
    .transform((value) => value === true || value === 'true')
    .optional(),
});

export type SupplierInput = z.infer<typeof supplierSchema>;
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
export type ListSuppliersQuery = z.infer<typeof listSuppliersQuerySchema>;
export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;
export type UpdatePurchaseOrderInput = z.infer<typeof updatePurchaseOrderSchema>;
export type ReceivePurchaseLineInput = z.infer<typeof receivePurchaseLineSchema>;
export type ClosePurchaseLineInput = z.infer<typeof closePurchaseLineSchema>;
export type ListPurchaseOrdersQuery = z.infer<typeof listPurchaseOrdersQuerySchema>;
