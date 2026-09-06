import type { CylinderEventKind, CylinderOwnership, CylinderStatus } from '../lib/cylinders.js';

export interface Cylinder {
  id: string;
  code: string;
  jobId: string;
  colour: string;
  position: number | null;
  ownership: CylinderOwnership;
  status: CylinderStatus;
  location: string;
  diameterMm: number | null;
  circumferenceMm: number | null;
  cost: number | null;
  engraver: string;
  engravedOn: string | null;
  notes: string;
  /** When it last moved, so a set nobody has touched is visible as one. */
  lastEventAt: string | null;
  createdAt: string;
}

export interface CylinderEvent {
  id: string;
  cylinderId: string;
  cylinderCode: string;
  kind: CylinderEventKind;
  occurredOn: string;
  statusAfter: CylinderStatus;
  reference: string;
  fromLocation: string;
  toLocation: string;
  notes: string;
  enteredBy: string;
  createdAt: string;
}

/**
 * A design, which is a job, with the set it prints from.
 *
 * Customer, product and colours come from the job — the register does not hold
 * a second copy of any of them.
 */
export interface DesignSummary {
  jobId: string;
  jobCode: string;
  jobName: string;
  customerId: string | null;
  customerName: string | null;
  pouchType: string;
  /** What the job says it needs, against what has actually been registered. */
  expectedCylinders: number | null;
  cylinderCount: number;
  /** The worst state among its cylinders, or NONE when none are registered. */
  status: CylinderStatus | 'NONE';
  /** The numbers, in order, for the list — 'CYL-3301 – 3304'. */
  codes: string[];
  colours: string[];
  locations: string[];
  ownership: CylinderOwnership | 'MIXED' | null;
  /** What the set cost to engrave, where costs were recorded. */
  totalCost: number;
  /** Files on the design, current and superseded. Removed ones do not count. */
  artworkCount: number;
  lastEventAt: string | null;
}

export interface DesignDetail extends DesignSummary {
  cylinders: Cylinder[];
  events: CylinderEvent[];
}

export interface CylinderTotals {
  designs: number;
  cylinders: number;
  inUse: number;
  /** Damaged or needing rework — the ones that stop a job. */
  attention: number;
}

export interface DesignList {
  items: DesignSummary[];
  totals: CylinderTotals;
}

/**
 * What deleting one design would destroy, and what it would leave behind.
 *
 * Fetched before the confirmation is offered rather than described in general
 * terms. "This will delete 8 cylinders and erase 1 file, and 2 quotations will
 * keep their own copy" is a decision somebody can make; "are you sure?" is not.
 */
export interface DesignDeletion {
  jobId: string;
  jobName: string;
  jobCode: string;
  customerName: string | null;

  /** Destroyed with the design. */
  cylinders: number;
  cylinderEvents: number;
  /** Files whose objects are erased from storage. */
  artworkFiles: number;

  /**
   * Kept. A quotation snapshots the design it was priced from — name, geometry
   * and every rate — so the document still reads correctly; only the live link
   * to this design goes.
   */
  quotationLines: number;
  quotationNumbers: number[];

  /**
   * Material issued against this design. Not nullable in practice: a movement
   * naming a job that no longer exists is a hole in the ledger, so this is what
   * refuses the deletion.
   */
  stockMovements: number;

  canDelete: boolean;
  /** Why not, in words the office can act on. Null when it can. */
  blockedReason: string | null;
}

/** What a completed deletion actually did. */
export interface DesignDeleted {
  jobId: string;
  jobName: string;
  cylinders: number;
  artworkFiles: number;
  quotationLinesUnlinked: number;
}
