import { z } from 'zod';
import { ISSUE_SEVERITIES } from '../lib/quality.js';

const weight = (label: string) =>
  z.coerce
    .number({ message: `Enter the ${label}` })
    .min(0, 'Cannot be negative')
    .max(1_000_000, 'That weight looks wrong — check it');

/**
 * Starting a job at the machine.
 *
 * The operator is insisted on, and it is the only thing that is. A stage that
 * ran with nobody's name against it cannot be asked about afterwards, and the
 * whole reason this screen exists is that the office was typing those names in
 * from memory at the end of the week.
 */
export const startFloorJobSchema = z.object({
  operatorId: z.string().min(1, 'Tap your name first'),
  /** What went on the machine. Zero where the reel has not been weighed yet. */
  inputKg: weight('weight going on').default(0),
});

/** Finishing it: what came off. */
export const finishFloorJobSchema = z.object({
  operatorId: z.string().min(1, 'Tap your name first'),
  outputKg: weight('weight coming off'),
  /** Corrected here too — the reel is often weighed properly only at the end. */
  inputKg: weight('weight going on').optional(),
});

/**
 * Stopping, and saying why.
 *
 * The reason is required on both. A pause with no reason is a machine that
 * stopped for no recorded cause, which is exactly the gap this screen was
 * built to close.
 */
export const holdFloorJobSchema = z.object({
  operatorId: z.string().min(1, 'Tap your name first'),
  kind: z.enum(['PAUSED', 'ISSUE']),
  note: z.string().trim().min(3, 'Say briefly what happened').max(500),
  /**
   * How bad, on a problem. Asked at the machine rather than left for the
   * office, because the operator is the one who can see whether the press is
   * making scrap — and an issues list where everything arrives unclassified
   * is a list nobody can triage.
   *
   * Ignored on a pause: a break is not a defect.
   */
  severity: z.enum(ISSUE_SEVERITIES).default('MEDIUM'),
});

export const resumeFloorJobSchema = z.object({
  operatorId: z.string().min(1, 'Tap your name first'),
  note: z.string().trim().max(500).default(''),
});

export const floorBoardQuerySchema = z.object({
  machineId: z.string().min(1).optional(),
});

export type StartFloorJobInput = z.infer<typeof startFloorJobSchema>;
export type FinishFloorJobInput = z.infer<typeof finishFloorJobSchema>;
export type HoldFloorJobInput = z.infer<typeof holdFloorJobSchema>;
export type ResumeFloorJobInput = z.infer<typeof resumeFloorJobSchema>;
export type FloorBoardQuery = z.infer<typeof floorBoardQuerySchema>;
