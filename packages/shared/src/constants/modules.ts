/**
 * The parts of the app a user can be given access to.
 *
 * One list, used by three things that must never disagree: the tick boxes on
 * the user editor, the sidebar that decides what to show, and the API guards
 * that decide what to answer. Adding a module here and nowhere else leaves it
 * invisible and unreachable rather than silently open to everyone.
 */
export const APP_MODULES = [
  'customers',
  'quotations',
  'rates',
  'inventory',
  'purchase',
  'jobs',
] as const;

export type AppModule = (typeof APP_MODULES)[number];

export const MODULE_LABELS: Record<AppModule, string> = {
  customers: 'Customers',
  quotations: 'Quotations',
  rates: 'Rates',
  inventory: 'Inventory',
  purchase: 'Purchase & Suppliers',
  jobs: 'Jobs',
};

/** Narrows an arbitrary string to a module key. */
export function isAppModule(value: string): value is AppModule {
  return (APP_MODULES as readonly string[]).includes(value);
}
