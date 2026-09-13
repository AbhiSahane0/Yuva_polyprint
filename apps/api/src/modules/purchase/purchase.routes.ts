import { Router } from 'express';
import {
  closePurchaseLineSchema,
  createPurchaseOrderSchema,
  idParamSchema,
  listPurchaseOrdersQuerySchema,
  listSuppliersQuerySchema,
  receivePurchaseLineSchema,
  supplierSchema,
  updatePurchaseOrderSchema,
  updateSupplierSchema,
} from '@yuva/shared';
import { validate } from '../../middleware/validate.js';
import { requireModule } from '../../middleware/authenticate.js';
import { asyncHandler } from '../../utils/async-handler.js';
import * as controller from './purchase.controller.js';

const router = Router();

/*
 * Reading is open to anyone signed in, matching rates and stock: knowing what
 * is on order is part of knowing what the works can commit to. Every write
 * needs the purchase module, because raising an order commits money and
 * receiving one creates stock.
 */

router.get(
  '/suppliers',
  validate({ query: listSuppliersQuerySchema }),
  asyncHandler(controller.listSuppliers),
);
router.post(
  '/suppliers',
  requireModule('purchase'),
  validate({ body: supplierSchema }),
  asyncHandler(controller.createSupplier),
);
router.patch(
  '/suppliers/:id',
  requireModule('purchase'),
  validate({ params: idParamSchema, body: updateSupplierSchema }),
  asyncHandler(controller.updateSupplier),
);
/*
 * Deleting is for a supplier nobody ordered from — a name typed wrong, or one
 * added and never used. Anyone with an order against them is refused and
 * retired instead, because the order names who it was placed with.
 */
router.delete(
  '/suppliers/:id',
  requireModule('purchase'),
  validate({ params: idParamSchema }),
  asyncHandler(controller.removeSupplier),
);

/* Before `/orders/:id`, or "next-number" is read as an id and answers 404. */
router.get('/orders/next-number', asyncHandler(controller.nextNumber));

router.get(
  '/orders',
  validate({ query: listPurchaseOrdersQuerySchema }),
  asyncHandler(controller.listOrders),
);
router.post(
  '/orders',
  requireModule('purchase'),
  validate({ body: createPurchaseOrderSchema }),
  asyncHandler(controller.createOrder),
);
router.get('/orders/:id', validate({ params: idParamSchema }), asyncHandler(controller.getOrder));
router.patch(
  '/orders/:id',
  requireModule('purchase'),
  validate({ params: idParamSchema, body: updatePurchaseOrderSchema }),
  asyncHandler(controller.updateOrder),
);

/*
 * Receiving needs the inventory module as well as purchase: it creates stock,
 * and somebody who may raise orders but not touch the ledger should not be able
 * to reach it through a different door.
 */
router.post(
  '/receipts',
  requireModule('purchase'),
  requireModule('inventory'),
  validate({ body: receivePurchaseLineSchema }),
  asyncHandler(controller.receive),
);

router.post(
  '/lines/close',
  requireModule('purchase'),
  validate({ body: closePurchaseLineSchema }),
  asyncHandler(controller.closeLine),
);

export default router;
