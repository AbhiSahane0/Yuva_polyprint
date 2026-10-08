import { Router } from 'express';
import {
  endMaintenanceSchema,
  idParamSchema,
  machineBoardQuerySchema,
  startMaintenanceSchema,
} from '@yuva/shared';
import { validate } from '../../middleware/validate.js';
import { requireModule } from '../../middleware/authenticate.js';
import { asyncHandler } from '../../utils/async-handler.js';
import * as controller from './machine.controller.js';

const router = Router();

/*
 * Reading is open to anyone signed in. Which machines are running, which are
 * standing and why is the question the whole works asks across the floor
 * twenty times a day, and the point of the screen is that nobody has to walk
 * over and look.
 *
 * Putting a machine down needs `jobs`, the same permission as recording a
 * stage: it stops work on that machine, which is a fact about production.
 *
 * The machines themselves — their names, speeds and power — stay on the
 * Costing screen behind `rates`, because that is what they are for. This
 * module says where they are, not what they cost.
 */
router.get('/', validate({ query: machineBoardQuerySchema }), asyncHandler(controller.board));
router.get('/:id/history', validate({ params: idParamSchema }), asyncHandler(controller.history));

router.post(
  '/maintenance',
  requireModule('resources'),
  validate({ body: startMaintenanceSchema }),
  asyncHandler(controller.start),
);

router.post(
  '/maintenance/:id/end',
  requireModule('resources'),
  validate({ params: idParamSchema, body: endMaintenanceSchema }),
  asyncHandler(controller.end),
);

export default router;
