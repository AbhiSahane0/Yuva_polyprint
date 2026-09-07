import { Router } from 'express';
import {
  idParamSchema,
  labourSchema,
  machineSchema,
  updateLabourSchema,
  updateMachineSchema,
} from '@yuva/shared';
import { validate } from '../../middleware/validate.js';
import { requireModule } from '../../middleware/authenticate.js';
import { asyncHandler } from '../../utils/async-handler.js';
import * as controller from './costing.controller.js';

const router = Router();

/*
 * Reading is open to anyone signed in, for the same reason rates are: the
 * quotation wizard costs every line against these figures, and gating the read
 * would break pricing for somebody who has quotations but not rates.
 *
 * Changing them needs the rates module. A machine's speed or an operator's
 * wage moves the price of every quotation raised afterwards, which is the same
 * authority a rate change carries.
 */
router.get('/', asyncHandler(controller.masterData));

router.post(
  '/machines',
  requireModule('rates'),
  validate({ body: machineSchema }),
  asyncHandler(controller.createMachine),
);
router.patch(
  '/machines/:id',
  requireModule('rates'),
  validate({ params: idParamSchema, body: updateMachineSchema }),
  asyncHandler(controller.updateMachine),
);
/* Retire, not delete — quotations were costed against it. */
router.post(
  '/machines/:id/retire',
  requireModule('rates'),
  validate({ params: idParamSchema }),
  asyncHandler(controller.retireMachine),
);

router.post(
  '/labour',
  requireModule('rates'),
  validate({ body: labourSchema }),
  asyncHandler(controller.createLabour),
);
router.patch(
  '/labour/:id',
  requireModule('rates'),
  validate({ params: idParamSchema, body: updateLabourSchema }),
  asyncHandler(controller.updateLabour),
);
router.post(
  '/labour/:id/retire',
  requireModule('rates'),
  validate({ params: idParamSchema }),
  asyncHandler(controller.retireLabour),
);

export default router;
