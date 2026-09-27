/**
 * @yuva/shared — contracts shared by the API and the web client.
 *
 * Keep this package free of feature/domain logic. It holds only things that
 * BOTH sides must agree on: response envelopes, error codes, pagination,
 * role vocabulary, and the zod schemas that validate them.
 *
 * Per-module contracts (orders, production, costing, ...) belong in their own
 * files under `src/schemas` and `src/types` as those modules are scoped in.
 */
export * from './constants/roles.js';
export * from './constants/modules.js';
export * from './constants/job.js';
export * from './constants/job-sheet.js';
export * from './constants/order.js';
export * from './constants/production.js';
export * from './constants/http.js';
export * from './constants/pagination.js';

export * from './types/api.js';
export * from './types/pagination.js';
export * from './types/customer.js';
export * from './types/quotation.js';
export * from './types/material.js';
export * from './types/inventory.js';
export * from './types/purchase.js';
export * from './types/cylinder.js';
export * from './types/artwork.js';
export * from './types/costing.js';
export * from './types/job-sheet.js';
export * from './types/order.js';
export * from './types/production.js';
export * from './types/user.js';
export * from './types/monitor.js';
export * from './types/gstin.js';
export * from './types/dispatch.js';
export * from './types/planning.js';
export * from './types/floor.js';

export * from './lib/quotation-math.js';
export * from './lib/pouch-making.js';
export * from './lib/job-colours.js';
export * from './lib/job-sheet-costing.js';
export * from './constants/employees.js';
export * from './lib/lamination-label.js';
export * from './lib/material-availability.js';
export * from './lib/next-stage.js';
export * from './lib/reel-allocation.js';
export * from './lib/operator-choices.js';
export * from './schemas/employee.js';
export * from './types/employee.js';
export * from './lib/material-cost.js';
export * from './lib/consumable-requirements.js';
export * from './lib/costing-window.js';
export * from './lib/phone.js';
export * from './lib/inventory.js';
export * from './lib/units.js';
export * from './lib/purchase.js';
export * from './lib/cylinders.js';
export * from './lib/artwork.js';
export * from './lib/rate-costing.js';
export * from './lib/gstin.js';
export * from './lib/dispatch.js';
export * from './lib/planning.js';
export * from './lib/floor.js';

export * from './schemas/common.js';
export * from './schemas/partial-update.js';
export * from './schemas/customer.js';
export * from './schemas/quotation.js';
export * from './schemas/order.js';
export * from './schemas/production.js';
export * from './schemas/material.js';
export * from './schemas/inventory.js';
export * from './schemas/purchase.js';
export * from './schemas/cylinder.js';
export * from './schemas/artwork.js';
export * from './schemas/costing.js';
export * from './schemas/job-sheet.js';
export * from './schemas/user.js';
export * from './schemas/dispatch.js';
export * from './schemas/planning.js';
export * from './schemas/floor.js';
