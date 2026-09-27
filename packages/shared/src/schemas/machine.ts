import { z } from 'zod';
import { MAINTENANCE_KINDS } from '../lib/machines.js';

/**
 * Putting a machine down.
 *
 * The reason is required. A machine standing with no recorded cause is the
 * gap the whole module exists to close — and by the time anybody asks on
 * Friday, nobody remembers.
 */
export const startMaintenanceSchema = z.object({
  machineId: z.string().min(1, 'Choose a machine'),
  kind: z.enum(MAINTENANCE_KINDS).default('BREAKDOWN'),
  reason: z.string().trim().min(3, 'Say briefly why it is down').max(500),
  /**
   * When it actually went down, which is not always when somebody got to a
   * screen. Defaults to now.
   */
  startedAt: z.string().datetime().optional(),
});

/**
 * Bringing it back.
 *
 * `workDone` is asked for rather than required: a breakdown that fixed itself
 * is a real thing, and refusing the record would mean the machine stays down
 * on the screen while it runs.
 */
export const endMaintenanceSchema = z.object({
  workDone: z.string().trim().max(1000).default(''),
  endedAt: z.string().datetime().optional(),
});

export const machineBoardQuerySchema = z.object({
  /** How far back the service history goes. A fortnight by default. */
  days: z.coerce.number().int().min(1).max(365).default(14),
});

export type StartMaintenanceInput = z.infer<typeof startMaintenanceSchema>;
export type EndMaintenanceInput = z.infer<typeof endMaintenanceSchema>;
export type MachineBoardQuery = z.infer<typeof machineBoardQuerySchema>;
