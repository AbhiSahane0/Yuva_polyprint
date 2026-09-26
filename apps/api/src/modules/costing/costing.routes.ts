import { Router } from 'express';
import {
  costingOverheadSchema,
  costingWorkbookSchema,
  defaultMachineSchema,
  idParamSchema,
  updateCostingOverheadSchema,
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

/*
 * The costing as a spreadsheet. A POST because the whole calculation travels
 * in the body: it is a calculator, and what is on screen is what downloads —
 * quantities the quotation may never carry, colours nobody has committed to.
 * Anyone who can see a rate can export the working behind it.
 */
router.post(
  '/workbook',
  validate({ body: costingWorkbookSchema }),
  asyncHandler(controller.workbook),
);

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

/*
 * Which machine of its kind the costing charges. Its own endpoint rather than a
 * field on the machine, so nothing about editing a speed can quietly move the
 * job onto a different machine.
 */
router.post(
  '/machines/:id/default',
  requireModule('rates'),
  validate({ params: idParamSchema, body: defaultMachineSchema }),
  asyncHandler(controller.setDefaultMachine),
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

/*
 * Overheads the works added for itself.
 *
 * `end`, not `retire` and not DELETE. The row stays and stops applying from
 * today, because a quotation written while it was live has to go on repricing
 * with it — the same rule a retired machine follows, expressed as a date
 * because these are dated rather than flagged.
 */
router.post(
  '/overheads',
  requireModule('rates'),
  validate({ body: costingOverheadSchema }),
  asyncHandler(controller.createOverhead),
);
router.patch(
  '/overheads/:id',
  requireModule('rates'),
  validate({ params: idParamSchema, body: updateCostingOverheadSchema }),
  asyncHandler(controller.updateOverhead),
);
router.post(
  '/overheads/:id/end',
  requireModule('rates'),
  validate({ params: idParamSchema }),
  asyncHandler(controller.endOverhead),
);

export default router;
