import { Router } from 'express';
import authRoutes from '../modules/auth/auth.routes.js';
import customerRoutes from '../modules/customers/customer.routes.js';
import gstinRoutes from '../modules/gstin/gstin.routes.js';
import inventoryRoutes from '../modules/inventory/inventory.routes.js';
import jobRoutes from '../modules/jobs/job.routes.js';
import materialRoutes from '../modules/materials/material.routes.js';
import monitorRoutes from '../modules/monitor/monitor.routes.js';
import quotationRoutes from '../modules/quotations/quotation.routes.js';
import settingsRoutes from '../modules/settings/settings.routes.js';
import userRoutes from '../modules/users/user.routes.js';
import { authenticate, requireModule } from '../middleware/authenticate.js';

/**
 * The /api router — the single, readable map of the API surface.
 * Health/readiness probes are mounted separately at the root in app.ts so
 * they are never rate-limited or versioned.
 */
const router = Router();

/*
 * Signing in is the only thing you can do without being signed in. Everything
 * below requires a session, and most of it requires access to a named module.
 *
 * The guards live here, on the one page that lists the whole API surface,
 * rather than inside each module's routes. A module added without a guard is
 * visible in this diff; a guard forgotten three files away is not.
 */
router.use('/auth', authRoutes);

router.use('/customers', authenticate, requireModule('customers'), customerRoutes);
router.use('/quotations', authenticate, requireModule('quotations'), quotationRoutes);

/*
 * Jobs are edited from two places — the customer editor and the quotation
 * wizard — so this is gated on customers, the module that owns the data,
 * rather than on whichever screen happens to be open.
 */
router.use('/jobs', authenticate, requireModule('customers'), jobRoutes);

/*
 * Rates are readable by anyone signed in, because quotation costing depends on
 * them and the quotation screens would otherwise break for a user who has
 * quotations but not rates. Changing a rate still needs the rates module —
 * enforced in the module's own routes, where the write endpoint is.
 */
router.use('/materials', authenticate, materialRoutes);

/*
 * Stock, readable by anyone signed in for the same reason rates are: the
 * quotation screens need to know what is on hand, and gating the read would
 * break pricing for a user who has quotations but not inventory. Every write —
 * receive, issue, adjust, transfer — needs the inventory module, and each of
 * those endpoints applies that guard in the module's own routes.
 */
router.use('/inventory', authenticate, inventoryRoutes);

router.use('/settings', authenticate, settingsRoutes);

/*
 * GSTIN lookup. Signed in, but not tied to a module: it is used from the
 * customer form and from the quotation wizard, and gating it on one of those
 * would break it on the other for anyone who has only the second.
 */
router.use('/gstin', authenticate, gstinRoutes);

/** Administrators only — each router applies that guard to itself. */
router.use('/users', userRoutes);
router.use('/monitor', monitorRoutes);

/* ---------------------------------------------------------------------------
 * Further module routes are registered here as each is scoped in and built:
 *
 *   import orderRoutes from '../modules/orders/order.routes.js';
 *   router.use('/orders', orderRoutes);
 * ------------------------------------------------------------------------- */

export default router;
