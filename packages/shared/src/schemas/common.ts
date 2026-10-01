import { z } from 'zod';
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../constants/pagination.js';

export const idParamSchema = z.object({
  id: z.string().min(1, 'id is required'),
});

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(DEFAULT_PAGE),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export const sortOrderSchema = z.enum(['asc', 'desc']).default('desc');

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(200).optional(),
});

export type IdParam = z.infer<typeof idParamSchema>;
export type PaginationQueryInput = z.infer<typeof paginationQuerySchema>;
export type SortOrder = z.infer<typeof sortOrderSchema>;

/**
 * A yyyy-mm-dd date that **exists**.
 *
 * The shape on its own is not enough. `2026-02-30` matches the pattern, and
 * every way of turning it into a date — `new Date`, Prisma, Postgres — rolls
 * it forward to 2 March instead of refusing it. A delivery note then carries a
 * date two days after the one somebody typed, with nothing on screen to say
 * so, and the same goes for a planned start, a stock receipt and a job sheet.
 *
 * So the day is put back into yyyy-mm-dd and compared: a date that does not
 * survive the round trip did not exist in the first place.
 */
export function isExistingIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/**
 * The date field every schema should use.
 *
 * `label` goes into the message the office reads — "Enter the dispatch date as
 * yyyy-mm-dd".
 */
export const isoDateSchema = (label: string) =>
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, `Enter the ${label} as yyyy-mm-dd`)
    .refine(isExistingIsoDate, `That ${label} is not a real date`);
