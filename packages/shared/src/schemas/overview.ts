import { z } from 'zod';

/**
 * How far back the overview's trends look.
 *
 * Three windows rather than a free number: a week is "how is this week going",
 * a fortnight is the default a works thinks in, and a month is the one an owner
 * reports on. Anything between them is a slider nobody moves twice.
 */
export const OVERVIEW_WINDOWS = [7, 14, 30] as const;

export const overviewQuerySchema = z.object({
  days: z.coerce
    .number()
    .int()
    .refine((value) => (OVERVIEW_WINDOWS as readonly number[]).includes(value), {
      message: 'Choose 7, 14 or 30 days',
    })
    .default(14),
});

export type OverviewQuery = z.infer<typeof overviewQuerySchema>;
