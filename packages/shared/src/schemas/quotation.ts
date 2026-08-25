import { z } from 'zod';
import { paginationQuerySchema } from './common.js';

export const quotationStatusSchema = z.enum(['DRAFT', 'SENT', 'WON', 'LOST']);
export type QuotationStatus = z.infer<typeof quotationStatusSchema>;

export const QUOTATION_STATUS_LABELS: Record<QuotationStatus, string> = {
  DRAFT: 'Draft',
  SENT: 'Sent',
  WON: 'Won',
  LOST: 'Lost',
};

const positiveNumber = (label: string) =>
  z.coerce.number({ message: `${label} is required` }).positive(`${label} must be more than 0`);

const zeroOrMore = (label: string) =>
  z.coerce.number({ message: `${label} is required` }).min(0, `${label} cannot be negative`);

export const quotationItemSchema = z.object({
  /** Present when editing a line that already exists. */
  id: z.string().min(1).optional(),
  /** Set when the line was prefilled from an existing job. */
  jobId: z.string().min(1).nullable().optional(),

  jobName: z.string().trim().min(1, 'Job name is required').max(200),
  layer: z.coerce
    .number()
    .int()
    .refine((v) => v === 2 || v === 3, 'Choose 2 or 3 layers'),

  widthMm: positiveNumber('Width'),
  heightMm: positiveNumber('Height'),
  polyMicron: positiveNumber('Poly micron'),
  quantityKg: positiveNumber('Quantity'),
  ratePerKg: positiveNumber('Rate'),

  repeatWidth: positiveNumber('Repeat width'),
  repeatHeight: positiveNumber('Repeat height'),
  cylinderCount: z.coerce.number().int().min(0, 'Cannot be negative'),
  transportCost: zeroOrMore('Transport cost').default(0),
});

export const DEFAULT_TERMS = [
  'Cylinder charges are one-time and reusable for repeat orders (same design).',
  'Each job/design requires a separate cylinder.',
  'Quotation valid for 15 days.',
  '18% GST applicable on total value.',
  'Delivery within 20 working days after PO confirmation.',
  'Payment Terms: 100% advance for cylinders, 70% advance for material.',
];

export const createQuotationSchema = z.object({
  /** ISO date (yyyy-mm-dd) shown on the document. */
  date: z.string().min(1, 'Date is required'),

  customerId: z.string().min(1).nullable().optional(),
  customerName: z.string().trim().min(2, 'Customer name is required').max(200),
  addressLine1: z.string().trim().max(200).default(''),
  addressLine2: z.string().trim().max(200).default(''),
  addressLine3: z.string().trim().max(200).default(''),
  mobile: z.string().trim().max(40).default(''),
  email: z.string().trim().max(160).default(''),

  /** Rates may be overridden per quotation; omitted means "use the settings". */
  cylinderRate: z.coerce.number().positive().optional(),
  gstPercent: z.coerce.number().min(0).max(100).optional(),
  materialAdvancePercent: z.coerce.number().min(0).max(100).optional(),
  cylinderAdvancePercent: z.coerce.number().min(0).max(100).optional(),

  status: quotationStatusSchema.default('DRAFT'),
  terms: z.array(z.string().trim().max(400)).max(20).default(DEFAULT_TERMS),
  notes: z.string().trim().max(2000).default(''),

  items: z.array(quotationItemSchema).min(1, 'Add at least one job').max(20),
});

export const updateQuotationSchema = createQuotationSchema.partial();

export const listQuotationsQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(200).optional(),
  status: quotationStatusSchema.optional(),
});

export type QuotationItemInput = z.infer<typeof quotationItemSchema>;
export type QuotationItemFormValues = z.input<typeof quotationItemSchema>;
export type CreateQuotationInput = z.infer<typeof createQuotationSchema>;
export type CreateQuotationFormValues = z.input<typeof createQuotationSchema>;
export type UpdateQuotationInput = z.infer<typeof updateQuotationSchema>;
export type ListQuotationsQuery = z.infer<typeof listQuotationsQuerySchema>;

/** Editable system settings. */
export const settingsSchema = z.object({
  /**
   * Where the quotation series begins. The client's existing paper series is
   * already past 118, so numbering has to continue it rather than restart.
   */
  quotationStartNumber: z.coerce.number().int().min(1),
  cylinderRate: z.coerce.number().positive(),
  gstPercent: z.coerce.number().min(0).max(100),
  materialAdvancePercent: z.coerce.number().min(0).max(100),
  cylinderAdvancePercent: z.coerce.number().min(0).max(100),
});

export type AppSettings = z.infer<typeof settingsSchema>;
export const updateSettingsSchema = settingsSchema.partial();

export const DEFAULT_SETTINGS: AppSettings = {
  quotationStartNumber: 119,
  cylinderRate: 2.5,
  gstPercent: 18,
  materialAdvancePercent: 70,
  cylinderAdvancePercent: 100,
};
