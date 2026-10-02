import { Router } from 'express';
import { overviewQuerySchema } from '@yuva/shared';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { ok } from '../../utils/api-response.js';
import { overview } from './overview.service.js';

const router = Router();

/*
 * Open to anyone signed in, and read-only.
 *
 * It summarises screens that each carry their own guard, but every figure on
 * it is a count or a total — nothing here is a rate, a margin or a cost per
 * kilogram, so it gives away nothing the sidebar does not. Gating it would
 * mean the one screen meant to answer "how are we doing" was the one screen
 * half the works could not open.
 */
router.get(
  '/',
  validate({ query: overviewQuerySchema }),
  asyncHandler(async (req, res) => {
    ok(res, await overview(Number((req.query as { days?: number }).days ?? 14)));
  }),
);

export default router;
