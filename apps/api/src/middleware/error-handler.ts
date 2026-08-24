import type { NextFunction, Request, Response } from 'express';
import { ERROR_CODE, HTTP_STATUS } from '@yuva/shared';
import type { ApiFailure } from '@yuva/shared';
import { ApiError } from '../utils/api-error.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

/** 404 fallback — must be registered after all routes. */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

/**
 * Terminal error handler. Converts anything thrown anywhere in the stack into
 * the standard failure envelope, and makes sure unexpected errors never leak
 * internals to the client.
 */
export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = req.id ? String(req.id) : undefined;

  if (error instanceof ApiError) {
    if (error.statusCode >= 500) {
      logger.error({ err: error, requestId }, error.message);
    } else {
      logger.warn({ requestId, code: error.code }, error.message);
    }

    const body: ApiFailure = {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.fields ? { fields: error.fields } : {}),
        ...(requestId ? { requestId } : {}),
      },
    };
    res.status(error.statusCode).json(body);
    return;
  }

  logger.error({ err: error, requestId }, 'Unhandled error');

  const body: ApiFailure = {
    success: false,
    error: {
      code: ERROR_CODE.INTERNAL_ERROR,
      message: env.isProduction
        ? 'Something went wrong'
        : error instanceof Error
          ? error.message
          : 'Unknown error',
      ...(requestId ? { requestId } : {}),
    },
  };
  res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(body);
}
