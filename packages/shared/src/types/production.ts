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

  /** Why this card was allowed to run short, if it was. Empty means it was not. */
  materialOverrideReason: string;
  /** Who said so, and when. Both empty until somebody does. */
  materialOverrideBy: string;
  materialOverrideAt: string | null;

  createdAt: string;
  updatedAt: string;
}
