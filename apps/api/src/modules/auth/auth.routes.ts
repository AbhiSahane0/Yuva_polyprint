import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { changePasswordSchema, loginSchema } from '@yuva/shared';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/authenticate.js';
import { asyncHandler } from '../../utils/async-handler.js';
import * as controller from './auth.controller.js';

const router = Router();

/*
 * Sign-in is rate limited far harder than the rest of the API. It is the one
 * endpoint where an attacker gets unlimited free guesses, and scrypt makes each
 * attempt expensive for us too — so this protects the CPU as well as the
 * account. Successful logins are not counted, so the office cannot lock itself
 * out by working normally.
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many attempts. Try again in a few minutes.' },
  },
});

router.post(
  '/login',
  loginLimiter,
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
