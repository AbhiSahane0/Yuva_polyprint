import { Router } from 'express';
import {
  createQuotationSchema,
  idParamSchema,
  listQuotationsQuerySchema,
  recordOutcomeSchema,
  sendQuotationSchema,
  updateQuotationSchema,
} from '@yuva/shared';
import { validate } from '../../middleware/validate.js';
import { emailRateLimiter } from '../../middleware/rate-limit.js';
import { asyncHandler } from '../../utils/async-handler.js';
import * as controller from './quotation.controller.js';

const router = Router();

// Static path first, or "/next-number" would be swallowed by "/:id".
router.get('/next-number', asyncHandler(controller.nextNumber));

router.get('/', validate({ query: listQuotationsQuerySchema }), asyncHandler(controller.list));
router.get('/:id', validate({ params: idParamSchema }), asyncHandler(controller.getById));
router.get('/:id/pdf', validate({ params: idParamSchema }), asyncHandler(controller.pdf));

router.post('/', validate({ body: createQuotationSchema }), asyncHandler(controller.create));
router.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateQuotationSchema }),
  asyncHandler(controller.update),
);
/*
 * Sending is limited more tightly than the rest of the API. It costs money per
 * message, renders a PDF with Chromium first, and is the one endpoint here that
 * reaches outside the company — a runaway loop would be expensive and visible
 * to customers.
 */
router.post(
  '/:id/send',
  emailRateLimiter,
  validate({ params: idParamSchema, body: sendQuotationSchema }),
  asyncHandler(controller.send),
);
router.get(
  '/:id/emails',
  validate({ params: idParamSchema }),
  asyncHandler(controller.emailHistory),
);

/*
 * A revision is a POST that creates a document rather than a PATCH that edits
 * one: the version it came from stays exactly as the customer received it.
 */
router.post(
  '/:id/versions',
  validate({ params: idParamSchema }),
  asyncHandler(controller.createVersion),
);
router.get('/:id/versions', validate({ params: idParamSchema }), asyncHandler(controller.versions));

/*
 * Recording the answer is its own endpoint rather than a status change through
 * PATCH, because winning has consequences: it creates the customer and their
 * jobs. Those belong behind a deliberate action, not a dropdown someone might
 * brush past while editing something else.
 */
router.post(
  '/:id/outcome',
  validate({ params: idParamSchema, body: recordOutcomeSchema }),
  asyncHandler(controller.recordOutcome),
);

router.delete('/:id', validate({ params: idParamSchema }), asyncHandler(controller.remove));

export default router;
