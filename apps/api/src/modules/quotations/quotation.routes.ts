import { Router } from 'express';
import {
  createQuotationSchema,
  idParamSchema,
  listQuotationsQuerySchema,
  updateQuotationSchema,
} from '@yuva/shared';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/async-handler.js';
import * as controller from './quotation.controller.js';

const router = Router();

// Static path first, or "/next-number" would be swallowed by "/:id".
router.get('/next-number', asyncHandler(controller.nextNumber));

router.get('/', validate({ query: listQuotationsQuerySchema }), asyncHandler(controller.list));
router.get('/:id', validate({ params: idParamSchema }), asyncHandler(controller.getById));
router.get('/:id/preview', validate({ params: idParamSchema }), asyncHandler(controller.preview));
router.get('/:id/pdf', validate({ params: idParamSchema }), asyncHandler(controller.pdf));

router.post('/', validate({ body: createQuotationSchema }), asyncHandler(controller.create));
router.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateQuotationSchema }),
  asyncHandler(controller.update),
);
router.delete('/:id', validate({ params: idParamSchema }), asyncHandler(controller.remove));

export default router;
