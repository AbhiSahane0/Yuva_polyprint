import { Router } from 'express';

/**
 * The /api router — the single, readable map of the API surface.
 * Health/readiness probes are mounted separately at the root in app.ts so
 * they are never rate-limited or versioned.
 */
const router = Router();

/* ---------------------------------------------------------------------------
 * Module routes are registered here as each module is scoped in and built.
 * Convention (see src/modules/README.md):
 *
 *   import orderRoutes from '../modules/orders/order.routes.js';
 *   router.use('/orders', orderRoutes);
 * ------------------------------------------------------------------------- */

export default router;
