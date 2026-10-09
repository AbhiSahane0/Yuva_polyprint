/**
 * **The job card as the app hands it round.**
 *
 * Only what is stored. Every figure the card PRINTS — the plies to draw, the
 * metreage, the times — is worked out from this plus the design, by
 * `computeJobCard`, so no two screens can disagree about what a card says.
 */
export interface JobCard {
  id: string;
  number: number;
  date: string;

  orderId: string | null;
  /** The order's own number, carried so a card can name it without a lookup. */
  orderNumber: number | null;
  jobId: string | null;
  jobName: string;
  customerId: string | null;
  customerName: string;

  workOrderNo: string;
  poDate: string | null;
  dispatchDate: string | null;
  transport: string;
  quantityKg: number;
  jobReceivedBy: string;
  printingNote: string;
  printSpeedMPerMin: number;
  /** Null where nobody has corrected the arithmetic against the roll in hand. */
  printMetersOverride: number | null;
  metPetCoatingGsm: number;
  polyCoatingGsm: number;
  pouchingSpeedPerMin: number;
  otherSettingMinutes: number;
  singleRollWeight: string;
  pouchSorting: string;
  specialInstructions: string;

  preparedBy: string;
  operatedBy: string;
  approvedBy: string;

  enteredBy: string;
  createdAt: string;
  updatedAt: string;
}

/** One row of the list. What the office needs to find a card again. */
export interface JobCardSummary {
  id: string;
  number: number;
  date: string;
  jobName: string;
  customerName: string;
  orderNumber: number | null;
  quantityKg: number;
  /** Blank until somebody types one. */
  workOrderNo: string;
  dispatchDate: string | null;
}
