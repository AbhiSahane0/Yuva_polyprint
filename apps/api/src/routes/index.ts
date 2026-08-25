import { Router } from 'express';
import customerRoutes from '../modules/customers/customer.routes.js';
import quotationRoutes from '../modules/quotations/quotation.routes.js';
import settingsRoutes from '../modules/settings/settings.routes.js';

/**
 * The /api router — the single, readable map of the API surface.
 * Health/readiness probes are mounted separately at the root in app.ts so
 * they are never rate-limited or versioned.
 */
const router = Router();

router.use('/customers', customerRoutes);
router.use('/quotations', quotationRoutes);
router.use('/settings', settingsRoutes);

/* ---------------------------------------------------------------------------
 * Further module routes are registered here as each is scoped in and built:
 *
 *   import orderRoutes from '../modules/orders/order.routes.js';
 *   router.use('/orders', orderRoutes);
 * ------------------------------------------------------------------------- */

export default router;
