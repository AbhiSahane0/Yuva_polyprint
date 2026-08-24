import type { ErrorCode } from '../constants/http.js';

/** Every successful API response is wrapped in this envelope. */
export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiFieldError {
  field: string;
  message: string;
}

/** Every failed API response is wrapped in this envelope. */
export interface ApiFailure {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    /** Present only for VALIDATION_ERROR. */
    fields?: ApiFieldError[];
    /** Correlates a client-side report with a server log line. */
    requestId?: string;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
