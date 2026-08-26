import { lazy, Suspense } from 'react';
import { LoadingState } from '@/components/ui/LoadingState';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';

// Route-level code splitting keeps the initial bundle small as modules land.
const CustomersPage = lazy(() => import('@/features/customers/pages/CustomersPage'));
const QuotationsPage = lazy(() => import('@/features/quotations/pages/QuotationsPage'));
const RatesPage = lazy(() => import('@/features/rates/pages/RatesPage'));
const QuotationFormPage = lazy(() => import('@/features/quotations/pages/QuotationFormPage'));

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

export function AppRouter() {
  return (
    <AppShell>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/" element={<Navigate to="/customers" replace />} />
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/quotations" element={<QuotationsPage />} />
          <Route path="/rates" element={<RatesPage />} />
          <Route path="/quotations/new" element={<QuotationFormPage />} />
          <Route path="/quotations/:id/edit" element={<QuotationFormPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}
