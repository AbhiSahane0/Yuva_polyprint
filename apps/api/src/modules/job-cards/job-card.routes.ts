import { Router } from 'express';
import {
  idParamSchema,
  jobCardQuerySchema,
  jobCardSchema,
  updateJobCardSchema,
} from '@yuva/shared';
import { validate } from '../../middleware/validate.js';
import { requireModule } from '../../middleware/authenticate.js';
import { asyncHandler } from '../../utils/async-handler.js';
import * as controller from './job-card.controller.js';

const router = Router();

/*
 * Reading is open to anyone signed in — a job card is the instruction the
 * floor works from, and a setter who cannot read his own card is back on
 * paper. Writing one needs the jobs module.
 */

/* Before `/:id`, or "next-number" is read as an id and answers 404. */
router.get('/next-number', asyncHandler(controller.nextNumber));

router.get('/', validate({ query: jobCardQuerySchema }), asyncHandler(controller.list));
router.get('/:id', validate({ params: idParamSchema }), asyncHandler(controller.get));
/** The printed card. Reading, not writing: the floor is handed its own paper. */
router.get('/:id/print', validate({ params: idParamSchema }), asyncHandler(controller.print));

router.post(
  '/',
  requireModule('jobs'),
  validate({ body: jobCardSchema }),
  asyncHandler(controller.create),
);

router.patch(
  '/:id',
  requireModule('jobs'),
  validate({ params: idParamSchema, body: updateJobCardSchema }),
  asyncHandler(controller.update),
);

router.delete(
  '/:id',
  requireModule('jobs'),
  validate({ params: idParamSchema }),
  asyncHandler(controller.remove),
);

export default router;
