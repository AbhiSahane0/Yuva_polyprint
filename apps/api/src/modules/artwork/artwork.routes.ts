import { Router } from 'express';
import {
  idParamSchema,
  listArtworkQuerySchema,
  requestArtworkUploadSchema,
  updateArtworkSchema,
} from '@yuva/shared';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import { requireModule } from '../../middleware/authenticate.js';
import { asyncHandler } from '../../utils/async-handler.js';
import * as controller from './artwork.controller.js';

const router = Router();

const jobParamSchema = z.object({ jobId: z.string().min(1) });

/*
 * Reading is open to anyone signed in, as the register is: the production floor
 * needs to see the artwork a job prints, and gating that on the cylinders
 * module would hide it from the people who work to it. Uploading, refiling and
 * removing need the cylinders module, which is where designs are owned.
 *
 * Note there is no endpoint that returns file bytes. Every read is a signed
 * Cloudflare URL, minted per request and expiring in minutes.
 */

router.get(
  '/job/:jobId',
  validate({ params: jobParamSchema, query: listArtworkQuerySchema }),
  asyncHandler(controller.listForJob),
);

router.get('/:id/link', validate({ params: idParamSchema }), asyncHandler(controller.link));

router.post(
  '/uploads',
  requireModule('cylinders'),
  validate({ body: requestArtworkUploadSchema }),
  asyncHandler(controller.requestUpload),
);

/* Called by the browser once its PUT to R2 succeeds. */
router.post(
  '/:id/confirm',
  requireModule('cylinders'),
  validate({ params: idParamSchema }),
  asyncHandler(controller.confirmUpload),
);

router.patch(
  '/:id',
  requireModule('cylinders'),
  validate({ params: idParamSchema, body: updateArtworkSchema }),
  asyncHandler(controller.update),
);

router.post(
  '/:id/restore',
  requireModule('cylinders'),
  validate({ params: idParamSchema }),
  asyncHandler(controller.restore),
);

router.delete(
  '/:id',
  requireModule('cylinders'),
  validate({ params: idParamSchema }),
  asyncHandler(controller.remove),
);

/*
 * Erasing the file for good — a separate path, not a flag on the line above.
 * A query parameter that turns "hide it" into "erase a customer's artwork" is
 * one typo away from a file nobody can get back, and it would not show up in
 * this table at all.
 */
router.delete(
  '/:id/file',
  requireModule('cylinders'),
  validate({ params: idParamSchema }),
  asyncHandler(controller.purge),
);

export default router;
