import { Route, Routes } from 'react-router-dom';

/* ---------------------------------------------------------------------------
 * Route map. Feature routes are added here as modules are scoped in:
 *
 *   const OrdersPage = lazy(() => import('@/features/orders/pages/OrdersPage'));
 *   <Route path="/orders" element={<OrdersPage />} />
 *
 * Two shells are expected eventually — the office app (sidebar layout) and the
 * shop-floor operator view (full-screen, large touch targets).
 * ------------------------------------------------------------------------- */

function Placeholder() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-ink-400 text-xs font-semibold tracking-widest uppercase">
        Yuva Polyprint ERP
      </p>
      <h1 className="text-ink-900 text-2xl font-bold sm:text-3xl">Project scaffold is running</h1>
      <p className="text-ink-500 max-w-md text-sm">
        No feature modules are wired up yet. Routes are registered in{' '}
        <code className="bg-ink-100 rounded px-1.5 py-0.5 text-xs">src/app/router.tsx</code>.
      </p>
    </main>
  );
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<Placeholder />} />
      <Route path="*" element={<Placeholder />} />
    </Routes>
  );
}
