import type { MaterialAvailability } from '../lib/material-availability.js';
import type { MachineKind } from '../lib/rate-costing.js';
import type { ProductionStatus, StageStatus } from '../constants/production.js';

/** One process on a job card, as every screen reads it. */
export interface ProductionStageRow {
  id: string;
  position: number;
  stage: MachineKind;
  /** Which lamination pass, 1 or 2. Zero on every other stage. */
  pass: number;
  status: StageStatus;

  machineId: string | null;
  machineName: string;
  /** The person on the books, when the stage names one. */
  operatorId: string | null;
  /** Their name, snapshotted — so a finished card reads after they leave. */
  operator: string;

  inputKg: number;
  outputKg: number;
  /** Derived from the two above, never stored. Negative when they disagree. */
  wasteKg: number;

  startedAt: string | null;
  finishedAt: string | null;
  notes: string;
}

/** A job card. */
export interface ProductionOrder {
  id: string;
  number: number;
  status: ProductionStatus;

  orderId: string;
  orderNumber: number;
  customerName: string;
  jobName: string;
  jobId: string | null;

  quantityKg: number;
  notes: string;

  /** The order's promise, carried here so the list can say what is late. */
  dueDate: string | null;

  startedAt: string | null;
  completedAt: string | null;

  stages: ProductionStageRow[];
  /** Done ÷ applicable, as a percentage. Derived, never stored. */
  progressPercent: number;
  /** The one being worked, or the next one waiting. Null on a finished card. */
  currentStage: MachineKind | null;

  /**
   * The structure, outermost ply first, as the job was priced.
   *
   * Carried so a lamination row can say which two films it bonds — the number
   * on it is the PASS, not the machine, and the works reads it as the machine
   * unless the films are named. Empty for a card with no priced structure
   * behind it. See `lamination-label.ts`.
   */
  plies: string[];

  /**
   * The film this card needs, and what the works has free for it.
   *
   * Empty when nothing can be said — a card on an order typed over the phone
   * has no priced structure behind it, so there is no material to reserve and
   * none is claimed. A line with `shortBy` above zero is what stops the job.
   *
   * These are claims, never movements: see `material-availability.ts`. Stock is
   * reduced exactly once, by the job sheet, and nothing here touches it.
   */
  materials: MaterialAvailability[];

  /**
   * The sheet that costs this run, once the office has started one.
   *
   * Posting it is what takes the run's material off stock — and what releases
   * this card's claim on it, so the two never stand against the same film at
   * once. Null until a sheet is linked.
   */
  jobSheetId: string | null;
  jobSheetNumber: number | null;
  /** When that sheet's material was taken off stock. Null until it is. */
  jobSheetPostedAt: string | null;

  /** Why this card was allowed to run short, if it was. Empty means it was not. */
  materialOverrideReason: string;
  /** Who said so, and when. Both empty until somebody does. */
  materialOverrideBy: string;
  materialOverrideAt: string | null;

  createdAt: string;
  updatedAt: string;
}
