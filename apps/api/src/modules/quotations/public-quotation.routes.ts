import { Router } from 'express';
import { quotationTokenParamSchema, respondToQuotationSchema } from '@yuva/shared';
import { validate } from '../../middleware/validate.js';
import { publicLinkRateLimiter } from '../../middleware/rate-limit.js';
import { asyncHandler } from '../../utils/async-handler.js';
import * as controller from './public-quotation.controller.js';

/**
 * **The only unauthenticated routes in this API that touch a document.**
 *
 * Mounted at `/api/public/quotations`. Everything here is reachable by anyone
 * on the internet who has a token, so the guards are the token's shape, the
 * rate limiter, and the narrow projection the service returns — there is no
 * session to fall back on.
 *
 * The limiter is on the router rather than on each route, so a route added
 * here later cannot be the one that is left unbounded.
 */
const router = Router();

router.use(publicLinkRateLimiter);

router.get(
  '/:token',
  validate({ params: quotationTokenParamSchema }),
  asyncHandler(controller.view),
);

router.get(
  '/:token/pdf',
  validate({ params: quotationTokenParamSchema }),
  asyncHandler(controller.pdf),
);

router.post(
  '/:token/respond',
  validate({ params: quotationTokenParamSchema, body: respondToQuotationSchema }),
  asyncHandler(controller.respond),
);

export default router;
