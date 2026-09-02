import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import { gstinRateLimiter } from '../../middleware/rate-limit.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { ok } from '../../utils/api-response.js';
import { lookupGstin } from './gstin.service.js';

const router = Router();

const lookupQuerySchema = z.object({
  /**
   * Re-ask the registry even when the answer is cached. The status is the only
   * field that can have changed, so this is for "is this registration still
   * live" — an invoice question, not a quotation one.
   */
  refresh: z
    .enum(['0', '1'])
    .default('0')
    .transform((value) => value === '1'),
});

/*
 * A GET, because it reads. Deliberately not a POST despite costing money: it is
 * idempotent, cacheable, and safe to retry — and pretending otherwise would
 * mean the browser and every proxy between here and there stop knowing that.
 *
 * The rate limiter is what bounds the spend, not the verb.
 */
router.get(
  '/:gstin',
  gstinRateLimiter,
  validate({
    params: z.object({ gstin: z.string().trim().min(1).max(20) }),
    query: lookupQuerySchema,
  }),
  asyncHandler(async (req, res) => {
    const { refresh } = req.query as unknown as { refresh: boolean };
    ok(res, await lookupGstin(req.params.gstin as string, refresh));
  }),
);

export default router;
