import axios, { type AxiosError, type AxiosInstance } from 'axios';
import { ERROR_CODE, type ApiFailure, type ApiSuccess, type ErrorCode } from '@yuva/shared';
import { env } from '@/config/env';

/** Normalised error every UI layer can rely on, whatever actually went wrong. */
export class ApiClientError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly fields: Record<string, string>;
  readonly requestId?: string;

  constructor(
    message: string,
    code: ErrorCode,
    status: number,
    fields: Record<string, string> = {},
    requestId?: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.status = status;
    this.fields = fields;
    if (requestId) this.requestId = requestId;
  }
}

/**
 * Joins the configured API base with a path.
 *
 * Pure and exported separately from `apiUrl` so the joining rules are testable
 * without a browser environment.
 */
export function joinApiUrl(base: string, path: string): string {
  const trimmedBase = base.replace(/\/+$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${trimmedBase}${suffix}`;
}

/**
 * An absolute-or-relative URL for an API path, built from the same base the
 * axios client uses.
 *
 * Needed wherever the browser itself fetches a URL rather than going through
 * `apiClient` — an `<object>` embed, a download link, a plain `fetch`. Those
 * bypass the axios instance, so writing `/api/...` by hand there quietly hard
 * codes an assumption that the API is same-origin. That holds in development,
 * where Vite proxies `/api`, and breaks in production the moment
 * `VITE_API_BASE_URL` points somewhere else — which is exactly how the
 * quotation PDF came to 404 against the frontend's own domain while every
 * other call worked.
 *
 * Use this for any API URL that does not go through `apiClient`.
 */
export function apiUrl(path: string): string {
  return joinApiUrl(env.apiBaseUrl, path);
}

export const apiClient: AxiosInstance = axios.create({
  baseURL: env.apiBaseUrl,
  timeout: 30_000,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

/**
 * Token accessor is injected by the auth module once it exists, so this file
 * stays free of any dependency on a specific auth store.
 */
let getAccessToken: () => string | null = () => null;
let onUnauthorized: () => void = () => {};

export function configureAuth(options: {
  getAccessToken: () => string | null;
  onUnauthorized: () => void;
}) {
  getAccessToken = options.getAccessToken;
  onUnauthorized = options.onUnauthorized;
}

apiClient.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiFailure>) => {
    const payload = error.response?.data;
    const status = error.response?.status ?? 0;

    if (status === 401) onUnauthorized();

    if (payload && payload.success === false) {
      const fields = Object.fromEntries(
        (payload.error.fields ?? []).map((field) => [field.field, field.message]),
      );
      return Promise.reject(
        new ApiClientError(
          payload.error.message,
          payload.error.code,
          status,
          fields,
          payload.error.requestId,
        ),
      );
    }

    const message =
      error.code === 'ECONNABORTED'
        ? 'The request timed out. Please try again.'
        : status === 0
          ? 'Cannot reach the server. Check your connection.'
          : (error.message ?? 'Something went wrong');

    return Promise.reject(new ApiClientError(message, ERROR_CODE.INTERNAL_ERROR, status));
  },
);

/** Unwraps the `{ success, data }` envelope so callers deal in plain payloads. */
export async function request<T>(config: Parameters<AxiosInstance['request']>[0]): Promise<T> {
  const response = await apiClient.request<ApiSuccess<T>>(config);
  return response.data.data;
}
