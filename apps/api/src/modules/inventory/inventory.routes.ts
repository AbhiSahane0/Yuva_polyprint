import { Router } from 'express';
import {
  adjustStockSchema,
  idParamSchema,
  issueStockSchema,
  listStockQuerySchema,
  receiveStockSchema,
  setReorderLevelSchema,
  transferStockSchema,
} from '@yuva/shared';
import { validate } from '../../middleware/validate.js';
import { requireAdmin, requireModule } from '../../middleware/authenticate.js';
import { asyncHandler } from '../../utils/async-handler.js';
import * as controller from './inventory.controller.js';

const router = Router();

/*
 * Reading stock is open to anyone signed in, the same as reading rates: the
 * figures are needed to quote, and gating them would mean the office cannot
 * price a job without a second permission. Every write needs the inventory
 * module, because a movement changes what the works believes it holds.
 */
router.get('/', validate({ query: listStockQuerySchema }), asyncHandler(controller.list));

/*
 * Before `/:id`, or "reconcile" is read as a material id and answers 404.
 */
router.get('/reconcile', requireAdmin, asyncHandler(controller.reconcile));

router.get('/:id', validate({ params: idParamSchema }), asyncHandler(controller.detail));

router.post(
  '/receive',
  requireModule('inventory'),
  validate({ body: receiveStockSchema }),
  asyncHandler(controller.receive),
);

router.post(
  '/issue',
  requireModule('inventory'),
  validate({ body: issueStockSchema }),
  asyncHandler(controller.issue),
);

router.post(
  '/adjust',
  requireModule('inventory'),
  validate({ body: adjustStockSchema }),
  asyncHandler(controller.adjust),
);

router.post(
  '/transfer',
  requireModule('inventory'),
  validate({ body: transferStockSchema }),
  asyncHandler(controller.transfer),
);

router.patch(
  '/:id/reorder-level',
  requireModule('inventory'),
  validate({ params: idParamSchema, body: setReorderLevelSchema }),
  asyncHandler(controller.setReorderLevel),
);

export default router;
