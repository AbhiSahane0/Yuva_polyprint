import { z } from 'zod';
import { partialWithoutDefaults } from './partial-update.js';
import { MACHINE_KINDS, type CostingInput } from '../lib/rate-costing.js';

/**
 * Costing master data — what the works is, rather than what a job is.
 *
 * Machines and wages are rows because a works adds a press or a shift and
 * should not need a migration to say so. Everything else that a rate is built
 * from is a single figure and lives in settings.
 */

export const machineSchema = z.object({
  name: z.string().trim().min(1, 'Give the machine a name').max(80),
  kind: z.enum(MACHINE_KINDS),
  horsepower: z.coerce
    .number()
    .positive('Connected load must be more than 0')
    .max(10_000, 'That looks wrong — check the horsepower'),
  /**
   * What one printing station adds when its colour is inked.
   *
   * Zero is a fixed load, which is what a laminator or a slitter has. The
   * works' press is a 30 HP drive with three 12 HP station motors, and their
   * own sheet switches those on as colours are added.
   */
  stationHorsepower: z.coerce.number().min(0).max(10_000).default(0),
  /**
   * Which colour brings each station motor on, as "3,4,6".
   *
   * Their sheet uses the 3rd, 4th and 6th. Its own layout implies the 3rd, 5th
   * and 7th, and two of its four references are off by one — the readings agree
   * everywhere except a four-colour job. Editable rather than decided here,
   * because only the works knows which motor is wired to which station.
   */
  stationColourSteps: z
    .string()
    .trim()
    .max(40)
    .regex(/^$|^\d+(\s*,\s*\d+)*$/, 'Colour numbers separated by commas, like 3,4,6')
    .default(''),
  powerRatePerHpHour: z.coerce.number().min(0).max(10_000, 'That looks wrong — check the rate'),
  speedMPerMin: z.coerce
    .number()
    .positive('A machine that runs at 0 never finishes the job')
    .max(10_000),
  setupMinutes: z.coerce.number().int().min(0).max(1440),
  /**
   * Share of the connected load drawn while being set, 0-1.
   *
   * 0 is the default because it is what the works' sheet does — it charges the
   * operator for the setup hour and the machine for nothing. Arguably the
   * press is switched on; equally, one being threaded is not running at its
   * connected load. It is the works' figure to set, and the rate ties out
   * against their own workbook at 0.
   */
  setupPowerFactor: z.coerce.number().min(0).max(1).default(0),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
});

export type MachineInput = z.infer<typeof machineSchema>;
export const updateMachineSchema = partialWithoutDefaults(machineSchema);
export type UpdateMachineInput = z.infer<typeof updateMachineSchema>;

export const labourSchema = z.object({
  role: z.string().trim().min(1, 'Give the role a name').max(80),
  process: z.enum(MACHINE_KINDS),
  monthlySalary: z.coerce.number().min(0).max(10_000_000, 'That looks wrong — check the salary'),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
});

export type LabourInput = z.infer<typeof labourSchema>;
export const updateLabourSchema = partialWithoutDefaults(labourSchema);
export type UpdateLabourInput = z.infer<typeof updateLabourSchema>;

/**
 * A costing sent up to be written out as a spreadsheet.
 *
 * The whole calculation travels rather than a quotation id, because the panel
 * is a calculator: it prices quantities the document may never carry, against
 * colours nobody has committed to. What is on screen is what should download.
 *
 * Loosely typed on purpose — the engine's own types are the contract, and
 * re-declaring forty fields in zod would be a second definition free to drift
 * from the first. `costRate` returns null on anything it cannot cost, which is
 * the validation that matters.
 */
export const costingWorkbookSchema = z.object({
  quotationNumber: z.coerce.number().int().positive().nullable().optional(),
  customerName: z.string().trim().max(200).default(''),
  jobName: z.string().trim().max(200).default(''),
  costing: z.custom<CostingInput>((value) => typeof value === 'object' && value !== null, {
    message: 'The costing is missing',
  }),
});

export type CostingWorkbookInput = z.infer<typeof costingWorkbookSchema>;
