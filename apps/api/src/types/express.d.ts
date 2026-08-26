import type { User } from '@yuva/shared';

declare global {
  namespace Express {
    interface Request {
      /** Set by the `authenticate` middleware. Absent on public routes. */
      user?: User;
      /** The raw bearer token, needed to sign this one session out. */
      sessionToken?: string;
    }
  }
}

export {};
