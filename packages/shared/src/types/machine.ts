import type { MachineState, MaintenanceKind } from '../lib/machines.js';
import type { MachineKind } from '../lib/rate-costing.js';

/** One spell of a machine being down. */
export interface MaintenanceRecord {
  id: string;
  number: number;
  machineId: string;
  machineName: string;
  kind: MaintenanceKind;
  reason: string;
  startedAt: string;
  /** Null while it is still down. This is the whole state of the record. */
  endedAt: string | null;
  /** Minutes. Counted to now while it is open. */
  minutes: number;
  workDone: string;
  reportedBy: string;
  closedBy: string;
}

/** A machine, as the floor sees it right now. */
export interface MachineCard {
  id: string;
  name: string;
  kind: MachineKind;
  /** The works' own order of the floor, so the cards read left to right. */
  position: number;
  state: MachineState;

  /** What is on it. Null when nothing is. */
  job: {
    stageId: string;
    cardId: string;
    cardNumber: number;
    orderNumber: number;
    customerName: string;
    jobName: string;
    stageLabel: string;
    operator: string;
    startedAt: string | null;
  } | null;

  /* Today, from the stages that finished on it. Nothing stored. */
  outputKg: number;
  wasteKg: number;
  wastePercent: number;
  runs: number;
  /** Minutes standing today: pauses, problems, and any time down. */
  standingMinutes: number;

  /** The spell it is down for, if it is. */
  down: MaintenanceRecord | null;
  /** What it has coming, from Planning. */
  booked: number;
  /** Retired machines still cost old quotations; they do not run new work. */
  isActive: boolean;
}

export interface MachineBoard {
  machines: MachineCard[];
  totals: {
    running: number;
    idle: number;
    down: number;
    /** Everything the floor got through today, across every machine. */
    outputKg: number;
    /** Minutes standing today, added across the floor. */
    standingMinutes: number;
  };
  /** Recently closed spells, newest first — the service history. */
  history: MaintenanceRecord[];
}

/**
 * One machine's output over a window of days, for the owner's view.
 *
 * Separate from `MachineCard`, which is today and carries what is on the
 * machine right now, and from Planning's `MachineLoad`, which is what a
 * machine has coming. This is the fortnight behind: who earned their keep.
 */
export interface MachineOutput {
  id: string;
  name: string;
  kind: MachineKind;
  outputKg: number;
  wasteKg: number;
  wastePercent: number;
  runs: number;
  isDown: boolean;
}
