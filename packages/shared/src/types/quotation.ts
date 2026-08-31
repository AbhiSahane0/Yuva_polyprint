import type { JobKind, PouchType, PricingBasis } from '../constants/job.js';
import type { QuotationStatus } from '../schemas/quotation.js';

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
  pricingBasis: PricingBasis;

  repeatWidth: number;
  repeatHeight: number;
  cylinderCount: number;
  transportCost: number;
  /** False when this design's cylinders already exist, so none are charged. */
  chargeCylinders: boolean;

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

  /** When the customer's answer was recorded. */
  decidedAt: string | null;
  /** Why they said no. Empty unless the quotation was lost. */
  lostReason: string;

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
  sentBy: string;
  createdAt: string;
}

/** What the send endpoint answers with. */
export interface SendQuotationResult {
  sentTo: string[];
  sentAt: string;
  /** The quotation's status after sending — Draft becomes Sent. */
  status: QuotationStatus;
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
}
