import type { JobKind, PouchType, PricingBasis } from '../constants/job.js';
import type { QuotationStatus } from '../schemas/quotation.js';

/** One priced line as returned by the API. Decimals serialise as numbers. */
export interface QuotationItem {
  id: string;
  position: number;
  jobId: string | null;
  /** Film this line was costed against, and its name for display. */
  filmMaterialId: string | null;
  filmMaterialName: string | null;
  jobName: string;

  jobKind: JobKind;
  /** Null on a roll. */
  pouchType: PouchType | null;
  /** Only meaningful when pouchType is OTHER. */
  pouchTypeNote: string;

  layer: number;
  widthMm: number;
  heightMm: number;
  polyMicron: number;
  pricingBasis: PricingBasis;
  quantityKg: number;
  ratePerKg: number;
  quantityPouches: number;
  ratePerPouch: number;
  repeatWidth: number;
  repeatHeight: number;
  cylinderCount: number;
  transportCost: number;

  micron: number;
  pouchesPerKg: number;
  totalPouches: number;
  totalAmount: number;
  cylinderWidth: number;
  cylinderCircumference: number;
  costPerCylinder: number;
  totalCylinderCost: number;
  costPerPouch: number;

  /** Null when no film was chosen, or a rate was missing on the quotation date. */
  materialCostPerKg: number | null;
  materialCost: number | null;
  marginPercent: number | null;
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

  materialSubtotal: number;
  materialWithGst: number;
  cylinderSubtotal: number;
  cylinderWithGst: number;
  grandSubtotal: number;
  materialAdvance: number;
  cylinderAdvance: number;

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
