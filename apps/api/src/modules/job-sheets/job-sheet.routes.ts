import { Router } from 'express';
import {
  idParamSchema,
  jobSheetQuerySchema,
  jobSheetSchema,
  updateJobSheetSchema,
} from '@yuva/shared';
import { validate } from '../../middleware/validate.js';
import { requireModule } from '../../middleware/authenticate.js';
import { asyncHandler } from '../../utils/async-handler.js';
import * as controller from './job-sheet.controller.js';

const router = Router();

/*
 * Reading is open to anyone signed in: what a job actually cost is the figure
 * the office quotes repeat work from, and hiding it behind the jobs module
 * would hide it from the people raising the quotation.
 *
 * Every write needs the jobs module. Taking material off stock needs inventory
 * as well — it writes real movements against real batches, and it should not be
 * reachable through a second door by somebody who may not touch the ledger.
 */

/* Before `/:id`, or "next-number" is read as an id and answers 404. */
router.get('/next-number', asyncHandler(controller.nextNumber));

router.get('/', validate({ query: jobSheetQuerySchema }), asyncHandler(controller.list));
router.get('/:id', validate({ params: idParamSchema }), asyncHandler(controller.get));

router.post(
  '/',
  requireModule('jobs'),
  validate({ body: jobSheetSchema }),
  asyncHandler(controller.create),
);

router.patch(
  '/:id',
  requireModule('jobs'),
  validate({ params: idParamSchema, body: updateJobSheetSchema }),
  asyncHandler(controller.update),
);

/** Settling the sheet: the cost per kilogram becomes the works' answer. */
router.post(
  '/:id/cost',
  requireModule('jobs'),
  validate({ params: idParamSchema }),
  asyncHandler(controller.cost),
);

/**
 * The one irreversible step. Writes an ISSUE against real batches, oldest
 * first, and closes the sheet to editing — so it needs the ledger's own module
 * on top of jobs.
 */
router.post(
  '/:id/post-to-stock',
  requireModule('jobs'),
  requireModule('inventory'),
  validate({ params: idParamSchema }),
  asyncHandler(controller.post),
);

router.delete(
  '/:id',
  requireModule('jobs'),
  validate({ params: idParamSchema }),
  asyncHandler(controller.remove),
);

export default router;
