import { Router } from 'express';
import {
  createCustomerSchema,
  idParamSchema,
  listCustomersQuerySchema,
  updateCustomerSchema,
} from '@yuva/shared';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/async-handler.js';
import * as controller from './customer.controller.js';

const router = Router();

/*
 * NOTE: these routes are intentionally unauthenticated for now — the auth
 * module does not exist yet, so requiring a token would leave the UI unable to
 * call anything. Add `authenticate` (and `authorize`) here as soon as auth
 * lands; the middleware is already written.
 */

router.get('/', validate({ query: listCustomersQuerySchema }), asyncHandler(controller.list));

router.get('/:id', validate({ params: idParamSchema }), asyncHandler(controller.getById));

router.post('/', validate({ body: createCustomerSchema }), asyncHandler(controller.create));

router.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateCustomerSchema }),
  asyncHandler(controller.update),
);

router.delete('/:id', validate({ params: idParamSchema }), asyncHandler(controller.remove));

export default router;
