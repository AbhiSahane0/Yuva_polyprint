import { Router } from 'express';
import { z } from 'zod';
import {
  addProductionStageSchema,
  createProductionOrderSchema,
  idParamSchema,
  listProductionQuerySchema,
  overrideMaterialsSchema,
  updateProductionOrderSchema,
  updateProductionStageSchema,
} from '@yuva/shared';
import { validate } from '../../middleware/validate.js';
import { requireModule } from '../../middleware/authenticate.js';
import { asyncHandler } from '../../utils/async-handler.js';
import * as controller from './production.controller.js';

const router = Router();

const stageParamSchema = z.object({ stageId: z.string().min(1) });

/*
 * Reading is open to anyone signed in — a job card is the floor's own document
 * and the office watches it from the other side of the wall.
 *
 * Writing needs `jobs`, the same permission job sheets use: both are records of
 * what a run actually did, kept by the same people.
 */
router.get('/', validate({ query: listProductionQuerySchema }), asyncHandler(controller.list));
router.get('/next-number', asyncHandler(controller.nextNumber));
router.get('/:id', validate({ params: idParamSchema }), asyncHandler(controller.getOne));

router.post(
  '/',
  requireModule('production'),
  validate({ body: createProductionOrderSchema }),
  asyncHandler(controller.create),
);

router.patch(
  '/:id',
  requireModule('production'),
  validate({ params: idParamSchema, body: updateProductionOrderSchema }),
  asyncHandler(controller.update),
);

/* The endpoint the floor actually uses: one stage, as it happens. */
router.patch(
  '/stages/:stageId',
  requireModule('production'),
  validate({ params: stageParamSchema, body: updateProductionStageSchema }),
  asyncHandler(controller.updateStage),
);

router.post(
  '/:id/stages',
  requireModule('production'),
  validate({ params: idParamSchema, body: addProductionStageSchema }),
  asyncHandler(controller.addStage),
);

/*
 * The one way past a material shortage, and it writes down who and why.
 *
 * Its own endpoint rather than a field on the card, so nothing about saving a
 * card can quietly unlock it, and so the decision is one deliberate request
 * that can be read off the log on its own.
 */
router.post(
  '/:id/override',
  requireModule('production'),
  validate({ params: idParamSchema, body: overrideMaterialsSchema }),
  asyncHandler(controller.overrideMaterials),
);

/* Only one nobody has started — see the service. */
router.delete(
  '/:id',
  requireModule('production'),
  validate({ params: idParamSchema }),
  asyncHandler(controller.remove),
);

export default router;
