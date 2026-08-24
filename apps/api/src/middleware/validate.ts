import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { z, type ZodType } from 'zod';
import { ApiError } from '../utils/api-error.js';

interface ValidationTargets {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

function toFieldErrors(error: z.ZodError) {
  return error.issues.map((issue) => ({
    field: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
}

/**
 * Validates and — importantly — REPLACES req.body/query/params with the parsed
 * result, so downstream handlers get coerced, defaulted, typed values.
 */
export function validate(targets: ValidationTargets): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (targets.params) req.params = targets.params.parse(req.params) as Request['params'];
      if (targets.query) {
        // Express 5 exposes req.query as a getter; define it instead of assigning.
        Object.defineProperty(req, 'query', {
          value: targets.query.parse(req.query),
          writable: true,
          configurable: true,
        });
      }
      if (targets.body) req.body = targets.body.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        next(ApiError.validation('Validation failed', toFieldErrors(error)));
        return;
      }
      next(error);
    }
  };
}
