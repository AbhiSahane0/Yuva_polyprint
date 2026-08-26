import { Router } from 'express';
import { changePasswordSchema, loginSchema } from '@yuva/shared';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authRateLimiter } from '../../middleware/rate-limit.js';
import { asyncHandler } from '../../utils/async-handler.js';
import * as controller from './auth.controller.js';

const router = Router();

/*
 * Sign-in is the only endpoint an attacker can hammer with unlimited free
 * guesses, so it uses the tighter limiter rather than the baseline one — see
 * middleware/rate-limit.ts.
 */
router.post(
  '/login',
  authRateLimiter,
  validate({ body: loginSchema }),
  asyncHandler(controller.login),
);
router.post('/logout', authenticate, asyncHandler(controller.logout));
router.get('/me', authenticate, controller.me);
router.post(
  '/change-password',
  authenticate,
  validate({ body: changePasswordSchema }),
  asyncHandler(controller.changePassword),
);

export default router;
