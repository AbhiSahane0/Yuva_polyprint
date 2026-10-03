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

    /*
     * No envelope came back, so the API never answered — this is the network,
     * a proxy, or the server being down or restarting.
     *
     * Axios' own text for these is "Request failed with status code 502",
     * which is what the works saw on the floor when a save failed. It names
     * nothing anybody can act on and, worse, does not say the thing that
     * matters: the change did not save. A gateway in front of the API answers
     * 502 or 504 on a cold start or a redeploy, so this is not a rare path.
     */
    const message =
      error.code === 'ECONNABORTED'
        ? 'That took too long. Nothing was saved — try again.'
        : status === 0
          ? 'Cannot reach the server. Nothing was saved — check the connection.'
          : status === 502 || status === 503 || status === 504
            ? 'The server is not answering. Nothing was saved — try again in a moment.'
            : status === 429
              ? 'Too many requests at once. Wait a moment and try again.'
              : status >= 500
                ? 'Something went wrong at our end. Nothing was saved — try again.'
                : (error.message ?? 'Something went wrong');

    return Promise.reject(new ApiClientError(message, ERROR_CODE.INTERNAL_ERROR, status));
  },
);

/** Unwraps the `{ success, data }` envelope so callers deal in plain payloads. */
export async function request<T>(config: Parameters<AxiosInstance['request']>[0]): Promise<T> {
  const response = await apiClient.request<ApiSuccess<T>>(config);
  return response.data.data;
}

/**
 * Fetches a file, with the filename the server suggested.
 *
 * Goes through the same axios instance as everything else, which is the whole
 * point: the request interceptor attaches the session token, so exactly one
 * place in the app knows how requests are authenticated. A hand-rolled `fetch`
 * here would need its own copy of that knowledge — and silently answer 401 the
 * day it drifts.
 *
 * This is also why an authenticated file cannot be an `<a href>`. A browser
 * navigation carries cookies but never a custom header, so anything protected
 * has to be fetched by script and handed to the page as a blob.
 */
export async function requestBlob(
  config: Parameters<AxiosInstance['request']>[0],
): Promise<{ blob: Blob; filename: string | null }> {
  const response = await apiClient.request<Blob>({ ...config, responseType: 'blob' });

  const disposition = response.headers['content-disposition'];
  const match = typeof disposition === 'string' ? /filename="?([^";]+)"?/i.exec(disposition) : null;

  return { blob: response.data, filename: match?.[1] ?? null };
}
