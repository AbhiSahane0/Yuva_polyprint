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
  'orders',
  'dispatch',
  'inventory',
  'purchase',
  'rates',
  'costing',
  'planning',
  'production',
  'cylinders',
  'jobs',
  'resources',
] as const;

export type AppModule = (typeof APP_MODULES)[number];

/**
 * What each one is called on the tick list, named after the screen it opens
 * so the owner is choosing sections rather than decoding our words for them.
 */
export const MODULE_LABELS: Record<AppModule, string> = {
  customers: 'Customers & Designs',
  quotations: 'Quotations',
  orders: 'Orders',
  dispatch: 'Dispatch',
  inventory: 'Inventory',
  purchase: 'Purchase & Suppliers',
  rates: 'Rates',
  costing: 'Costing',
  planning: 'Planning',
  production: 'Production & Quality',
  cylinders: 'Cylinder register',
  jobs: 'Job sheets',
  resources: 'Machines & Employees',
};

/**
 * The sections each one opens, for the line under its tick box.
 *
 * Several modules cover more than one screen — Designs belongs with the
 * customer whose artwork it is, and Quality is the same stage as Production —
 * so the tick list says which screens a tick actually turns on rather than
 * leaving the owner to find out by unticking it.
 */
export const MODULE_SECTIONS: Record<AppModule, string> = {
  customers: 'Customers, Designs',
  quotations: 'Quotations',
  orders: 'Orders',
  dispatch: 'Dispatch',
  inventory: 'Inventory',
  purchase: 'Purchase & Suppliers',
  rates: 'Rates',
  costing: 'Wages, machine rates and margins',
  planning: 'Planning',
  production: 'Production, Quality & waste',
  cylinders: 'Cylinder register',
  jobs: 'Job sheets',
  resources: 'Machines, Employees',
};

/** Narrows an arbitrary string to a module key. */
export function isAppModule(value: string): value is AppModule {
  return (APP_MODULES as readonly string[]).includes(value);
}
