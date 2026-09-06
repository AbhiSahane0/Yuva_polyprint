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
