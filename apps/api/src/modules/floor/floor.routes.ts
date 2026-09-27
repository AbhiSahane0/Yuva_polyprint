import { Router } from 'express';
import {
  finishFloorJobSchema,
  floorBoardQuerySchema,
  holdFloorJobSchema,
  resumeFloorJobSchema,
  startFloorJobSchema,
} from '@yuva/shared';
import { validate } from '../../middleware/validate.js';
import { requireModule } from '../../middleware/authenticate.js';
import { asyncHandler } from '../../utils/async-handler.js';
import * as controller from './floor.controller.js';

const router = Router();

/*
 * The machine screen. Reading is open to anyone signed in, like Production —
 * the tablet at the press and the supervisor watching from the office are
 * looking at the same thing.
 *
 * Recording needs `jobs`, exactly as recording a stage from the office screen
 * does. It is the same write, through the same service, and it would be odd
 * for the tablet to need less.
 *
 * **The tablet signs in as one shared account and the operator taps their own
 * name.** So the name on a stage is who the floor says ran it, not who is
 * signed in — which is why every write carries an operator and the service
 * insists on one.
 */
router.get('/machines', asyncHandler(controller.machines));
router.get('/', validate({ query: floorBoardQuerySchema }), asyncHandler(controller.board));

router.post(
  '/:stageId/start',
  requireModule('jobs'),
  validate({ body: startFloorJobSchema }),
  asyncHandler(controller.start),
);

router.post(
  '/:stageId/finish',
  requireModule('jobs'),
  validate({ body: finishFloorJobSchema }),
  asyncHandler(controller.finish),
);

/* Pause and problem both land here — they stop the job the same way, and the
   difference is what the log says afterwards. */
router.post(
  '/:stageId/hold',
  requireModule('jobs'),
  validate({ body: holdFloorJobSchema }),
  asyncHandler(controller.hold),
);

router.post(
  '/:stageId/resume',
  requireModule('jobs'),
  validate({ body: resumeFloorJobSchema }),
  asyncHandler(controller.resume),
);

export default router;
