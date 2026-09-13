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
/*
 * Deleting is for a mistake — a name typed wrong, a film added and thought
 * better of. Anything quoted or bought is refused with what is using it,
 * because the record has to stay able to say what it was priced on. Stock is
 * the works' own note of what it holds, so it goes with the material once the
 * caller has said so — `?discardStock=true`, which only the Inventory screen
 * sends, and only after showing how much.
 *
 * Same authority as changing a rate: it is the price list. That is deliberate
 * even though the button also sits on Inventory — somebody who can record a
 * movement should not thereby be able to remove the material it moved.
 */
router.delete(
  '/:id',
  requireModule('rates'),
  validate({ params: idParamSchema }),
  asyncHandler(controller.remove),
);

router.get('/:id/history', validate({ params: idParamSchema }), asyncHandler(controller.history));

export default router;
