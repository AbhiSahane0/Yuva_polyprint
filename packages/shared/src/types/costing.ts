import type { MachineKind } from '../lib/rate-costing.js';

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
  isActive: boolean;
  sortOrder: number;
}

/** Everything the browser needs to cost a rate, in one request. */
export interface CostingMasterData {
  machines: Machine[];
  labour: Labour[];
}
