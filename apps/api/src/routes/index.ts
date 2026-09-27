import { Router } from 'express';
import artworkRoutes from '../modules/artwork/artwork.routes.js';
import authRoutes from '../modules/auth/auth.routes.js';
import costingRoutes from '../modules/costing/costing.routes.js';
import customerRoutes from '../modules/customers/customer.routes.js';
import cylinderRoutes from '../modules/cylinders/cylinder.routes.js';
import employeeRoutes from '../modules/employees/employee.routes.js';
import gstinRoutes from '../modules/gstin/gstin.routes.js';
import inventoryRoutes from '../modules/inventory/inventory.routes.js';
import jobRoutes from '../modules/jobs/job.routes.js';
import jobSheetRoutes from '../modules/job-sheets/job-sheet.routes.js';
import materialRoutes from '../modules/materials/material.routes.js';
import monitorRoutes from '../modules/monitor/monitor.routes.js';
import orderRoutes from '../modules/orders/order.routes.js';
import dispatchRoutes from '../modules/dispatch/dispatch.routes.js';
import planningRoutes from '../modules/planning/planning.routes.js';
import floorRoutes from '../modules/floor/floor.routes.js';
import qualityRoutes from '../modules/quality/quality.routes.js';
import machineRoutes from '../modules/machines/machine.routes.js';
import productionRoutes from '../modules/production/production.routes.js';
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
 * What the customer actually committed to — the thing between a quotation and
 * a job sheet. Readable by anyone signed in, because what is due and when is
 * the floor's question as much as the office's, and the floor has no business
 * changing it. Writing needs the quotations module: an order is the commercial
 * commitment a quotation becomes, made at the same desk.
 */
router.use('/orders', authenticate, orderRoutes);

/*
 * What left the building. Readable by anyone signed in — what has gone and what
 * is still in the godown is the whole works' question. Writing is its own
 * module: the despatch clerk is not the quotation desk, and posting a note
 * completes a customer's order.
 */
router.use('/dispatches', authenticate, dispatchRoutes);

/*
 * The gate between an order and the floor: what is short of film, what is
 * dated, and what each machine has coming. Readable by anyone signed in, like
 * Orders. Booking one needs `jobs` — planning is deciding when to raise the
 * card, which is the same desk that raises it.
 */
router.use('/planning', authenticate, planningRoutes);

/*
 * The machine screen — one tablet, one machine, one job. Readable by anyone
 * signed in; recording needs `jobs`, the same as recording a stage from the
 * office, because it is the same write through the same service.
 */
router.use('/floor', authenticate, floorRoutes);

/*
 * What went wrong, and where material is being lost. Readable by anyone signed
 * in — the floor fixes most of it, and hiding the figures from them is how a
 * waste rate stays where it is. Raising and closing needs `jobs`.
 */
router.use('/quality', authenticate, qualityRoutes);

/*
 * Where each machine is, and why one is standing. Readable by anyone signed
 * in; putting a machine down needs `jobs`, because it stops work on it. What a
 * machine costs to run stays on Costing behind `rates`.
 */
router.use('/machines', authenticate, machineRoutes);

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
 * Job cards — what the floor actually did, stage by stage. Readable by anyone
 * signed in: it is the floor's own document and the office watches it from the
 * other side of the wall. Writing needs the jobs module, the same permission
 * job sheets use, because both are records of what a run did and both are kept
 * by the same people. The guard is in the module's own routes.
 */
router.use('/production', authenticate, productionRoutes);

/*
 * The works' own people. Readable by anyone signed in, and it has to be: the
 * operator dropdown on a job card is what this module exists for, and gating
 * the list would leave the floor typing names by hand on the one screen it was
 * built for. Writing needs the jobs module — the same permission job cards and
 * job sheets use, because adding an operator is a supervisor's act. It moves no
 * money: the wage stays on the costing role, behind rates.
 */
router.use('/employees', authenticate, employeeRoutes);

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

export default router;
