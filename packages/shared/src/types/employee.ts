import type { EmployeeActivity, Shift } from '../constants/employees.js';
import type { MachineKind } from '../lib/rate-costing.js';

/** One of the works' people. */
export interface Employee {
  id: string;
  /** What the floor calls them. The only field that is always filled in. */
  name: string;
  /** A short code, where the works uses one. Blank otherwise. */
  code: string;

  /**
   * The costing role they are paid as, when there is one.
   *
   * A link rather than a copy: the wage lives on the role, on the Costing
   * screen, dated — so what a printing operator costs is answered in one place
   * and a rise does not have to be typed onto forty records.
   *
   * Null for the people no costing role describes: the office, the warehouse,
   * a supervisor. Their `roleName` is typed instead.
   */
  roleId: string | null;
  /** The role's name, or free text where there is no role. Never blank. */
  roleName: string;
  /** Which process their role belongs to. Null when they are not on a machine. */
  process: MachineKind | null;

  shift: Shift;
  /** Blank unless somebody typed one. Not required to exist. */
  phone: string;
  /** The day they started, where it is known. */
  joinedOn: string | null;
  /** False once somebody has left. Kept, never deleted — their runs name them. */
  isActive: boolean;

  notes: string;

  createdAt: string;
  updatedAt: string;
}

/**
 * An employee with what they are doing right now hung off them.
 *
 * All four live fields come from the one job card stage that is RUNNING with
 * their name on it. None of them is stored.
 */
export interface EmployeeOnFloor extends Employee {
  activity: EmployeeActivity;
  /** The machine they are stood at, or blank. */
  currentMachine: string;
  /** The stage they are running, or null. */
  currentStage: MachineKind | null;
  /** The job card, and the order behind it. Null when they are not on one. */
  currentCardId: string | null;
  currentCardNumber: number | null;
  currentOrderNumber: number | null;
  currentJobName: string;
}

/** What the screen shows above the list. */
export interface EmployeeTotals {
  onBooks: number;
  working: number;
  available: number;
  /** Active people whose role is tied to a machine process. */
  operators: number;
}

export interface EmployeeList {
  items: EmployeeOnFloor[];
  totals: EmployeeTotals;
}
