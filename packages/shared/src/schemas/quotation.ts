import { z } from 'zod';
import { JOB_KINDS, POUCH_TYPES, PRICING_BASES, pricingBasisFor } from '../constants/job.js';
import { paginationQuerySchema } from './common.js';
import { isMobile, normaliseMobile } from '../lib/phone.js';

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

/** One ply of the laminate, as the office states it on the line. */
export const quotationLayerSchema = z.object({
  /** Null leaves the ply unchosen, which makes the line uncostable — not free. */
  materialId: z.string().min(1).nullable().default(null),
  micron: positiveNumber('Thickness'),
  /**
   * Rupees per kilogram the office typed, when the film's own rate cannot apply.
   *
   * The rates master prices a film at the gauge it is stocked in: `PET 12µm` and
   * `PET 19µm` are two materials at two prices. Quote a 20µ PET and neither rate
   * is the right one — so rather than silently cost it at the 12µ price, the
   * line asks, and what is typed is used for this quotation and stored on it.
   *
   * **It does not reach the rates master.** A figure keyed in the middle of
   * quoting is a decision about one document, and letting it edit the price list
   * would mean every quotation is a chance to change what every other quotation
   * costs. Adding `PET 20µm` properly is a job for the Rates screen.
   *
   * Null means "use the film's own rate", which is the ordinary case.
   */
  rateOverride: z
    .union([z.literal(''), z.null(), z.undefined()])
    .transform(() => null)
    .or(z.coerce.number().positive('Rate must be more than 0'))
    .nullable()
    .default(null),
});

/** One quantity a line is priced at. */
export const quotationQuantitySchema = z.object({
  quantityKg: zeroOrMore('Quantity').default(0),
  ratePerKg: zeroOrMore('Rate').default(0),
  quantityPouches: zeroOrMore('Quantity').default(0),
  ratePerPouch: zeroOrMore('Rate').default(0),
});

export const quotationItemSchema = z
  .object({
    /** Present when editing a line that already exists. */
    id: z.string().min(1).optional(),
    /** Set when the line was prefilled from an existing job. */
    jobId: z.string().min(1).nullable().optional(),

    jobName: z.string().trim().min(1, 'Job name is required').max(200),

    /** Roll or pouch, and for a pouch which style. */
    jobKind: z.enum(JOB_KINDS).default('POUCH'),
    pouchType: z.enum(POUCH_TYPES).nullable().default(null),
    pouchTypeNote: z.string().trim().max(120).default(''),

    /**
     * Whether this line is ordered by weight or by the piece.
     *
     * Chosen on the line. The style suggests it — the trade quotes a standup
     * pouch per piece and a centre-seal one by weight — but the suggestion was
     * the only answer available before, and a customer who orders standup
     * pouches by the kilogram had no way to be quoted the way they buy.
     *
     * Null means "whatever the style conventionally is", which is how a
     * request that predates the choice, or one that simply does not care, gets
     * the old behaviour exactly.
     */
    pricingBasis: z.enum(PRICING_BASES).nullable().default(null),

    /** The finished pouch, before any gusset. */
    widthMm: positiveNumber('Width'),
    heightMm: positiveNumber('Height'),

    /**
     * A gazette pouch gussets at the sides and the base so it stands.
     *
     * Off by default, because most jobs are flat bags. The three depths are
     * film the flat sheet has to carry, so they enlarge both the weight and the
     * cylinder — see `computeItemGeometry`.
     */
    isGazette: z.boolean().default(false),
    gazetteBottom: zeroOrMore('Bottom gazette').default(0),
    gazetteLeft: zeroOrMore('Left gazette').default(0),
    gazetteRight: zeroOrMore('Right gazette').default(0),

    /**
     * The structure, outermost ply first. Two or three in practice; the upper
     * bound is four so a foil laminate does not need a release to quote.
     */
    layers: z
      .array(quotationLayerSchema)
      .min(2, 'A laminate needs at least two plies')
      .max(4, 'More than four plies is not something this works produces'),

    /** One to three quantities, smallest first. */
    quantities: z
      .array(quotationQuantitySchema)
      .min(1, 'Enter at least one quantity')
      .max(3, 'Three quantities is the most a quotation can show'),

    repeatWidth: positiveNumber('Repeat width'),
    repeatHeight: positiveNumber('Repeat height'),
    cylinderCount: z.coerce.number().int().min(0, 'Cannot be negative'),
    transportCost: zeroOrMore('Transport cost').default(0),

    /**
     * False when this design's cylinders are already in the works. Per design,
     * not per customer — a customer of ten years ordering a new pouch still
     * needs a new set engraved.
     */
    chargeCylinders: z.boolean().default(true),
  })
  /*
   * A roll has no pouch style. Rather than reject the combination — which would
   * make switching Pouch to Roll an error the user has to clear — the style is
   * dropped, so the stored line always matches what the form is showing.
   */
  .transform((item) => {
    /*
     * A roll is film on a reel: no pouch style, and no gusset either, because
     * nothing has been converted. Dropping them rather than rejecting the
     * combination means switching Pouch to Roll is not an error the office has
     * to go and clear.
     */
    const rolled =
      item.jobKind === 'ROLL'
        ? {
            ...item,
            pouchType: null,
            pouchTypeNote: '',
            isGazette: false,
            gazetteBottom: 0,
            gazetteLeft: 0,
            gazetteRight: 0,
          }
        : item;

    /*
     * The depths only mean anything when the box is ticked. Zeroing them when
     * it is not keeps a stored line honest: a quotation cannot carry a 40mm
     * bottom gusset that was never charged for, waiting to confuse whoever
     * reads it next.
     */
    const line = rolled.isGazette
      ? rolled
      : { ...rolled, gazetteBottom: 0, gazetteLeft: 0, gazetteRight: 0 };

    /*
     * A roll is film on a reel: there are no pouches to count, so the choice is
     * not offered and cannot be smuggled in through the API either. Everything
     * else takes what the office chose, falling back to the trade convention.
     */
    return {
      ...line,
      pricingBasis:
        line.jobKind === 'ROLL'
          ? ('PER_KG' as const)
          : (line.pricingBasis ?? pricingBasisFor(line.jobKind, line.pouchType)),
    };
  })
  .refine((item) => item.jobKind !== 'POUCH' || item.pouchType !== null, {
    message: 'Choose the pouch type',
    path: ['pouchType'],
  })
  .refine((item) => item.pouchType !== 'OTHER' || item.pouchTypeNote.length > 0, {
    message: 'Describe the pouch type',
    path: ['pouchTypeNote'],
  })
  /*
   * A gazette with no depth anywhere is not a gazette. Caught here rather than
   * left to price as an ordinary pouch, because the tick says the office meant
   * to enter something and then did not.
   */
  .refine(
    (item) => !item.isGazette || item.gazetteBottom + item.gazetteLeft + item.gazetteRight > 0,
    {
      message: 'Enter at least one gazette depth, or untick Gazette pouch',
      path: ['gazetteBottom'],
    },
  )
  /*
   * Whichever pair a line is priced on has to be filled in, at every quantity.
   * Checked here rather than on the fields themselves because a per-pouch line
   * legitimately leaves the kilogram pair at zero and a per-kg line the pouch
   * pair — requiring both would make every line fail. superRefine rather than
   * refine so the message lands on the quantity that is actually short, not on
   * the first one.
   */
  .superRefine((item, ctx) => {
    const perPouch = item.pricingBasis === 'PER_POUCH';

    item.quantities.forEach((quantity, index) => {
      const checks: [boolean, string, string][] = perPouch
        ? [
            [quantity.quantityPouches > 0, 'quantityPouches', 'Enter how many pouches'],
            [quantity.ratePerPouch > 0, 'ratePerPouch', 'Enter the rate per pouch'],
          ]
        : [
            [quantity.quantityKg > 0, 'quantityKg', 'Enter the quantity in kg'],
            [quantity.ratePerKg > 0, 'ratePerKg', 'Enter the rate per kg'],
          ];

      for (const [ok, field, message] of checks) {
        if (!ok) {
          ctx.addIssue({ code: 'custom', message, path: ['quantities', index, field] });
        }
      }
    });
  });

export const DEFAULT_TERMS = [
  'Cylinder charges are one-time and reusable for repeat orders (same design).',
  'Each job/design requires a separate cylinder.',
  'Quotation valid for 15 days.',
  '18% GST applicable on total value.',
  'Delivery within 20 working days after PO confirmation.',
  'Payment Terms: 100% advance for cylinders, 70% advance for material.',
];

const createQuotationBaseSchema = z.object({
  /** ISO date (yyyy-mm-dd) shown on the document. */
  date: z.string().min(1, 'Date is required'),

  customerId: z.string().min(1).nullable().optional(),
  /**
   * Set when the form was filled in as a new company rather than picked from
   * the list. The customer master gains the company as the quotation saves, so
   * the next enquiry finds it under "Existing company" instead of being retyped.
   */
  saveAsCustomer: z.boolean().default(false),
  /**
   * The customer's brand, as the office has it on this screen.
   *
   * Carried on the quotation input but not stored on the quotation: a brand
   * belongs to the customer, and holding a second copy here would let the two
   * disagree the moment either was edited. It is used to fill the brand in when
   * a new company is created, and to correct it on an existing one.
   */
  brandName: z.string().trim().max(200).default(''),
  /* "Required" is untrue once a single character has been typed, which is what
   * this rule actually rejects — so the message says what to do instead. */
  customerName: z.string().trim().min(2, 'Enter the company name').max(200),
  addressLine1: z.string().trim().max(200).default(''),
  addressLine2: z.string().trim().max(200).default(''),
  addressLine3: z.string().trim().max(200).default(''),
  mobile: z
    .string()
    .trim()
    .min(1, 'Enter Valid Mobile Number')
    .regex(/^\d{10}$/),
  /** GSTIN. Upper-cased, because it is printed and read back over the phone. */
  gstNumber: z.string().trim().toUpperCase().max(20).default(''),
  email: z
    .string()
    .trim()
    .min(1, 'Enter Valid Email')
    .regex(/.*?@?[^@]*\.+.*/),

  /**
   * Which quantity the printed quotation is for, counting from 1.
   *
   * The office may price a job at two or three quantities to see what volume
   * does to the margin, but the customer is quoted **one**. This says which,
   * and the document, its totals and the advance are all built from that one
   * alone; the others stay on the wizard as working.
   *
   * Clamped rather than validated against the number of quantities, because the
   * two arrive together and a quotation trimmed from three quantities to one
   * would otherwise be rejected for pointing at a column that had just gone.
   * See `resolveSelectedQuantity`.
   */
  selectedQuantity: z.coerce.number().int().min(1).max(3).default(1),

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

export const createQuotationSchema = createQuotationBaseSchema
  /*
   * Every line has to be priced at the same number of quantities, because the
   * quantities are columns on one document. A line with three and a line with
   * two would leave a hole in the third column that no total could describe.
   */
  .refine((q) => new Set(q.items.map((item) => item.quantities.length)).size <= 1, {
    message: 'Every job must be priced at the same quantities',
    path: ['items'],
  });

/*
 * `.partial()` cannot be called on a schema carrying a refinement, and the
 * refinement above is one. The update shape is therefore the object without it:
 * a partial update may legitimately omit `items` entirely, and when it does
 * carry them the item schema still validates each one.
 */
export const updateQuotationSchema = createQuotationBaseSchema.partial();

/**
 * The columns the list can be ordered by.
 *
 * A closed set rather than a free string: the value reaches Prisma's `orderBy`,
 * and anything the office can type there is a column name it could guess at.
 * Only these four are offered because only these four are on the table as
 * sortable columns — sorting by a figure nobody can see is not a feature.
 */
export const QUOTATION_SORT_FIELDS = ['number', 'customerName', 'date', 'status'] as const;
export const quotationSortFieldSchema = z.enum(QUOTATION_SORT_FIELDS);
export type QuotationSortField = (typeof QUOTATION_SORT_FIELDS)[number];

export const sortDirectionSchema = z.enum(['asc', 'desc']);
export type SortDirection = z.infer<typeof sortDirectionSchema>;

export const listQuotationsQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(200).optional(),
  status: quotationStatusSchema.optional(),
  /**
   * Absent means the work queue — see `listQuotations`. That default is not
   * expressed here because it is two columns, not one, and a caller asking for
   * no particular order should get the useful order rather than a column.
   */
  sort: quotationSortFieldSchema.optional(),
  dir: sortDirectionSchema.optional(),
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

  /**
   * Rate costing — the works' own overheads.
   *
   * These build a rate up from every expense rather than starting from one
   * somebody remembers. Machines and wages are rows of their own; what is left
   * is a handful of figures that belong to the works rather than to any job.
   */
  workingDaysPerMonth: z.coerce.number().min(1).max(31),
  hoursPerDay: z.coerce.number().min(1).max(24),
  transportPerKg: z.coerce.number().min(0).max(10_000),
  packingPerKg: z.coerce.number().min(0).max(10_000),
  /** Sundries the works does not itemise, charged once on the job. */
  otherPerJob: z.coerce.number().min(0).max(1_000_000),
  emiPerMonth: z.coerce.number().min(0).max(10_000_000),
  /** Machine hours a month the EMI is spread over. */
  emiHoursPerMonth: z.coerce.number().min(1).max(744),
  pouchMakingPerKg: z.coerce.number().min(0).max(10_000),
  /** What the sixth, seventh and eighth printing stations each add, per kg. */
  stationSurcharge6: z.coerce.number().min(0).max(10_000),
  stationSurcharge7: z.coerce.number().min(0).max(10_000),
  stationSurcharge8: z.coerce.number().min(0).max(10_000),
  defaultWastagePercent: z.coerce.number().min(0).max(100),
  defaultMarginPercent: z.coerce.number().min(0).max(100),
  /**
   * What the margin is taken on. Their sheet uses the material cost alone,
   * which recovers labour and power at cost and earns nothing on them.
   */
  marginBasis: z.enum(['TOTAL_COST', 'MATERIAL_ONLY']),
  /** Ink to solvent at the press, and how the solvent splits. */
  inkSolventParts: z.coerce.number().min(0).max(1000),
  ethylAcetatePercent: z.coerce.number().min(0).max(100),
  defaultAdhesiveRatio: z.string().trim().max(20),
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

  /* Rate costing. Taken from the works' own sheets; edit on the Costing screen. */
  workingDaysPerMonth: 26,
  hoursPerDay: 8,
  transportPerKg: 10,
  packingPerKg: 5,
  otherPerJob: 250,
  emiPerMonth: 4166.66,
  emiHoursPerMonth: 24,
  pouchMakingPerKg: 15,
  stationSurcharge6: 5.5,
  stationSurcharge7: 7.5,
  stationSurcharge8: 9,
  defaultWastagePercent: 8,
  defaultMarginPercent: 9,
  marginBasis: 'TOTAL_COST',
  inkSolventParts: 80,
  ethylAcetatePercent: 50,
  defaultAdhesiveRatio: '100:146:15',
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

/**
 * Mobile numbers a send is also addressed to, normalised to E.164 here.
 *
 * Normalising in the schema rather than in the caller means the stored number
 * is the same shape however it was typed — `9545390337`, `+91 95453 90337` and
 * `09545390337` are one number, and a history that recorded three would make
 * "did we send this to him" unanswerable.
 *
 * A number that is not a mobile is rejected rather than dropped. Silently
 * discarding it would leave the office believing a message was addressed to a
 * landline that can never receive one.
 */
const mobiles = z
  .array(z.string().trim())
  .max(10, 'Ten numbers is the most one send can carry')
  .default([])
  .transform((values) => values.map((value) => normaliseMobile(value) ?? value))
  .refine(
    (values) => values.every((value) => isMobile(value)),
    'Every number must be a ten-digit Indian mobile',
  )
  .transform((values) => [...new Set(values)]);

export const sendQuotationSchema = z.object({
  /**
   * Email is required even when WhatsApp numbers are given.
   *
   * The PDF is the deliverable and email is what carries it; a send with no
   * address would mean pressing Send and nothing leaving the building.
   */
  to: recipients.refine((values) => values.length > 0, 'Add at least one recipient'),
  cc: recipients.default([]),
  subject: z.string().trim().min(1, 'Enter a subject').max(200),
  /** Free text above the standard body. Plain text — it is escaped, never HTML. */
  message: z.string().trim().max(4000).default(''),
  /** Recorded against the send; delivery follows when WhatsApp is wired up. */
  whatsappTo: mobiles,
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
