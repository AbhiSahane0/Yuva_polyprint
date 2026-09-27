import type { FloorAction, FloorEventKind } from '../lib/floor.js';
import type { IssueSeverity } from '../lib/quality.js';
import type { ProductionStatus, StageStatus } from '../constants/production.js';
import type { MachineKind } from '../lib/rate-costing.js';

/** A machine a tablet can be bolted to. */
export interface FloorMachine {
  id: string;
  name: string;
  kind: MachineKind;
  /** How many jobs are waiting at it, so a tablet shows its own workload. */
  waiting: number;
}

/** One thing the operator said at the machine. */
export interface FloorEvent {
  id: string;
  kind: FloorEventKind;
  note: string;
  operator: string;
  createdAt: string;
}

/**
 * One job as the machine sees it.
 *
 * Deliberately flat and deliberately short. Everything an operator needs to
 * know it is the right job and to record what it did — and nothing about
 * rates, margins or customers' terms, which are not theirs and would only be
 * something else to scroll past.
 */
export interface FloorJob {
  stageId: string;
  cardId: string;
  cardNumber: number;
  cardStatus: ProductionStatus;

  orderNumber: number;
  customerName: string;
  jobName: string;
  /** What the customer asked for, so a wildly wrong weight is obvious. */
  orderQuantityKg: number;
  dueDate: string | null;
  isOverdue: boolean;

  stage: MachineKind;
  /** Which lamination pass, where a job laminates twice. Zero otherwise. */
  pass: number;
  stageLabel: string;
  stageStatus: StageStatus;
  position: number;
  /** How far down the card this is, as "3 of 4". */
  stageCount: number;

  machineId: string | null;
  machineName: string;
  operatorId: string | null;
  operator: string;

  inputKg: number;
  outputKg: number;
  wasteKg: number;
  wastePercent: number;

  startedAt: string | null;
  isRunning: boolean;
  /** What the one big button should do here. */
  action: FloorAction;

  /**
   * Why it is stopped, most recent first. Only what the floor said — the
   * office's notes on the card are not shown, because they are not addressed
   * to the machine.
   */
  events: FloorEvent[];

  /**
   * Defects still open on this card, worst first.
   *
   * Separate from the events above because they outlive the stoppage: the
   * press is started again in ten minutes and the issue is still somebody's
   * to close. The operator coming on next shift needs to see it.
   */
  issues: {
    id: string;
    number: number;
    severity: IssueSeverity;
    title: string;
    raisedBy: string;
    createdAt: string;
  }[];

  /**
   * Short of film, and what of. A stage cannot be started against it unless
   * the office has already allowed the card to run short.
   */
  shortOf: string[];
  canStartShort: boolean;
}

/** Everything one tablet needs in one call. */
export interface FloorBoard {
  machine: FloorMachine | null;
  /** The job in hand, if there is one. */
  current: FloorJob | null;
  /** What is queued behind it at this machine. */
  waiting: FloorJob[];
  /** Who can be picked as the operator — this machine's people first. */
  operators: { id: string; name: string; suggested: boolean }[];
}
