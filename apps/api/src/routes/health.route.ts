import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { ok } from '../utils/api-response.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

/** Liveness — is the process up? Used by the container orchestrator. */
router.get('/', (_req, res) => {
  ok(res, { status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

/** Readiness — can we actually serve traffic (database reachable)? */
router.get(
  '/ready',
  asyncHandler(async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    ok(res, { status: 'ready', database: 'connected' });
  }),
);

export default router;
