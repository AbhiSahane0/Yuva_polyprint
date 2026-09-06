import { Router } from 'express';
import {
  idParamSchema,
  listCylindersQuerySchema,
  recordCylinderEventSchema,
  registerCylindersSchema,
  updateCylinderSchema,
} from '@yuva/shared';
import { validate } from '../../middleware/validate.js';
import { requireModule } from '../../middleware/authenticate.js';
import { asyncHandler } from '../../utils/async-handler.js';
import * as controller from './cylinder.controller.js';

const router = Router();

/*
 * Reading is open to anyone signed in: knowing whether a design already has
 * cylinders is what stops a second set being ordered, and the quotation screens
 * ask the same question when deciding whether to charge for them. Writing needs
 * the cylinders module.
 */

/* Both before `/:id`, or the words are read as job ids and answer 404. */
router.get('/unregistered', asyncHandler(controller.unregistered));
router.get('/out', asyncHandler(controller.out));

router.get('/', validate({ query: listCylindersQuerySchema }), asyncHandler(controller.list));
router.get('/:id', validate({ params: idParamSchema }), asyncHandler(controller.detail));

router.post(
  '/',
  requireModule('cylinders'),
  validate({ body: registerCylindersSchema }),
  asyncHandler(controller.register),
);

router.post(
  '/events',
  requireModule('cylinders'),
  validate({ body: recordCylinderEventSchema }),
  asyncHandler(controller.recordEvent),
);

router.patch(
  '/:id',
  requireModule('cylinders'),
  validate({ params: idParamSchema, body: updateCylinderSchema }),
  asyncHandler(controller.update),
);

/*
 * Deleting a design.
 *
 * Both guards, and deliberately. The screen belongs to the cylinders module,
 * but the thing being destroyed is a job — which the customers module owns,
 * and which is what `/jobs` is gated on. Somebody trusted with the cylinder
 * register is not automatically somebody trusted to delete a customer's design
 * record, and the two questions should not be answered by one tick box.
 */
router.get(
  '/:id/deletion',
  requireModule('cylinders'),
  requireModule('customers'),
  validate({ params: idParamSchema }),
  asyncHandler(controller.deletionImpact),
);

router.delete(
  '/:id',
  requireModule('cylinders'),
  requireModule('customers'),
  validate({ params: idParamSchema }),
  asyncHandler(controller.deleteDesign),
);

export default router;
