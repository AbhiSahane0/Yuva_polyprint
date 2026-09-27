import type { PlanningStatus } from '../lib/planning.js';
import type { OrderStatus } from '../constants/order.js';
import type { MaterialAvailability } from '../lib/material-availability.js';

/** One order on its way to the floor. */
export interface PlanningRow {
  orderId: string;
  orderNumber: number;
  orderStatus: OrderStatus;
  status: PlanningStatus;

  customerId: string | null;
  customerName: string;
  jobName: string;
  customerPoNumber: string;

  quantityKg: number;
  quantityPouches: number;
  dueDate: string | null;
  /** Against today, never stored — see the order's own status comment. */
  isOverdue: boolean;

  /* The plan. The only part of this row that is stored. */
  plannedStart: string | null;
  plannedMachineId: string | null;
  plannedMachineName: string | null;
  planNote: string;
  plannedBy: string;
  plannedAt: string | null;

  /* Worked out, every time. */
  /** Make-ready plus running, on the works' own kilogram fitting. */
  estimateDays: number;
  /** The day it comes off if it starts when planned. Null until it is planned. */
  plannedFinish: string | null;
  landsLate: boolean;
  daysLate: number;

  /**
   * What it needs and what the works can put behind it — the same reel-aware
   * check the job card runs, asked of an order that has no card yet.
   *
   * Empty where the order was typed over the phone rather than priced from a
   * quotation: there is no structure to work a requirement out of, and
   * guessing one would block an order over a film nobody chose.
   */
  materials: MaterialAvailability[];
  /** Names of what is short. Empty when it can run. */
  shortOf: string[];
  /** True where nothing could be worked out — see `materials`. */
  materialUnknown: boolean;

  /** The card, once one exists. Planning is over at that point. */
  cardId: string | null;
  cardNumber: number | null;
}

/** The figures across the top of the planning board. */
export interface PlanningTotals {
  /** Waiting to be dated, film in hand. */
  ready: number;
  scheduled: number;
  /** Cannot run: short of film. The number that changes what anybody does. */
  blocked: number;
  /** Planned to finish after the customer's date. */
  landingLate: number;
  /** Already on the floor — planning is done with them. */
  started: number;
}

export interface PlanningBoard {
  items: PlanningRow[];
  totals: PlanningTotals;
}

/** What one machine has booked onto it. */
export interface MachineLoad {
  machineId: string;
  machineName: string;
  kind: string;
  /** Orders booked onto it, soonest first. */
  orders: {
    orderId: string;
    orderNumber: number;
    customerName: string;
    jobName: string;
    quantityKg: number;
    plannedStart: string;
    plannedFinish: string | null;
    landsLate: boolean;
  }[];
  totalKg: number;
  /** Days of work booked, summed from the estimates. */
  bookedDays: number;
}
