import type { AccessTokenPayload } from '../middleware/authenticate.js';

declare global {
  namespace Express {
    interface Request {
      /**
       * Set by the `authenticate` middleware.
       * Note: `req.id` (correlation id) is declared by pino-http, not here.
       */
      user?: AccessTokenPayload;
    }
  }
}

export {};
