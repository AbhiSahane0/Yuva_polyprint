import { Router } from 'express';
import { monitorRateLimiter } from '../../middleware/rate-limit.js';
import { asyncHandler } from '../../utils/async-handler.js';
import * as controller from './monitor.controller.js';

const router = Router();

/*
 * The limiter sits after the challenge so it only ever counts real attempts —
 * this endpoint tests a password, and is therefore as brute-forceable as the
 * login form. Successful loads are not counted, so refreshing the page is free.
 */
router.get('/', controller.requireChallenge, monitorRateLimiter, asyncHandler(controller.monitor));

export default router;
