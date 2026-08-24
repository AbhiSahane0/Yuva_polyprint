import { ERROR_CODE, HTTP_STATUS, type ErrorCode } from '@yuva/shared';
import type { ApiFieldError } from '@yuva/shared';

/**
 * The only error type route handlers should throw deliberately.
 * Anything else that escapes is treated as an unexpected 500.
 */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly fields?: ApiFieldError[];
  readonly isOperational = true;

  constructor(statusCode: number, code: ErrorCode, message: string, fields?: ApiFieldError[]) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    if (fields) this.fields = fields;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message = 'Bad request', fields?: ApiFieldError[]) {
    return new ApiError(HTTP_STATUS.BAD_REQUEST, ERROR_CODE.VALIDATION_ERROR, message, fields);
  }

  static validation(message = 'Validation failed', fields?: ApiFieldError[]) {
    return new ApiError(
      HTTP_STATUS.UNPROCESSABLE_ENTITY,
      ERROR_CODE.VALIDATION_ERROR,
      message,
      fields,
    );
  }

  static unauthorized(message = 'Authentication required') {
    return new ApiError(HTTP_STATUS.UNAUTHORIZED, ERROR_CODE.UNAUTHENTICATED, message);
  }

  static forbidden(message = 'You do not have access to this resource') {
    return new ApiError(HTTP_STATUS.FORBIDDEN, ERROR_CODE.FORBIDDEN, message);
  }

  static notFound(message = 'Resource not found') {
    return new ApiError(HTTP_STATUS.NOT_FOUND, ERROR_CODE.NOT_FOUND, message);
  }

  static conflict(message = 'Resource conflict') {
    return new ApiError(HTTP_STATUS.CONFLICT, ERROR_CODE.CONFLICT, message);
  }

  static internal(message = 'Something went wrong') {
    return new ApiError(HTTP_STATUS.INTERNAL_SERVER_ERROR, ERROR_CODE.INTERNAL_ERROR, message);
  }
}
