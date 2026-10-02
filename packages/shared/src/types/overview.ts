import type { MachineOutput } from './machine.js';
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

/**
 * One day of the works' output, for the fortnight chart.
 *
 * Quiet days are in the series with zeros rather than left out — a gap in a
 * chart reads as missing data, and a day nothing was finished is a fact about
 * the fortnight rather than an absence of one.
 */
export interface OverviewDay {
  /** yyyy-mm-dd. */
  date: string;
  /** What came off the machines that day. */
  outputKg: number;
  /** What went on, less what came off. */
  wasteKg: number;
  /** Against what went on, so a heavy day and a light one compare. */
  wastePercent: number;
  /** Stages finished. Zero on a quiet day, which is why the bar is empty. */
  runs: number;
}

/** What the fortnight came to, so the chart has a figure beside it. */
export interface OverviewFortnight {
  outputKg: number;
  wasteKg: number;
  wastePercent: number;
  runs: number;
  /** The heaviest day in the window, for the chart's own scale and label. */
  bestDayKg: number;
  /** Days anything was finished at all. */
  workingDays: number;
}

/**
 * A figure with the direction it has moved.
 *
 * The number on its own answers "how much"; the owner's question is "better or
 * worse than last time", and that needs the period before this one. `change` is
 * null where there is no previous period to compare against — a works three
 * days old has no last fortnight, and inventing a 100% rise would be a lie.
 */
export interface Trend {
  value: number;
  /** The same figure over the period before this one. */
  previous: number;
  /** Percent movement, or null where the previous period was empty. */
  change: number | null;
  /** True where a rise is the good direction. Waste is the one that is not. */
  riseIsGood: boolean;
}

/** How the quotation book is converting. */
export interface WinRate {
  sent: number;
  won: number;
  lost: number;
  /** Won against decided — the ones still out do not count either way. */
  percent: number | null;
}

/** An order the owner should know about before the customer rings. */
export interface OrderAtRisk {
  id: string;
  number: number;
  customerName: string;
  jobName: string;
  dueDate: string;
  /** Negative where it is already past. */
  daysLeft: number;
  quantityKg: number;
  /** Still to make and send, in kilograms. */
  pendingKg: number;
  status: string;
  /** Nothing has been raised on the floor for it yet. */
  notStarted: boolean;
}

/** Who the order book is with. */
export interface CustomerShare {
  customerId: string | null;
  customerName: string;
  value: number;
  kg: number;
  orders: number;
  /** Share of the open order book by value, 0 to 100. */
  percent: number;
}

/** Waste at one stage over the window. */
export interface StageWasteShare {
  stage: string;
  label: string;
  wasteKg: number;
  inputKg: number;
  percent: number;
  runs: number;
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

  /** The window everything time-based on this screen is measured over. */
  days: number;

  /**
   * The window, oldest day first. The one thing on this screen that is a shape
   * rather than a number: a works reads a fortnight of output and waste faster
   * than it reads either of today's figures.
   */
  trend: OverviewDay[];
  fortnight: OverviewFortnight;

  /**
   * The five figures an owner wants before anything else, each against the
   * period before it so the direction is visible without doing arithmetic.
   */
  kpis: {
    /** Confirmed and in production, at what it was sold for. */
    orderBook: { value: number; count: number; kg: number };
    /** What has actually left, this calendar month against last. */
    delivered: Trend & { kg: number; count: number };
    /** Kilograms off the machines over the window. */
    output: Trend;
    /** Waste over the window, as a percentage of what went on. */
    waste: Trend;
    /** Orders completed in the window that made their date. */
    onTime: { percent: number | null; onTime: number; late: number; total: number };
  };

  /** How the quotation book converts. */
  winRate: WinRate;

  /** Each machine's share of the window. */
  machineLoad: MachineOutput[];

  /** Where the works is losing film, worst first. */
  wasteByStage: StageWasteShare[];

  /** Who the open order book is with, biggest first. */
  customers: CustomerShare[];

  /** Due soonest first, overdue at the top. */
  atRisk: OrderAtRisk[];

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
