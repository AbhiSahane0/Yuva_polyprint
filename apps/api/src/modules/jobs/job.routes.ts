import { Router } from 'express';
import {
  assignDesignCustomerSchema,
  idParamSchema,
  listDesignsQuerySchema,
  saveQuotationJobSchema,
} from '@yuva/shared';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { ok } from '../../utils/api-response.js';
import { assignDesignCustomer, listDesigns, updateJob } from './job.service.js';

/*
 * Creating a job lives under the customer that owns it — see customer.routes —
 * so the mapping is structural rather than something a request body asserts.
 * Updating one only needs the job's own id.
 */
const router = Router();

/**
 * The design master — every design the works has, searchable.
 *
 * The one list nothing else provides. A design is normally edited on its
 * customer's page, which works for all but the ones that came off the old
 * sheets with nobody's name on them: those belong to no customer, so no
 * customer's page lists them.
 */
router.get(
  '/',
  validate({ query: listDesignsQuerySchema }),
  asyncHandler(async (req, res) => {
    ok(res, await listDesigns(req.query as never));
  }),
);

/** Putting a customer to one of those. The only thing the worklist does. */
router.post(
  '/:id/customer',
  validate({ params: idParamSchema, body: assignDesignCustomerSchema }),
  asyncHandler(async (req, res) => {
    ok(res, await assignDesignCustomer(req.params.id as string, req.body));
  }),
);

router.patch(
  '/:id',
  validate({ params: idParamSchema, body: saveQuotationJobSchema }),
  asyncHandler(async (req, res) => {
    ok(res, await updateJob(req.params.id as string, req.body));
  }),
);

export default router;
