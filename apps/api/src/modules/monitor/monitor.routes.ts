import { Router } from 'express';
import { authenticate, requireAdmin } from '../../middleware/authenticate.js';
import { asyncHandler } from '../../utils/async-handler.js';
import * as controller from './monitor.controller.js';

const router = Router();

/** Administrators only. Sign-in data is nobody else's business. */
router.get('/', authenticate, requireAdmin, asyncHandler(controller.monitor));

export default router;
