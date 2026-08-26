import { Router } from 'express';
import {
  createUserSchema,
  idParamSchema,
  resetPasswordSchema,
  updateUserSchema,
} from '@yuva/shared';
import { validate } from '../../middleware/validate.js';
import { authenticate, requireAdmin } from '../../middleware/authenticate.js';
import { asyncHandler } from '../../utils/async-handler.js';
import * as controller from './user.controller.js';

const router = Router();

// Every route here is administrators only, so the guard is applied once to the
// whole router rather than repeated per line where one could be forgotten.
router.use(authenticate, requireAdmin);

router.get('/', asyncHandler(controller.list));
router.post('/', validate({ body: createUserSchema }), asyncHandler(controller.create));
router.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateUserSchema }),
  asyncHandler(controller.update),
);
router.post(
  '/:id/password',
  validate({ params: idParamSchema, body: resetPasswordSchema }),
  asyncHandler(controller.resetPassword),
);
router.delete('/:id', validate({ params: idParamSchema }), asyncHandler(controller.remove));

export default router;
