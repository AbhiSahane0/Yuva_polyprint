import { Router } from 'express';
import {
  createCustomerSchema,
  idParamSchema,
  listCustomersQuerySchema,
  saveQuotationJobSchema,
  updateCustomerSchema,
} from '@yuva/shared';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { ok } from '../../utils/api-response.js';
import { createJobForCustomer } from '../jobs/job.service.js';
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

/*
 * One job, saved against this customer.
 *
 * Mounted under the customer on purpose: the owner comes from the path, so a
 * job cannot be attached to the wrong customer by a request that claims
 * otherwise. Idempotent by job name, which is what lets the quotation wizard
 * save a design as the office steps past it without a second click, a stale
 * retry or a browser refresh producing duplicates.
 */
router.post(
  '/:id/jobs',
  validate({ params: idParamSchema, body: saveQuotationJobSchema }),
  asyncHandler(async (req, res) => {
    ok(res, await createJobForCustomer(req.params.id as string, req.body));
  }),
);

router.delete('/:id', validate({ params: idParamSchema }), asyncHandler(controller.remove));

export default router;
