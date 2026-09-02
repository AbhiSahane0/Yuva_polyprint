import { Router } from 'express';
import { idParamSchema, saveQuotationJobSchema } from '@yuva/shared';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { ok } from '../../utils/api-response.js';
import { updateJob } from './job.service.js';

/*
 * Creating a job lives under the customer that owns it — see customer.routes —
 * so the mapping is structural rather than something a request body asserts.
 * Updating one only needs the job's own id.
 */
const router = Router();

router.patch(
  '/:id',
  validate({ params: idParamSchema, body: saveQuotationJobSchema }),
  asyncHandler(async (req, res) => {
    ok(res, await updateJob(req.params.id as string, req.body));
  }),
);

export default router;
