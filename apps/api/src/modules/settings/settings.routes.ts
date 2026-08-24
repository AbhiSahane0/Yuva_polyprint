import { Router } from 'express';
import { updateSettingsSchema } from '@yuva/shared';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { ok } from '../../utils/api-response.js';
import { getSettings, updateSettings } from './settings.service.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    ok(res, await getSettings());
  }),
);

router.patch(
  '/',
  validate({ body: updateSettingsSchema }),
  asyncHandler(async (req, res) => {
    ok(res, await updateSettings(req.body));
  }),
);

export default router;
