import type { QuotationStatus } from '../schemas/quotation.js';

/** One priced line as returned by the API. Decimals serialise as numbers. */
export interface QuotationItem {
  id: string;
  position: number;
  jobId: string | null;
  jobName: string;

  layer: number;
  widthMm: number;
  heightMm: number;
  polyMicron: number;
  quantityKg: number;
  ratePerKg: number;
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
