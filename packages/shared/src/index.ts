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
export * from './constants/http.js';
export * from './constants/pagination.js';

export * from './types/api.js';
export * from './types/pagination.js';
export * from './types/customer.js';
export * from './types/quotation.js';

export * from './lib/quotation-math.js';

export * from './schemas/common.js';
export * from './schemas/customer.js';
export * from './schemas/quotation.js';
