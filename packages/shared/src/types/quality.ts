import type { IssueSeverity, IssueStatus, WasteByStage, WasteDay } from '../lib/quality.js';
import type { MachineKind } from '../lib/rate-costing.js';

/** One thing found wrong with a run. */
export interface QualityIssue {
  id: string;
  number: number;

  cardId: string;
  cardNumber: number;
  orderNumber: number;
  customerName: string;
  jobName: string;

  /** The stage it was found at, where it was found on a machine. */
  stageId: string | null;
  stage: MachineKind | null;
  stageLabel: string;

  severity: IssueSeverity;
  status: IssueStatus;
  /** Derived — "being looked at" still counts as open. */
  isOpen: boolean;

  title: string;
  detail: string;
  /** Finished goods that cannot be sent. Never added to waste. */
  rejectedKg: number;

  raisedBy: string;
  responsibleId: string | null;
  responsibleName: string;

  resolvedBy: string;
  resolvedAt: string | null;
  resolution: string;

  /** Against today. How long it has been somebody's problem. */
  openForDays: number;

  createdAt: string;
  updatedAt: string;
}

/** The figures across the top of the Quality screen. */
export interface QualityTotals {
  /** Every stage finished today, as a share of what went on. */
  todayWastePercent: number;
  todayWasteKg: number;
  /** Rejected and therefore undispatchable, across every open card. */
  rejectedKg: number;
  openIssues: number;
  /** Of those, the ones nobody should go home on. */
  highSeverity: number;
}

export interface QualityBoard {
  totals: QualityTotals;
  /** Where material is being lost, heaviest first. */
  byStage: WasteByStage[];
  /** The last fourteen days, oldest first, quiet days included. */
  trend: WasteDay[];
  issues: QualityIssue[];
}

/** A card an issue can be raised against. */
export interface IssueTarget {
  cardId: string;
  cardNumber: number;
  orderNumber: number;
  customerName: string;
  jobName: string;
  stages: { id: string; stage: MachineKind; label: string }[];
}
