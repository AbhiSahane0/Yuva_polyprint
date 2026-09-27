import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { APP_MODULES, isAppModule, type User } from '@yuva/shared';
import { LoadingState } from '@/components/ui/LoadingState';
import { AppShell } from '@/components/layout/AppShell';
import {
  AuthBootstrap,
  RequireAdmin,
  RequireAuth,
  RequireModule,
} from '@/features/auth/components/AuthGate';
import { canAccess, useAuthStore } from '@/features/auth/auth-store';

// Route-level code splitting keeps the initial bundle small as modules land.
const LoginPage = lazy(() => import('@/features/auth/pages/LoginPage'));
const CustomersPage = lazy(() => import('@/features/customers/pages/CustomersPage'));
const QuotationsPage = lazy(() => import('@/features/quotations/pages/QuotationsPage'));
const OrdersPage = lazy(() => import('@/features/orders/pages/OrdersPage'));
const OrderPage = lazy(() => import('@/features/orders/pages/OrderPage'));
const NewOrderPage = lazy(() => import('@/features/orders/pages/NewOrderPage'));
const PlanningPage = lazy(() => import('@/features/planning/pages/PlanningPage'));
const FloorPage = lazy(() => import('@/features/floor/pages/FloorPage'));
const QualityPage = lazy(() => import('@/features/quality/pages/QualityPage'));
const DesignsPage = lazy(() => import('@/features/jobs/pages/DesignsPage'));
const MachinesPage = lazy(() => import('@/features/machines/pages/MachinesPage'));
const DispatchPage = lazy(() => import('@/features/dispatch/pages/DispatchPage'));
const DispatchNotePage = lazy(() => import('@/features/dispatch/pages/DispatchNotePage'));
const DispatchFormPage = lazy(() => import('@/features/dispatch/pages/DispatchFormPage'));
const ProductionPage = lazy(() => import('@/features/production/pages/ProductionPage'));
const JobCardPage = lazy(() => import('@/features/production/pages/JobCardPage'));
const EmployeesPage = lazy(() => import('@/features/employees/pages/EmployeesPage'));
const RatesPage = lazy(() => import('@/features/rates/pages/RatesPage'));
const CostingPage = lazy(() => import('@/features/costing/pages/CostingPage'));
const InventoryPage = lazy(() => import('@/features/inventory/pages/InventoryPage'));
const MaterialStockPage = lazy(() => import('@/features/inventory/pages/MaterialStockPage'));
const PurchasePage = lazy(() => import('@/features/purchase/pages/PurchasePage'));
const PurchaseOrderPage = lazy(() => import('@/features/purchase/pages/PurchaseOrderPage'));
const CylindersPage = lazy(() => import('@/features/cylinders/pages/CylindersPage'));
const JobSheetsPage = lazy(() => import('@/features/job-sheets/pages/JobSheetsPage'));
const JobSheetPage = lazy(() => import('@/features/job-sheets/pages/JobSheetPage'));
const DesignPage = lazy(() => import('@/features/cylinders/pages/DesignPage'));
const QuotationFormPage = lazy(() => import('@/features/quotations/pages/QuotationFormPage'));
const UsersPage = lazy(() => import('@/features/users/pages/UsersPage'));
const MonitorPage = lazy(() => import('@/features/monitor/pages/MonitorPage'));

function PageFallback() {
  return <LoadingState />;
}

function NotFound() {
  return (
    <div className="px-4 py-16 text-center">
      <h1 className="text-ink-900 text-lg font-semibold">Page not found</h1>
      <p className="text-ink-500 mt-1 text-sm">That screen does not exist yet.</p>
    </div>
  );
}

/**
 * Where a user lands on sign-in.
 *
 * Not a fixed "/customers": someone with only Rates would be dropped straight
 * onto a page telling them they have no access. Pick the first section they
 * can actually open, and fall back to Users for an admin-shaped account with
 * nothing ticked.
 */
function homeFor(user: User | null): string {
  const first = APP_MODULES.find((module) => canAccess(user, module));
  if (first) return `/${first}`;
  return user?.isAdmin ? '/users' : '/login';
}

/**
 * Whether this user may open a path.
 *
 * Used to vet the page someone was heading for before being asked to sign in.
 * That remembered path belongs to whoever was here last — sign out on Users
 * and sign back in as a storeman, and honouring it blindly lands them on
 * "Administrators only" as their first impression of the app.
 *
 * Unknown paths return false and send them home rather than to a 404.
 */
function mayVisit(user: User | null, path: string): boolean {
  const segment = path.split('/')[1] ?? '';
  if (segment === 'users' || segment === 'monitor') return user?.isAdmin === true;
  if (isAppModule(segment)) return canAccess(user, segment);
  return false;
}

/** Signing in when already signed in should not show the form again. */
function LoginRoute() {
  const user = useAuthStore((state) => state.user);
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  if (user) {
    return <Navigate to={from && mayVisit(user, from) ? from : homeFor(user)} replace />;
  }
  return <LoginPage />;
}

function AppRoutes() {
  const user = useAuthStore((state) => state.user);

  return (
    <AppShell>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/" element={<Navigate to={homeFor(user)} replace />} />

          <Route
            path="/customers"
            element={
              <RequireModule module="customers">
                <CustomersPage />
              </RequireModule>
            }
          />
          <Route
            path="/quotations"
            element={
              <RequireModule module="quotations">
                <QuotationsPage />
              </RequireModule>
            }
          />
          <Route
            path="/quotations/new"
            element={
              <RequireModule module="quotations">
                <QuotationFormPage />
              </RequireModule>
            }
          />
          <Route
            path="/quotations/:id/edit"
            element={
              <RequireModule module="quotations">
                <QuotationFormPage />
              </RequireModule>
            }
          />
          {/*
            Orders are READABLE by anyone signed in — what is due and when is
            the floor's question as much as the office's — so the list and the
            detail carry no module guard. Raising or changing one needs
            `quotations`, which is the desk that makes the commitment, and that
            guard is on the route that does it as well as on the API.
          */}
          <Route path="/orders" element={<OrdersPage />} />
          <Route
            path="/orders/new"
            element={
              <RequireModule module="quotations">
                <NewOrderPage />
              </RequireModule>
            }
          />
          <Route path="/orders/:id" element={<OrderPage />} />

          {/*
            Planning reads like Orders: what is short of film and what each
            machine has coming is the whole works' question, so the board is
            open to anyone signed in. Booking one needs `jobs` — the same
            permission as raising the card, because planning is deciding when
            to raise it — and that guard is on the API, since the board is
            worth reading without it.
          */}
          <Route path="/planning" element={<PlanningPage />} />

          {/*
            Dispatch reads like Orders: what has gone out and what is still in
            the godown is the whole works' question, so the list and a note are
            open to anyone signed in. Loading a lorry needs `dispatch` — its own
            module, because the despatch clerk is not the quotation desk and
            sending goods completes a customer's order.
          */}
          <Route path="/dispatch" element={<DispatchPage />} />
          <Route
            path="/dispatch/new"
            element={
              <RequireModule module="dispatch">
                <DispatchFormPage />
              </RequireModule>
            }
          />
          <Route path="/dispatch/:id" element={<DispatchNotePage />} />
          <Route
            path="/dispatch/:id/edit"
            element={
              <RequireModule module="dispatch">
                <DispatchFormPage />
              </RequireModule>
            }
          />

          {/*
            Job cards are the floor's own document, so reading needs no module —
            the office watches from the other side of the wall and the floor
            needs it open. Recording what a stage did needs `jobs`, and that
            guard is on the API rather than on the route, because the screen is
            useful read-only.
          */}
          <Route path="/production" element={<ProductionPage />} />
          <Route path="/production/:id" element={<JobCardPage />} />
          {/*
            Quality reads like Production: where material is going and what is
            still wrong is the whole works' question, and the floor fixes most
            of it — hiding the figures from them is how a waste rate stays
            where it is. Raising and closing needs `jobs`, guarded on the API.
          */}
          <Route path="/quality" element={<QualityPage />} />
          {/*
            The design master. Gated on `customers`, the module that owns the
            data — the same guard the /jobs API carries, and the same one the
            customer page behind it needs.
          */}
          <Route
            path="/designs"
            element={
              <RequireModule module="customers">
                <DesignsPage />
              </RequireModule>
            }
          />
          {/*
            Machines reads like Production: where each one is and why one is
            standing is what the whole works asks across the floor all day.
            Putting one down needs `jobs`, guarded on the API — what a machine
            COSTS stays on Costing behind `rates`.
          */}
          <Route path="/machines" element={<MachinesPage />} />
          {/* No guard, like Production: the floor reads this to fill in a job
              card. Adding somebody is refused by the API without `jobs`. */}
          <Route path="/employees" element={<EmployeesPage />} />
          <Route
            path="/rates"
            element={
              <RequireModule module="rates">
                <RatesPage />
              </RequireModule>
            }
          />
          {/*
            Costing master data is READ by the quotation wizard, so the guard
            here is the same one rates carries: anyone who can see rates can see
            what a machine minute costs. Changing it is guarded per endpoint.
          */}
          <Route
            path="/costing"
            element={
              <RequireModule module="rates">
                <CostingPage />
              </RequireModule>
            }
          />
          <Route
            path="/inventory"
            element={
              <RequireModule module="inventory">
                <InventoryPage />
              </RequireModule>
            }
          />
          <Route
            path="/inventory/:id"
            element={
              <RequireModule module="inventory">
                <MaterialStockPage />
              </RequireModule>
            }
          />
          <Route
            path="/purchase"
            element={
              <RequireModule module="purchase">
                <PurchasePage />
              </RequireModule>
            }
          />
          <Route
            path="/purchase/:id"
            element={
              <RequireModule module="purchase">
                <PurchaseOrderPage />
              </RequireModule>
            }
          />
          <Route
            path="/cylinders"
            element={
              <RequireModule module="cylinders">
                <CylindersPage />
              </RequireModule>
            }
          />
          <Route
            path="/cylinders/:id"
            element={
              <RequireModule module="cylinders">
                <DesignPage />
              </RequireModule>
            }
          />
          {/*
            Job sheets are guarded on `jobs`, the module that owns production.
            Reading is open on the API because the cost a finished sheet
            produces is what the office quotes repeat work from — but a screen
            is a place to type, so the page itself asks for the write module.
          */}
          <Route
            path="/job-sheets"
            element={
              <RequireModule module="jobs">
                <JobSheetsPage />
              </RequireModule>
            }
          />
          <Route
            path="/job-sheets/:id"
            element={
              <RequireModule module="jobs">
                <JobSheetPage />
              </RequireModule>
            }
          />
          <Route
            path="/users"
            element={
              <RequireAdmin>
                <UsersPage />
              </RequireAdmin>
            }
          />
          <Route
            path="/monitor"
            element={
              <RequireAdmin>
                <MonitorPage />
              </RequireAdmin>
            }
          />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}

export function AppRouter() {
  return (
    <AuthBootstrap>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          {/* Login sits outside the shell — no sidebar to a stranger. */}
          <Route path="/login" element={<LoginRoute />} />
          {/*
            The machine screen sits outside it too, and for the opposite
            reason: the operator is signed in, but a sidebar full of
            quotations and rates is not for them. One tablet, one machine, one
            job — nothing on it that can be pressed by mistake on the way to
            the thing you meant.

            **Deliberately not in the office sidebar.** A tablet screen is
            reached by bookmarking /floor on the tablet, not by a menu item
            next to Production — clicking that from a desk dropped the whole
            app into a full-screen takeover with no way back, which is not
            what anybody meant to do.
          */}
          <Route
            path="/floor"
            element={
              <RequireAuth>
                <FloorPage />
              </RequireAuth>
            }
          />
          <Route
            path="/*"
            element={
              <RequireAuth>
                <AppRoutes />
              </RequireAuth>
            }
          />
        </Routes>
      </Suspense>
    </AuthBootstrap>
  );
}
