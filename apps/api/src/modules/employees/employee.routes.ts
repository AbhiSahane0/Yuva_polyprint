import { Router } from 'express';
import {
  createEmployeeSchema,
  idParamSchema,
  listEmployeesQuerySchema,
  updateEmployeeSchema,
} from '@yuva/shared';
import { validate } from '../../middleware/validate.js';
import { requireModule } from '../../middleware/authenticate.js';
import { asyncHandler } from '../../utils/async-handler.js';
import * as controller from './employee.controller.js';

const router = Router();

/*
 * Reading is open to anyone signed in, and has to be: the operator dropdown on
 * a job card is the whole point of this module, and gating the list would leave
 * the floor typing names by hand on the one screen it was built for.
 *
 * Writing needs `jobs`, the permission the floor's own records use. Adding an
 * operator is a supervisor's act, and it moves no money — the wage stays on the
 * costing role, behind `rates`, where it was.
 */
router.get('/', validate({ query: listEmployeesQuerySchema }), asyncHandler(controller.list));
router.get('/:id', validate({ params: idParamSchema }), asyncHandler(controller.getOne));

router.post(
  '/',
  requireModule('resources'),
  validate({ body: createEmployeeSchema }),
  asyncHandler(controller.create),
);

router.patch(
  '/:id',
  requireModule('resources'),
  validate({ params: idParamSchema, body: updateEmployeeSchema }),
  asyncHandler(controller.update),
);

/* Only somebody nobody's work names — see the service. */
router.delete(
  '/:id',
  requireModule('resources'),
  validate({ params: idParamSchema }),
  asyncHandler(controller.remove),
);

export default router;
