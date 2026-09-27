import { Router } from 'express';
import { updateSettingsSchema } from '@yuva/shared';
import { validate } from '../../middleware/validate.js';
import { requireModule } from '../../middleware/authenticate.js';
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

/**
 * **Changing them needs `rates`.**
 *
 * Reading is open — the quotation wizard costs every line against these, so
 * anyone raising a quotation needs them. Writing is not: the default margin,
 * the wastage allowance, the GSM assumptions, the rate model and the works'
 * day cost price **every quotation raised afterwards**, and they were behind
 * nothing but a login. An operator could have moved the margin.
 *
 * The same guard the Costing screen's own figures carry, for the same reason
 * — a machine speed and a default wastage are the same kind of number, and
 * only one of them was protected.
 */
router.patch(
  '/',
  requireModule('rates'),
  validate({ body: updateSettingsSchema }),
  asyncHandler(async (req, res) => {
    ok(res, await updateSettings(req.body));
  }),
);

export default router;
