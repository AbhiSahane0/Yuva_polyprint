import { z } from 'zod';
import { JOB_KINDS, POUCH_TYPES } from '../constants/job.js';
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

export const quotationItemSchema = z
  .object({
    /** Present when editing a line that already exists. */
    id: z.string().min(1).optional(),
    /** Set when the line was prefilled from an existing job. */
    jobId: z.string().min(1).nullable().optional(),
    /** Which film this line is costed against; null leaves it uncosted. */
    filmMaterialId: z.string().min(1).nullable().optional(),

    jobName: z.string().trim().min(1, 'Job name is required').max(200),

    /** Roll or pouch, and for a pouch which style. */
    jobKind: z.enum(JOB_KINDS).default('POUCH'),
    pouchType: z.enum(POUCH_TYPES).nullable().default(null),
    pouchTypeNote: z.string().trim().max(120).default(''),

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
  })
  /*
   * A roll has no pouch style. Rather than reject the combination — which would
   * make switching Pouch to Roll an error the user has to clear — the style is
   * dropped, so the stored line always matches what the form is showing.
   */
  .transform((item) =>
    item.jobKind === 'ROLL' ? { ...item, pouchType: null, pouchTypeNote: '' } : item,
  )
  .refine((item) => item.jobKind !== 'POUCH' || item.pouchType !== null, {
    message: 'Choose the pouch type',
    path: ['pouchType'],
  })
  .refine((item) => item.pouchType !== 'OTHER' || item.pouchTypeNote.length > 0, {
    message: 'Describe the pouch type',
    path: ['pouchTypeNote'],
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
  /**
   * Set when the form was filled in as a new company rather than picked from
   * the list. The customer master gains the company as the quotation saves, so
   * the next enquiry finds it under "Existing company" instead of being retyped.
   */
  saveAsCustomer: z.boolean().default(false),
  customerName: z.string().trim().min(2, 'Customer name is required').max(200),
  addressLine1: z.string().trim().max(200).default(''),
  addressLine2: z.string().trim().max(200).default(''),
  addressLine3: z.string().trim().max(200).default(''),
  mobile: z.string().trim().max(40).default(''),
  /** GSTIN. Upper-cased, because it is printed and read back over the phone. */
  gstNumber: z.string().trim().toUpperCase().max(20).default(''),
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

  /**
   * Costing inputs. Ink and adhesive are laid down by weight rather than
   * thickness, so their GSM is a setting instead of something derived from a
   * micron figure. The three material names say which rate to cost each
   * component against; the film itself is chosen per quotation line.
   */
  inkGsm: z.coerce.number().min(0).max(50),
  adhesiveGsm: z.coerce.number().min(0).max(50),
  defaultPetMaterial: z.string().trim().max(80),
  /** The metallised ply of a 3-layer structure, costed on its own rate. */
  defaultMetpetMaterial: z.string().trim().max(80),
  defaultInkMaterial: z.string().trim().max(80),
  defaultAdhesiveMaterial: z.string().trim().max(80),
});

export type AppSettings = z.infer<typeof settingsSchema>;
export const updateSettingsSchema = settingsSchema.partial();

export const DEFAULT_SETTINGS: AppSettings = {
  quotationStartNumber: 119,
  cylinderRate: 2.5,
  gstPercent: 18,
  materialAdvancePercent: 70,
  cylinderAdvancePercent: 100,
  // Averages of what the imported jobs actually record.
  inkGsm: 1.8,
  adhesiveGsm: 2.5,
  defaultPetMaterial: 'PET 12µm',
  defaultMetpetMaterial: 'MET PET 12µm',
  defaultInkMaterial: 'Ink — Black',
  defaultAdhesiveMaterial: 'Adhesive — PU',
};

/*
 * Sending a quotation by email.
 *
 * Addresses are trimmed and lower-cased so the same person typed two ways does
 * not become two recipients, and duplicates are collapsed for the same reason.
 * The cap is a guard against a paste going wrong, not a business rule — a
 * quotation goes to a handful of people.
 */
const emailAddress = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Enter an email address')
  .email('That does not look like an email address');

const recipients = z
  .array(emailAddress)
  .max(20, 'That is more recipients than a quotation needs')
  .transform((values) => [...new Set(values)]);

export const sendQuotationSchema = z.object({
  to: recipients.refine((values) => values.length > 0, 'Add at least one recipient'),
  cc: recipients.default([]),
  subject: z.string().trim().min(1, 'Enter a subject').max(200),
  /** Free text above the standard body. Plain text — it is escaped, never HTML. */
  message: z.string().trim().max(4000).default(''),
});

export type SendQuotationInput = z.infer<typeof sendQuotationSchema>;

/*
 * Recording the customer's answer.
 *
 * A reason is required on a loss and refused on a win. "We lost it" teaches
 * nothing a year later; "price was 8% over the incumbent" is the whole reason
 * for asking. Three characters is not a quality bar — it only stops an empty
 * box being submitted by reflex.
 */
export const recordOutcomeSchema = z
  .object({
    outcome: z.enum(['WON', 'LOST']),
    lostReason: z.string().trim().max(500).default(''),
  })
  .refine((value) => value.outcome !== 'LOST' || value.lostReason.length >= 3, {
    message: 'Say briefly why it was turned down',
    path: ['lostReason'],
  })
  .transform((value) => (value.outcome === 'WON' ? { ...value, lostReason: '' } : value));

export type RecordOutcomeInput = z.infer<typeof recordOutcomeSchema>;
