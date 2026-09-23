import type { MachineKind, OverheadBasis } from '../lib/rate-costing.js';

export interface Machine {
  id: string;
  name: string;
  kind: MachineKind;
  horsepower: number;
  /** What one printing station adds to the load. Zero is a fixed load. */
  stationHorsepower: number;
  /** Which colour switches each station motor on, as "3,4,6". */
  stationColourSteps: string;
  powerRatePerHpHour: number;
  speedMPerMin: number;
  setupMinutes: number;
  setupPowerFactor: number;
  isActive: boolean;
  sortOrder: number;
}

export interface Labour {
  id: string;
  role: string;
  process: MachineKind;
  monthlySalary: number;

  /**
   * **Dated, like every other costing figure**, and the last one that was not.
   *
   * A single live row with an on/off switch reached backwards: switching the
   * lamination crew on in 2026 re-priced seven quotations written in 2022,
   * because a quotation is costed against whatever the master says now. The
   * half-open window — on or after `effectiveFrom`, strictly before
   * `effectiveTo` — is what stops that.
   */
  effectiveFrom: string;
  /** ISO date, or null while it is still live. The first day it does NOT apply. */
  effectiveTo: string | null;

  /**
   * Derived from `effectiveTo`, never stored.
   *
   * Whether a wage is live is a question about a date, and holding the answer
   * in a second place is how the two come to disagree.
   */
  isActive: boolean;
  sortOrder: number;
}

/**
 * An overhead the works added for itself, as stored.
 *
 * **Dated, like every other costing figure.** `effectiveFrom` is the day it
 * starts applying and `effectiveTo` the day it stops, so a quotation is costed
 * with the overheads that were live on ITS date. That is what lets one be added
 * today without moving a quotation written last year — and what keeps the seven
 * verified 2022 documents reproducing to the paisa.
 *
 * Changing the amount or the basis closes the row and opens a new one rather
 * than editing in place, for the same reason a rate has a history: the figure
 * that priced a document has to stay readable.
 */
export interface CostingOverhead {
  id: string;
  name: string;
  basis: OverheadBasis;
  amount: number;
  /** ISO date. The first day this figure applies. */
  effectiveFrom: string;
  /** ISO date, or null while it is still live. The first day it does NOT. */
  effectiveTo: string | null;
  sortOrder: number;
}

/** Everything the browser needs to cost a rate, in one request. */
export interface CostingMasterData {
  machines: Machine[];
  labour: Labour[];
  /** Live today. Ones that have been ended come with `includeRetired`. */
  overheads: CostingOverhead[];
}
