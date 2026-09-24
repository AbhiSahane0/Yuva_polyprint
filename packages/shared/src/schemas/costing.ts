import { z } from 'zod';
import { partialWithoutDefaults } from './partial-update.js';
import { MACHINE_KINDS, OVERHEAD_BASES, type CostingInput } from '../lib/rate-costing.js';

/**
 * Costing master data — what the works is, rather than what a job is.
 *
 * Machines and wages are rows because a works adds a press or a shift and
 * should not need a migration to say so. Everything else that a rate is built
 * from is a single figure and lives in settings.
 */

/**
 * Which machine of its kind the costing charges.
 *
 * Its own endpoint and its own tiny schema, so nothing about editing a speed
 * can quietly move a job onto a different machine.
 */
export const defaultMachineSchema = z.object({ isDefault: z.boolean() });
export type DefaultMachineInput = z.infer<typeof defaultMachineSchema>;

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
   * The 3rd, 4th and 6th, which is what their sheet computes and what the
   * operator confirms. Its own layout implies the 3rd, 5th and 7th, and two of
   * its four references are off by one — the readings differ at four colours
   * and at six. Editable, because a rewired press is a fact about the works.
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

/**
 * A wage, and the process it crews.
 *
 * **No dates travel.** A new role is live from today and never from the
 * beginning of time, which would reach back and change the price of every
 * quotation anybody reprices — the same rule the works' own overheads follow.
 * Ending one, or changing what it pays, is what opens the next window; see the
 * costing service.
 */
export const labourSchema = z.object({
  role: z.string().trim().min(1, 'Give the role a name').max(80),
  process: z.enum(MACHINE_KINDS),
  monthlySalary: z.coerce.number().min(0).max(10_000_000, 'That looks wrong — check the salary'),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
});

export type LabourInput = z.infer<typeof labourSchema>;
export const updateLabourSchema = partialWithoutDefaults(labourSchema);
export type UpdateLabourInput = z.infer<typeof updateLabourSchema>;

/**
 * An overhead the works added for itself.
 *
 * Everything else a rate is built from is a figure this engine knows by name.
 * These are not, so each carries the **basis** it is charged on — the engine
 * cannot tell whether "Maintenance 5000" is per job or per kilogram, and the
 * two are three orders of magnitude apart.
 *
 * Negative is allowed. A works that gives a standing rebate on a line of work
 * has recorded a real thing, and refusing it would send them to type a smaller
 * figure somewhere else where nobody can see what they did.
 */
export const costingOverheadSchema = z.object({
  name: z.string().trim().min(1, 'Give the overhead a name').max(80),
  basis: z.enum(OVERHEAD_BASES),
  amount: z.coerce.number().min(-1_000_000).max(1_000_000, 'That looks wrong — check the amount'),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
});

export type CostingOverheadInput = z.infer<typeof costingOverheadSchema>;
export const updateCostingOverheadSchema = partialWithoutDefaults(costingOverheadSchema);
export type UpdateCostingOverheadInput = z.infer<typeof updateCostingOverheadSchema>;

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
