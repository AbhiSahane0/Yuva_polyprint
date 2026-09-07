import { z } from 'zod';
import { MACHINE_KINDS } from '../lib/rate-costing.js';

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
  powerRatePerHpHour: z.coerce.number().min(0).max(10_000, 'That looks wrong — check the rate'),
  speedMPerMin: z.coerce
    .number()
    .positive('A machine that runs at 0 never finishes the job')
    .max(10_000),
  setupMinutes: z.coerce.number().int().min(0).max(1440),
  /**
   * 0 charges nothing for setup power, as the client's sheet does; 1 charges
   * the full connected load. Neither is right for a press being threaded.
   */
  setupPowerFactor: z.coerce.number().min(0).max(1).default(1),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
});

export type MachineInput = z.infer<typeof machineSchema>;
export const updateMachineSchema = machineSchema.partial();
export type UpdateMachineInput = z.infer<typeof updateMachineSchema>;

export const labourSchema = z.object({
  role: z.string().trim().min(1, 'Give the role a name').max(80),
  process: z.enum(MACHINE_KINDS),
  monthlySalary: z.coerce.number().min(0).max(10_000_000, 'That looks wrong — check the salary'),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
});

export type LabourInput = z.infer<typeof labourSchema>;
export const updateLabourSchema = labourSchema.partial();
export type UpdateLabourInput = z.infer<typeof updateLabourSchema>;
