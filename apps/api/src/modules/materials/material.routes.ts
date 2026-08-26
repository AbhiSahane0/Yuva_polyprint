import { Router } from 'express';
import {
  createMaterialSchema,
  idParamSchema,
  saveRatesSchema,
  updateMaterialSchema,
} from '@yuva/shared';
import { validate } from '../../middleware/validate.js';
import { requireModule } from '../../middleware/authenticate.js';
import { asyncHandler } from '../../utils/async-handler.js';
import * as controller from './material.controller.js';

const router = Router();

/*
 * Rates are saved for the whole screen in one request rather than per field.
 * The office keys the morning's rates in as a batch, and a partial save would
 * leave the day half-recorded.
 */
router.put(
  '/rates',
  requireModule('rates'),
  validate({ body: saveRatesSchema }),
  asyncHandler(controller.saveRates),
);

router.get('/', asyncHandler(controller.list));
router.post(
  '/',
  requireModule('rates'),
  validate({ body: createMaterialSchema }),
  asyncHandler(controller.create),
);
router.patch(
  '/:id',
  requireModule('rates'),
  validate({ params: idParamSchema, body: updateMaterialSchema }),
  asyncHandler(controller.update),
);
router.get('/:id/history', validate({ params: idParamSchema }), asyncHandler(controller.history));

export default router;
