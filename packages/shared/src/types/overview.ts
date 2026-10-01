import type { MachineKind } from '../lib/rate-costing.js';

/**
 * **The daily control room.**
 *
 * Everything here is read from the screens that own it — the godown figure is
 * Dispatch's, the waste figure is Quality's, the machine states are Machines'.
 * Nothing is recalculated a second way, because an overview that disagreed
 * with the screen it summarises is worse than no overview at all: it makes
 * somebody check both, every time, forever.
 */

/** One link in the chain, with how much is sitting at it. */
export interface ChainLink {
  /** How many documents or jobs are here. */
  count: number;
  /** Kilograms, where the link is about material. Null where it is not. */
  kg: number | null;
  /** What it is worth, where money is meaningful. Null where it is not. */
  value: number | null;
}

/**
 * Something worth doing something about, with somewhere to go and do it.
 *
 * Sorted worst first. Every one of these is derived — there is no alert table
 * anybody maintains, so an alert cannot be stale and cannot be dismissed into
 * silence while the thing it is about is still true.
 */
export interface Alert {
  id: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  /** One line, naming the thing: "Card #5 is short of PE 60µm". */
  title: string;
  /** Where to go and fix it. */
  href: string;
  /** How many of this kind, when it stands for several. */
  count: number;
}

/** One job on the floor, as the board shows it. */
export interface FloorCard {
  cardId: string;
  cardNumber: number;
  orderNumber: number;
  customerName: string;
  jobName: string;
  stage: MachineKind;
  stageLabel: string;
  machineName: string;
  operator: string;
  quantityKg: number;
  progressPercent: number;
  isShort: boolean;
  dueDate: string | null;
  isOverdue: boolean;
}

export interface Overview {
  /** The day this was read, so a screen left open overnight says so. */
  asOf: string;

  /**
   * The chain end to end, in the order a job travels it. The one view that
   * answers "where is everything" without opening seven screens.
   */
  chain: {
    quoted: ChainLink;
    ordered: ChainLink;
    planned: ChainLink;
    onTheFloor: ChainLink;
    inTheGodown: ChainLink;
    dispatchedThisMonth: ChainLink;
  };

  today: {
    outputKg: number;
    wasteKg: number;
    wastePercent: number;
    /** Stages finished today, across the floor. */
    runs: number;
  };

  stock: {
    value: number;
    materialsInStock: number;
    lowStock: number;
  };

  machines: { running: number; idle: number; down: number };

  /** Worst first. Empty when there is genuinely nothing to do. */
  attention: Alert[];

  /** Live production, in stage order. */
  floor: FloorCard[];
}
