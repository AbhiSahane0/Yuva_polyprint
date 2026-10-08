import { Router } from 'express';
import {
  createIssueSchema,
  idParamSchema,
  qualityQuerySchema,
  updateIssueSchema,
} from '@yuva/shared';
import { validate } from '../../middleware/validate.js';
import { requireModule } from '../../middleware/authenticate.js';
import { asyncHandler } from '../../utils/async-handler.js';
import * as controller from './quality.controller.js';

const router = Router();

/*
 * Reading is open to anyone signed in. Where material is being lost and what
 * is still wrong is the whole works' question — the floor is who fixes most of
 * it, and hiding the figures from them is how a waste rate stays where it is.
 *
 * Raising and closing needs `jobs`, the same permission as recording a stage:
 * an issue is a fact about a run, and the machine screen raises them through
 * the same call.
 */
router.get('/', validate({ query: qualityQuerySchema }), asyncHandler(controller.board));
/* Before /:id, or "cards" is read as an issue id. */
router.get('/cards', asyncHandler(controller.targets));
router.get('/:id', validate({ params: idParamSchema }), asyncHandler(controller.getOne));

router.post(
  '/',
  requireModule('production'),
  validate({ body: createIssueSchema }),
  asyncHandler(controller.create),
);

/* Closing one takes a note — see the service. */
router.patch(
  '/:id',
  requireModule('production'),
  validate({ params: idParamSchema, body: updateIssueSchema }),
  asyncHandler(controller.update),
);

export default router;
