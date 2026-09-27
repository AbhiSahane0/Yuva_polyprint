import { Router } from 'express';
import { idParamSchema, planningQuerySchema, planOrderSchema } from '@yuva/shared';
import { validate } from '../../middleware/validate.js';
import { requireModule } from '../../middleware/authenticate.js';
import { asyncHandler } from '../../utils/async-handler.js';
import * as controller from './planning.controller.js';

const router = Router();

/*
 * Reading is open to anyone signed in. What is coming, what is short of film
 * and what each machine is in for is the whole works' question — the floor
 * plans its week around it as much as the office does.
 *
 * Booking needs `jobs`, the same permission as raising a job card, and
 * deliberately not a module of its own: planning is deciding when to raise the
 * card, made at the same desk by the same person. A separate permission would
 * be one more box to tick for one more half of one job.
 */
router.get('/', validate({ query: planningQuerySchema }), asyncHandler(controller.board));
/* Before /:id, or "machines" is read as an order id. */
router.get('/machines', asyncHandler(controller.machines));
router.get('/:id', validate({ params: idParamSchema }), asyncHandler(controller.forOrder));

router.put(
  '/:id',
  requireModule('jobs'),
  validate({ params: idParamSchema, body: planOrderSchema }),
  asyncHandler(controller.plan),
);

export default router;
