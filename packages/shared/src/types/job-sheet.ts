import type { JobSheetLineKind, JobSheetSection } from '../constants/job-sheet.js';
import type { JobSheetStage } from '../lib/job-sheet-costing.js';

/** Where a job sheet is in its life. */
export type JobSheetStatus = 'OPEN' | 'COSTED' | 'CLOSED';

export const JOB_SHEET_STATUS_LABELS: Record<JobSheetStatus, string> = {
  OPEN: 'Open',
  COSTED: 'Costed',
  CLOSED: 'Closed',
};

/** One consumable on a sheet, as the API returns it. Decimals serialise as numbers. */
export interface JobSheetLine {
  id: string;
  position: number;
  section: JobSheetSection;
  kind: JobSheetLineKind;

  materialId: string | null;
  name: string;

  issuedKg: number;
  returnedKg: number;

  mixIssuedKg: number;
  mixReturnedKg: number;
  mixSharePercent: number;

  /** What the issue and return figures work out to. */
  computedKg: number;
  /** What the office typed instead, when the computed figure was wrong. */
  consumedOverrideKg: number | null;
  /** The override where there is one, the computed figure where there is not. */
  consumedKg: number;

  ratePerKg: number;
  amount: number;
}

export interface JobSheetLabour {
  id: string;
  position: number;
  role: string;
  headcount: number;
  ratePerDay: number;
  days: number;
  amount: number;
}

export interface JobSheetStageUsage {
  id: string;
  stage: JobSheetStage;
  sharePercent: number;
  days: number;
  shifts: number;
  amount: number;
}

/** One run, costed. */
export interface JobSheet {
  id: string;
  number: number;
  date: string;
  status: JobSheetStatus;

  jobId: string | null;
  jobName: string;
  customerId: string | null;
  customerName: string;

  /**
   * The job card this sheet is the costing of, when it is one.
   *
   * Null on the works' own imported sheets, which predate job cards, and on any
   * sheet keyed from paper against no card. Where it is set, **posting this
   * sheet releases that card's claim on its film** — by then the material has
   * genuinely left the shelf, so the claim standing in for it stops counting.
   */
  productionOrderId: string | null;
  /** The card's human number, carried so the sheet can name it without a lookup. */
  productionOrderNumber: number | null;

  // ---- The job card: the work instruction, written before the run ---------
  /**
   * Only what somebody types. The rest of the card is worked out from the
   * design master and the works' figures — see `computeJobCard`.
   */
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
  approvedBy: string;

  operatorName: string;

  filmType: string;
  webWidthMm: number | null;
  micron: number | null;
  circumferenceMm: number | null;
  cylinderCount: number;

  printMixIssuedKg: number;
  printMixReturnedKg: number;
  lamMixIssuedKg: number;
  lamMixReturnedKg: number;

  makeReadyDays: number;
  productionDays: number;

  printedGrossKg: number;
  printedCoreKg: number;
  producedGrossKg: number;
  producedCoreKg: number;
  /** Good laminate off the machine: gross less cores. */
  producedKg: number;
  finalOutputKg: number;
  pouchingWeightKg: number;

  electricityPerDay: number;
  transportPerKg: number;
  pouchingPerKg: number;
  packagingCost: number;
  emiPerDay: number;
  profitPercent: number;
  expectedWastagePercent: number;

  electricityOverride: number | null;
  salaryOverride: number | null;
  transportOverride: number | null;
  pouchingOverride: number | null;
  emiOverride: number | null;
  profitOverride: number | null;

  materialKg: number;
  materialCost: number;
  basicValuePerKg: number;

  electricityCost: number;
  salaryCost: number;
  transportCost: number;
  pouchingCost: number;
  emiCost: number;
  profit: number;
  overheadCost: number;

  effectivePrice: number;
  /** The answer the sheet exists to produce. */
  costPerKg: number;

  expectedWastageKg: number;
  actualWastageKg: number;
  wastagePercent: number;
  excessCost: number;

  /** Set once the consumption has been taken off stock. */
  stockPostedAt: string | null;

  notes: string;
  enteredBy: string;

  lines: JobSheetLine[];
  labour: JobSheetLabour[];
  stages: JobSheetStageUsage[];

  createdAt: string;
  updatedAt: string;
}

/** What the list screen shows, without dragging every line along. */
export interface JobSheetSummary {
  id: string;
  number: number;
  date: string;
  status: JobSheetStatus;
  jobName: string;
  customerName: string;
  /** Pouch when anything was pouched, roll when nothing was. */
  isPouchForm: boolean;
  finalOutputKg: number;
  materialCost: number;
  effectivePrice: number;
  costPerKg: number;
  wastagePercent: number;
  stockPostedAt: string | null;
}
