import { z } from 'zod';
import { paginationQuerySchema } from './common.js';

/**
 * Legacy rows carry the literal string 'NA' where the spreadsheet had no value,
 * so every optional field must accept it alongside a real value.
 */
export const NA = 'NA';

const isNA = (value: string) => value.trim().toUpperCase() === NA;

/** Trims, and turns an empty box in the UI back into 'NA'. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length === 0 ? NA : value));

const mobileField = optionalText(20).refine(
  (value) => isNA(value) || /^[6-9]\d{9}$/.test(value),
  'Enter a 10-digit mobile number starting 6-9, or leave it blank',
);

const pincodeField = optionalText(10).refine(
  (value) => isNA(value) || /^\d{6}$/.test(value),
  'Enter a 6-digit pincode, or leave it blank',
);

const emailField = optionalText(160).refine(
  (value) => isNA(value) || z.string().email().safeParse(value).success,
  'Enter a valid email address, or leave it blank',
);

/**
 * Alternate numbers are a free-text list in the legacy data — landlines,
 * second mobiles, STD-prefixed numbers — so this only guards the shape.
 */
const altPhoneField = optionalText(120).refine(
  (value) => isNA(value) || /^[\d\s,+()-]{5,}$/.test(value),
  'Use digits, spaces, commas, +, ( ) and - only',
);

export const customerSourceSchema = z.enum(['SHEET', 'BRAND_INFERRED']);
export type CustomerSource = z.infer<typeof customerSourceSchema>;

/** The two forms every job in the legacy sheet takes. */
export const JOB_TYPES = ['Pouch Form', 'Roll Form'] as const;

/**
 * A job captured alongside its customer. The client works customer-first —
 * they open a customer and enter that customer's jobs — so this is the small
 * identifying subset, not the full 40-column engineering spec.
 */
export const customerJobSchema = z.object({
  /** Present when editing a job that already exists. */
  id: z.string().min(1).optional(),
  jobCode: optionalText(40).default(NA),
  jobName: z.string().trim().min(1, 'Job name is required').max(200),
  jobType: z.enum(JOB_TYPES).or(z.literal(NA)).default(NA),
  pouchType: optionalText(80).default(NA),
});

export type CustomerJobInput = z.infer<typeof customerJobSchema>;
export type CustomerJobFormValues = z.input<typeof customerJobSchema>;

export const createCustomerSchema = z.object({
  companyName: z.string().trim().min(2, 'Company name is required').max(200),
  contactPerson: optionalText(120).default(NA),
  address: optionalText(400).default(NA),
  city: optionalText(80).default(NA),
  district: optionalText(80).default(NA),
  pincode: pincodeField.default(NA),
  mobile: mobileField.default(NA),
  altPhone: altPhoneField.default(NA),
  email: emailField.default(NA),
  isVerified: z.boolean().default(false),

  /**
   * Optional. When omitted the customer's jobs are left untouched; when
   * present the list is treated as the complete set for that customer.
   */
  jobs: z.array(customerJobSchema).max(200).optional(),
});

/** Every field is optional on update; only what is sent gets changed. */
export const updateCustomerSchema = createCustomerSchema.partial();

export const listCustomersQuerySchema = paginationQuerySchema.extend({
  /** Free-text search across company, contact, mobile, city, district. */
  q: z.string().trim().max(200).optional(),
  source: customerSourceSchema.optional(),
  isVerified: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((value) => (typeof value === 'boolean' ? value : value === 'true'))
    .optional(),
});

/**
 * Values the form holds BEFORE zod applies its defaults — fields with a
 * `.default()` are optional here. react-hook-form needs this as its
 * TFieldValues, with `CreateCustomerInput` as the transformed output.
 */
export type CreateCustomerFormValues = z.input<typeof createCustomerSchema>;

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;
