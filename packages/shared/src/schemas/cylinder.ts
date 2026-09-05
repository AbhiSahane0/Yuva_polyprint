import { z } from 'zod';
import { paginationQuerySchema } from './common.js';
import { CYLINDER_EVENT_KINDS, CYLINDER_OWNERSHIPS, CYLINDER_STATUSES } from '../lib/cylinders.js';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .default('')
    .transform((value) => (value.toUpperCase() === 'NA' ? '' : value));

const isoDate = (label: string) =>
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `Enter the ${label} as yyyy-mm-dd`);

const optionalDate = (label: string) =>
  z
    .union([z.literal(''), z.null(), z.undefined()])
    .transform(() => null)
    .or(isoDate(label))
    .nullable()
    .default(null);

const optionalNumber = (label: string, max = 10_000_000) =>
  z
    .union([z.literal(''), z.null(), z.undefined()])
    .transform(() => null)
    .or(
      z.coerce
        .number()
        .positive(`${label} must be more than 0`)
        .max(max, `That ${label.toLowerCase()} looks wrong — check it`),
    )
    .nullable()
    .default(null);

/** One cylinder, as the office describes it. */
export const cylinderInputSchema = z.object({
  /**
   * The number painted on it. Unique across the works.
   *
   * Required, because a cylinder nobody can name is one nobody can find, and
   * finding it is the entire point of the register.
   */
  code: z.string().trim().min(1, 'Enter the cylinder number').max(40),
  colour: optionalText(40),
  position: z
    .union([z.literal(''), z.null(), z.undefined()])
    .transform(() => null)
    .or(z.coerce.number().int().min(1).max(12))
    .nullable()
    .default(null),
  ownership: z.enum(CYLINDER_OWNERSHIPS).default('YUVA_OWNED'),
  location: z
    .string()
    .trim()
    .max(80)
    .default('')
    .transform((value) => value || 'NA'),
  diameterMm: optionalNumber('Diameter', 5000),
  circumferenceMm: optionalNumber('Circumference', 5000),
  cost: optionalNumber('Cost'),
  engraver: optionalText(120),
  engravedOn: optionalDate('engraving date'),
  notes: optionalText(500),
});

/**
 * Registering a set against a design.
 *
 * A design is a job, so this points at one rather than carrying a customer and
 * a product of its own — those already live on the job, and a second copy would
 * be free to disagree with the first.
 */
export const registerCylindersSchema = z.object({
  jobId: z.string().min(1, 'Choose the design these belong to'),
  cylinders: z
    .array(cylinderInputSchema)
    .min(1, 'A set needs at least one cylinder')
    .max(12, 'Twelve cylinders is the most one design uses')
    .refine(
      (rows) => new Set(rows.map((row) => row.code.toUpperCase())).size === rows.length,
      'Two cylinders in this set share a number',
    ),
});

export const updateCylinderSchema = cylinderInputSchema.partial().omit({ code: true });

/**
 * Something that happened to a cylinder.
 *
 * The status follows from the kind — see `statusAfter` — so it is not asked
 * for. A cylinder whose status is typed separately from its history is one that
 * can say "in store" while the history says it went out and never came back.
 */
export const recordCylinderEventSchema = z
  .object({
    cylinderIds: z
      .array(z.string().min(1))
      .min(1, 'Choose at least one cylinder')
      .max(12, 'Twelve at once is the most a set holds'),
    kind: z.enum(CYLINDER_EVENT_KINDS),
    occurredOn: isoDate('date'),
    /** A works order, a job number, a delivery note — whatever names this. */
    reference: optionalText(120),
    /** Only meaningful on a transfer. */
    toLocation: z.string().trim().max(80).default(''),
    notes: optionalText(500),
  })
  .refine((value) => value.kind !== 'TRANSFERRED' || value.toLocation.trim().length > 0, {
    message: 'Where is it going?',
    path: ['toLocation'],
  })
  /*
   * A cylinder found damaged or scrapped without a word is one nobody can
   * learn from — and both are the events somebody will be asked about.
   */
  .refine((value) => !['DAMAGED', 'RETIRED'].includes(value.kind) || value.notes.length >= 3, {
    message: 'Say briefly what happened',
    path: ['notes'],
  });

export const listCylindersQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(200).optional(),
  status: z.enum(CYLINDER_STATUSES).optional(),
  customerId: z.string().min(1).optional(),
  /** Only the sets that cannot be printed as they stand. */
  attentionOnly: z
    .union([z.boolean(), z.literal('true'), z.literal('false')])
    .transform((value) => value === true || value === 'true')
    .optional(),
});

export type CylinderInput = z.infer<typeof cylinderInputSchema>;
export type RegisterCylindersInput = z.infer<typeof registerCylindersSchema>;
export type UpdateCylinderInput = z.infer<typeof updateCylinderSchema>;
export type RecordCylinderEventInput = z.infer<typeof recordCylinderEventSchema>;
export type ListCylindersQuery = z.infer<typeof listCylindersQuerySchema>;
