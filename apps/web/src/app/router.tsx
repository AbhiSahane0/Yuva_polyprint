import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';

// Route-level code splitting keeps the initial bundle small as modules land.
const CustomersPage = lazy(() => import('@/features/customers/pages/CustomersPage'));

function PageFallback() {
  return <div className="text-ink-400 px-4 py-16 text-center text-sm">Loading…</div>;
}

function NotFound() {
  return (
    <div className="px-4 py-16 text-center">
      <h1 className="text-ink-900 text-lg font-semibold">Page not found</h1>
      <p className="text-ink-500 mt-1 text-sm">That screen does not exist yet.</p>
    </div>
  );
}

export function AppRouter() {
  return (
    <AppShell>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/" element={<Navigate to="/customers" replace />} />
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}
