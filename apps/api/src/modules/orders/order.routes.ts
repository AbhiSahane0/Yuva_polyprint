import { Router } from 'express';
import {
  createOrderSchema,
  idParamSchema,
  listOrdersQuerySchema,
  updateOrderSchema,
} from '@yuva/shared';
import { validate } from '../../middleware/validate.js';
import { requireModule } from '../../middleware/authenticate.js';
import { asyncHandler } from '../../utils/async-handler.js';
import * as controller from './order.controller.js';

const router = Router();

/*
 * Reading is open to anyone signed in: an order is what the whole works is
 * working towards, and the floor needs to see what is due without being able
 * to change it.
 *
 * Writing needs `quotations` — an order is the commercial commitment a
 * quotation becomes, and it is the same desk that makes both.
 */
router.get('/', validate({ query: listOrdersQuerySchema }), asyncHandler(controller.list));
router.get('/next-number', asyncHandler(controller.nextNumber));
router.get('/:id', validate({ params: idParamSchema }), asyncHandler(controller.getOne));

router.post(
  '/',
  requireModule('orders'),
  validate({ body: createOrderSchema }),
  asyncHandler(controller.create),
);

router.patch(
  '/:id',
  requireModule('orders'),
  validate({ params: idParamSchema, body: updateOrderSchema }),
  asyncHandler(controller.update),
);

/* Only while nobody has started it — see the service. Cancelling is the answer
   for anything further along, and it keeps the record. */
router.delete(
  '/:id',
  requireModule('orders'),
  validate({ params: idParamSchema }),
  asyncHandler(controller.remove),
);

export default router;
