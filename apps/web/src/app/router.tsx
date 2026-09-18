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
