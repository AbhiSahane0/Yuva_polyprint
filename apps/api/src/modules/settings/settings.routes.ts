import { Router } from 'express';
import { updateSettingsSchema } from '@yuva/shared';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { ok } from '../../utils/api-response.js';
import { getSettings, updateSettings } from './settings.service.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    /* `?onDate=yyyy-mm-dd` asks what the works held then, for repricing an
     * older quotation on the screen the same way the server would. */
    const onDate = typeof req.query.onDate === 'string' ? req.query.onDate : undefined;
    ok(res, await getSettings(onDate));
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
