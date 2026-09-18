import { Router } from 'express';
import artworkRoutes from '../modules/artwork/artwork.routes.js';
import authRoutes from '../modules/auth/auth.routes.js';
import costingRoutes from '../modules/costing/costing.routes.js';
import customerRoutes from '../modules/customers/customer.routes.js';
import cylinderRoutes from '../modules/cylinders/cylinder.routes.js';
import gstinRoutes from '../modules/gstin/gstin.routes.js';
import inventoryRoutes from '../modules/inventory/inventory.routes.js';
import jobRoutes from '../modules/jobs/job.routes.js';
import jobSheetRoutes from '../modules/job-sheets/job-sheet.routes.js';
import materialRoutes from '../modules/materials/material.routes.js';
import monitorRoutes from '../modules/monitor/monitor.routes.js';
import purchaseRoutes from '../modules/purchase/purchase.routes.js';
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
 * Job sheets — what a run actually cost, as opposed to what it was quoted at.
 * Readable by anyone signed in, because the figure a finished sheet produces is
 * what the office prices repeat work from. Writing needs the jobs module, and
 * taking the material off stock needs inventory as well; both guards are in the
 * module's own routes, next to the endpoints they protect.
 */
router.use('/job-sheets', authenticate, jobSheetRoutes);

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

/*
 * Buying. Readable by anyone signed in — knowing what is on order is part of
 * knowing what the works can commit to. Raising an order needs
 * requireModule('purchase'); recording a delivery needs inventory as well,
 * because it creates stock and should not be reachable through a second door by
 * somebody who may not touch the ledger.
 */
router.use('/purchase', authenticate, purchaseRoutes);

/*
 * The cylinder register. Readable by anyone signed in — whether a design
 * already has a set is what stops a second one being ordered, and the quotation
 * screens ask the same question when deciding whether to charge for cylinders.
 * Registering or moving one needs requireModule('cylinders').
 */
router.use('/cylinders', authenticate, cylinderRoutes);

/*
 * Design artwork. Readable by anyone signed in — the floor works to the file
 * the job prints, and hiding it behind the cylinders module would hide it from
 * exactly the people who need it. Every write needs requireModule('cylinders'),
 * applied in the module's own routes.
 *
 * No endpoint here returns bytes: uploads and downloads are signed Cloudflare
 * URLs the browser uses directly, so a 40 MB artwork never occupies this
 * process.
 */
router.use('/artwork', authenticate, artworkRoutes);

/*
 * Costing master data — the machines and the wages a rate is built from.
 * Readable by anyone signed in, because the quotation wizard costs every line
 * against it; changing it needs requireModule('rates'), since a machine speed
 * or a wage moves the price of every quotation raised afterwards.
 */
router.use('/costing', authenticate, costingRoutes);

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
