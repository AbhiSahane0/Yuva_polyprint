import { Router } from 'express';
import customerRoutes from '../modules/customers/customer.routes.js';

/**
 * The /api router — the single, readable map of the API surface.
 * Health/readiness probes are mounted separately at the root in app.ts so
 * they are never rate-limited or versioned.
 */
const router = Router();

router.use('/customers', customerRoutes);

/* ---------------------------------------------------------------------------
 * Further module routes are registered here as each is scoped in and built:
 *
 *   import orderRoutes from '../modules/orders/order.routes.js';
 *   router.use('/orders', orderRoutes);
 * ------------------------------------------------------------------------- */

export default router;
