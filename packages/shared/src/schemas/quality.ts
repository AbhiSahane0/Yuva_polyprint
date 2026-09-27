import { z } from 'zod';
import { ISSUE_SEVERITIES, ISSUE_STATUSES } from '../lib/quality.js';

const optionalText = (max: number) => z.string().trim().max(max).default('');

/**
 * Raising an issue.
 *
 * The title is insisted on and nothing else is. A defect with no description
 * is a row nobody can act on, and every other field is something the office
 * can fill in once somebody has picked it up.
 */
export const createIssueSchema = z.object({
  productionOrderId: z.string().min(1, 'Choose which job card this is against'),
  /** Null where it was found off the machine — at the checking table. */
  stageId: z.string().min(1).nullable().default(null),
  severity: z.enum(ISSUE_SEVERITIES).default('MEDIUM'),
  title: z.string().trim().min(3, 'Say briefly what is wrong').max(160),
  detail: optionalText(2000),
  /**
   * Finished goods that failed. **Not** waste — waste is what the machine
   * lost and every stage already records it. This is film that was made,
   * weighed, and then could not be sent.
   */
  rejectedKg: z.coerce
    .number()
    .min(0, 'Cannot be negative')
    .max(1_000_000, 'That weight looks wrong — check it')
    .default(0),
  responsibleId: z.string().min(1).nullable().default(null),
});

/**
 * Changing one.
 *
 * Every field optional and none of them defaulted — a patch that moves the
 * severity must not quietly blank the description or put the rejected weight
 * back to nought.
 */
export const updateIssueSchema = z.object({
  severity: z.enum(ISSUE_SEVERITIES).optional(),
  status: z.enum(ISSUE_STATUSES).optional(),
  title: z.string().trim().min(3).max(160).optional(),
  detail: z.string().trim().max(2000).optional(),
  rejectedKg: z.coerce.number().min(0).max(1_000_000).optional(),
  responsibleId: z.string().min(1).nullable().optional(),
  /** Required by the service when the status becomes RESOLVED. */
  resolution: z.string().trim().max(2000).optional(),
});

export const qualityQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  severity: z.enum(ISSUE_SEVERITIES).optional(),
  status: z.enum(ISSUE_STATUSES).optional(),
  openOnly: z
    .union([z.boolean(), z.literal('true'), z.literal('false')])
    .transform((value) => value === true || value === 'true')
    .optional(),
  /** How far back the waste figures look. A fortnight by default. */
  days: z.coerce.number().int().min(1).max(90).default(14),
});

export type CreateIssueInput = z.infer<typeof createIssueSchema>;
export type UpdateIssueInput = z.infer<typeof updateIssueSchema>;
export type QualityQuery = z.infer<typeof qualityQuerySchema>;
