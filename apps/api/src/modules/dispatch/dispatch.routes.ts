import { Router } from 'express';
import {
  cancelDispatchSchema,
  createDispatchSchema,
  idParamSchema,
  listDispatchesQuerySchema,
  postDispatchSchema,
  readyToSendQuerySchema,
  updateDispatchSchema,
} from '@yuva/shared';
import { validate } from '../../middleware/validate.js';
import { requireModule } from '../../middleware/authenticate.js';
import { asyncHandler } from '../../utils/async-handler.js';
import * as controller from './dispatch.controller.js';

const router = Router();

/*
 * Reading is open to anyone signed in. What has gone out and what is still
 * standing in the godown is the whole works' question — the office chasing a
 * customer, the floor deciding what to run next — and none of them need to be
 * able to send a lorry to ask it.
 *
 * Writing needs `dispatch`, which is its own module rather than borrowed from
 * quotations: the despatch clerk is not the quotation desk, and sending goods
 * is not something a costing user should be able to do by virtue of costing.
 */
router.get('/', validate({ query: listDispatchesQuerySchema }), asyncHandler(controller.list));
router.get('/next-number', asyncHandler(controller.nextNumber));
/* Before /:id, or "ready" is read as an id. */
router.get('/ready', validate({ query: readyToSendQuerySchema }), asyncHandler(controller.ready));
router.get('/:id', validate({ params: idParamSchema }), asyncHandler(controller.getOne));

router.post(
  '/',
  requireModule('dispatch'),
  validate({ body: createDispatchSchema }),
  asyncHandler(controller.create),
);

/* Only while it is a draft — see the service. */
router.patch(
  '/:id',
  requireModule('dispatch'),
  validate({ params: idParamSchema, body: updateDispatchSchema }),
  asyncHandler(controller.update),
);

/* The one call that settles an order. */
router.post(
  '/:id/dispatch',
  requireModule('dispatch'),
  validate({ params: idParamSchema, body: postDispatchSchema }),
  asyncHandler(controller.post),
);

/* Including a lorry that went and came back, which gives the order back. */
router.post(
  '/:id/cancel',
  requireModule('dispatch'),
  validate({ params: idParamSchema, body: cancelDispatchSchema }),
  asyncHandler(controller.cancel),
);

router.delete(
  '/:id',
  requireModule('dispatch'),
  validate({ params: idParamSchema }),
  asyncHandler(controller.remove),
);

export default router;
