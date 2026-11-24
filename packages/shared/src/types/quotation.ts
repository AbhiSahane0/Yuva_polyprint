import type {
  EnquiryChannel,
  InkKind,
  JobKind,
  PouchType,
  PricingBasis,
} from '../constants/job.js';
import type { QuotationStatus } from '../schemas/quotation.js';

/**
 * One cylinder being re-engraved on a repeat order.
 *
 * Snapshotted like everything else on a quotation: the code and the colour
 * travel with the document, so it still reads after the cylinder has been
 * re-engraved, renumbered or scrapped, and the link goes null rather than
 * taking the quotation with it.
 */
export interface QuotationCylinderRepair {
  cylinderId: string | null;
  position: number;
  code: string;
  colour: string;
  cost: number;
  /** What is wrong with it, carried onto the register when the quotation wins. */
  reason: string;
}

/** One ink a line prints, as it was priced the day the quotation was written. */
export interface QuotationItemColour {
  id: string;
  position: number;
  /** Null on a special, and on a process ink later deleted from the list. */
  materialId: string | null;
  name: string;
  kind: InkKind;
  laydownGsm: number;
  solidsPercent: number;
  ratePerKg: number;
}

/** One ply of a line's laminate, as the API returns it. */
export interface QuotationItemLayer {
  /** 1 is the outermost, printed ply. */
  position: number;
  materialId: string | null;
  materialName: string;
  micron: number;
  /** Null when the chosen material has no density recorded. */
  density: number | null;
  ratePerKg: number | null;
  /**
   * The rate the office agreed for this job's film, or null to follow the
   * film's own. Read back so reopening a quotation puts it in the box.
   */
  rateOverride: number | null;
  /** micron × density. */
  gsm: number;
}

/** One line's figures at one of the quoted quantities. */
export interface QuotationItemQuantity {
  /** Matches the tier of the same position. */
  position: number;
  quantityKg: number;
  ratePerKg: number;
  quantityPouches: number;
  ratePerPouch: number;
  totalPouches: number;
  totalAmount: number;
  costPerPouch: number;
  /** Null when the line could not be costed. */
  materialCost: number | null;
  marginPercent: number | null;
}

/** One priced line as returned by the API. Decimals serialise as numbers. */
export interface QuotationItem {
  id: string;
  position: number;
  jobId: string | null;
  jobName: string;

  jobKind: JobKind;
  /** Null on a roll. */
  pouchType: PouchType | null;
  /** Only meaningful when pouchType is OTHER. */
  pouchTypeNote: string;

  widthMm: number;
  heightMm: number;
  /** True when this pouch gussets at the sides and base. */
  isGazette: boolean;
  gazetteBottom: number;
  gazetteLeft: number;
  gazetteRight: number;
  /** Finishing, not style — see the schema. The punch is charged; the notch is not. */
  hasDPunch: boolean;
  hasVNotch: boolean;
  /** A repeat order quoting one of its existing cylinders put right. */
  repairCylinders: boolean;
  repairs: QuotationCylinderRepair[];
  /** Who cuts them — engravers do not charge alike, so this is part of the quote. */
  cylinderManufacturer: string;
  /** What the set prints, as the customer names it. Often not the job name. */
  cylinderDesign: string;
  /** The flat film one pouch is cut from: the pouch plus its gussets. */
  filmWidthMm: number;
  filmHeightMm: number;

  pricingBasis: PricingBasis;

  repeatWidth: number;
  repeatHeight: number;
  cylinderCount: number;
  transportCost: number;
  /** False when this design's cylinders already exist, so none are charged. */
  chargeCylinders: boolean;
  /** True when the customer brought the set — the works never owned it. */
  customerCylinders: boolean;

  /** Geometry — the same whichever quantity is being looked at. */
  micron: number;
  pouchesPerKg: number;
  cylinderWidth: number;
  cylinderCircumference: number;
  costPerCylinder: number;
  totalCylinderCost: number;

  /** Null when a ply was left unchosen, or a rate was missing that day. */
  materialCostPerKg: number | null;
  compositeGsm: number;

  layers: QuotationItemLayer[];
  colours: QuotationItemColour[];
  /** One per quoted quantity, ordered smallest first. */
  quantities: QuotationItemQuantity[];
}

/**
 * One quantity the whole document is priced at.
 *
 * The customer sees two or three side by side. Cylinders cost the same in every
 * column — which is exactly why the per-pouch figure falls as the quantity rises.
 */
export interface QuotationTier {
  id: string;
  position: number;

  materialSubtotal: number;
  materialWithGst: number;
  cylinderSubtotal: number;
  cylinderWithGst: number;
  grandSubtotal: number;
  grandWithGst: number;
  materialAdvance: number;
  cylinderAdvance: number;
  totalAdvance: number;

  totalQuantityKg: number;
  totalPouches: number;
}

/** Summary shape used by the list screen. */
export interface QuotationSummary {
  id: string;
  number: number;
  date: string;
  status: QuotationStatus;
  customerId: string | null;
  customerName: string;
  itemCount: number;

  /** Revisions share a number. Only the latest appears in the list. */
  version: number;
  isLatest: boolean;
  /** How many quantities this document is priced at. */
  tierCount: number;
  /**
   * Which of those the customer is quoted, 1-based.
   *
   * The others are the office's working: priced to see what volume does to the
   * margin, and left off the printed page.
   */
  selectedQuantity: number;

  /**
   * The headline figures, taken from the tier the customer accepted, or from
   * the smallest quantity when the answer is still open. A list needs one
   * number per row, and those are the two that mean something.
   */
  grandWithGst: number;
  totalAdvance: number;

  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** The full document. */
export interface Quotation extends QuotationSummary {
  addressLine1: string;
  addressLine2: string;
  addressLine3: string;
  mobile: string;
  email: string;
  gstNumber: string;

  /**
   * Who sent this enquiry the works' way. Empty where nobody did.
   *
   * Recorded and nothing else — it is not printed on the quotation and not
   * emailed. See the schema for why it has no more machinery than this.
   */
  referredBy: string;

  /** Who asked, and how they got in touch. Null channel on anything written
      before the question was asked. */
  enquiryFrom: string;
  generatedThrough: EnquiryChannel | null;

  /**
   * What the document as a whole is for — "Green Peas Packaging Range".
   *
   * The job names answer what each LINE is; this answers what the quotation
   * is. Empty on anything written before the field existed, and the printed
   * document leaves the line out rather than inventing one.
   */
  title: string;

  /** When the customer's answer was recorded. */
  decidedAt: string | null;
  /** Why they said no. Empty unless the quotation was lost. */
  lostReason: string;

  /** Costing figures this quotation overrides, or null for the works' own. */
  marginPercent: number | null;
  transportPerKg: number | null;
  pouchMakingPerKg: number | null;
  wastagePercent: number | null;
  cylinderRate: number;
  gstPercent: number;
  materialAdvancePercent: number;
  cylinderAdvancePercent: number;

  /** Which quantity was accepted. Only set once the quotation is won. */
  wonTierId: string | null;
  /** The first version, which every revision hangs off. Null on version 1. */
  rootId: string | null;

  /** Every quoted quantity and its totals, smallest first. */
  tiers: QuotationTier[];

  terms: string[];
  notes: string;
  items: QuotationItem[];
}

/** One recorded attempt to email a quotation. */
export interface QuotationEmail {
  id: string;
  to: string[];
  cc: string[];
  subject: string;
  /** Mobile numbers the same send was addressed to, in E.164. */
  whatsappTo: string[];
  /**
   * When WhatsApp actually accepted a message, or null while it is pending.
   *
   * Numbers with no timestamp are what the office intended, not what was
   * delivered — the history says so rather than implying a message went out.
   */
  whatsappSentAt: string | null;
  sentBy: string;
  createdAt: string;
}

/** What the send endpoint answers with. */
export interface SendQuotationResult {
  sentTo: string[];
  sentAt: string;
  /** The quotation's status after sending — Draft becomes Sent. */
  status: QuotationStatus;
  /**
   * The link the customer can accept on, as it went into the message.
   *
   * Returned so the office can copy it straight into a message of their own:
   * plenty of this works' quoting happens in a WhatsApp thread that is
   * already open, and the link is no use if the only copy is in the
   * customer's inbox. It is not stored — see `quotation-link.ts`.
   */
  acceptUrl: string;
  /** The numbers WhatsApp actually took a message for. */
  whatsappSentTo: string[];
  /**
   * The numbers it would not, and why.
   *
   * Reported rather than thrown: the email is the delivery and it has already
   * gone. A number that is not on WhatsApp is worth a line on the screen, not
   * a failed send.
   */
  whatsappFailures: { to: string; error: string }[];
}

/** What recording an outcome answers with. */
export interface RecordOutcomeResult {
  status: QuotationStatus;
  /** The customer this quotation is now attached to; created if there was none. */
  customerId: string | null;
  customerCreated: boolean;
  /** Job names added to that customer from the quotation's lines. */
  jobsCreated: string[];
  /** Lines whose job the customer already had, left untouched. */
  jobsSkipped: string[];
  /**
   * Order numbers raised from the lines — one per line, at the quantity the
   * customer accepted. Empty on a LOST quotation.
   */
  ordersCreated: number[];
  /** Lines that already had an order. Winning twice raises nothing again. */
  ordersSkipped: number[];
  /**
   * Cylinders this quotation quoted a repair for, now recorded as gone out.
   *
   * A quotation is an offer and quoting a repair changes nothing on the shelf;
   * winning is when the set actually goes to the engraver, so that is when the
   * register is written. Empty on a LOST quotation.
   */
  cylindersSent: string[];
  /** Ones already out against this quotation, or retired and so not sendable. */
  cylindersAlreadySent: string[];
}

/* -------------------------------------------------------------------------- */
/* What the customer sees on a link, and what they send back                   */
/* -------------------------------------------------------------------------- */

/**
 * Why a link will not show a quotation.
 *
 * Deliberately few, and deliberately vague about which. A stranger guessing
 * tokens learns nothing from `unknown` that they do not learn from a 404, and
 * a customer whose link has lapsed needs to be told to ring the office rather
 * than told which of five internal states they are in.
 */
export type QuotationLinkProblem =
  | 'unknown'
  | 'expired'
  | 'withdrawn'
  /** A revision exists, so this price is not the current one. */
  | 'superseded';

/**
 * One line of the quotation, as the customer is allowed to see it.
 *
 * **A hand-built projection, not a filtered `QuotationItem`.** The full line
 * carries `costPerPouch`, `materialCost` and `marginPercent` — what the works
 * pays and what it makes. Sending the whole object and hiding three fields in
 * the page would put the works' margin in the browser of every customer who
 * opens the network tab. So the public shape is written out by hand, and a
 * field only appears here because somebody added it on purpose.
 */
export interface PublicQuotationItem {
  position: number;
  jobName: string;
  /** "Standup pouch", "Roll" — as the printed document words it. */
  description: string;
  widthMm: number;
  heightMm: number;
  micron: number;
  colours: number;
  /** The quantity and rate for the one tier this customer was quoted. */
  quantityKg: number;
  ratePerKg: number;
  quantityPouches: number;
  ratePerPouch: number;
  totalAmount: number;
  pricingBasis: PricingBasis;
  /** Cylinders charged on this line, zero when there is nothing to cut. */
  cylinderCost: number;
}

/** The quotation as served to a customer holding a link. */
export interface PublicQuotation {
  number: number;
  version: number;
  date: string;
  /** Who it is for, as the document says it. */
  customerName: string;
  /** What the document as a whole is for. Empty where it was left off. */
  title: string;

  items: PublicQuotationItem[];

  materialSubtotal: number;
  cylinderSubtotal: number;
  grandSubtotal: number;
  grandWithGst: number;
  gstPercent: number;
  totalAdvance: number;

  terms: string[];
  notes: string;

  /** When the link stops accepting an answer. */
  expiresAt: string;

  /**
   * The answer already given, if there is one.
   *
   * A customer who accepts and then reopens the link must see their own
   * acceptance rather than the buttons again — and a second person at the same
   * company must see that a colleague has already answered.
   */
  response: PublicQuotationResponse | null;
}

/** An answer, as shown back to the customer who gave it. */
export interface PublicQuotationResponse {
  decision: 'ACCEPTED' | 'DECLINED';
  personName: string;
  personRole: string;
  note: string;
  respondedAt: string;
}

/** An answer, as the office sees it — with the corroborating detail. */
export interface QuotationResponseRecord extends PublicQuotationResponse {
  id: string;
  /** Which quantity they were looking at, where the document had several. */
  tierPosition: number | null;
  ipAddress: string;
  userAgent: string;
}

/** A link the office has issued, as the quotation screen lists it. */
export interface QuotationShareLink {
  id: string;
  /**
   * The whole link, including the token.
   *
   * Returned **only** by the call that mints it, because only the hash is
   * stored. Null on every later listing, which is the point: the office copies
   * it when it is made, and a leaked database cannot hand anybody a working
   * link.
   */
  url: string | null;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  viewCount: number;
  lastViewedAt: string | null;
}
