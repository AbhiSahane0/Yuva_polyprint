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
 * NOTE: these routes are open for now — there is no login yet. Auth will be a
 * plain username + password form with a server-side session; guard these
 * routes with that session middleware once it exists.
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
