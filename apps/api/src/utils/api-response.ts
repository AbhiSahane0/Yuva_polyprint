import type { Response } from 'express';
import { HTTP_STATUS } from '@yuva/shared';
import type { ApiSuccess, Paginated, PaginationMeta } from '@yuva/shared';

/** Wrap a payload in the standard success envelope. */
export function ok<T>(res: Response, data: T, statusCode: number = HTTP_STATUS.OK) {
  const body: ApiSuccess<T> = { success: true, data };
  return res.status(statusCode).json(body);
}

export function created<T>(res: Response, data: T) {
  return ok(res, data, HTTP_STATUS.CREATED);
}

export function noContent(res: Response) {
  return res.status(HTTP_STATUS.NO_CONTENT).send();
}

export function buildPaginationMeta(page: number, pageSize: number, total: number): PaginationMeta {
  const totalPages = pageSize > 0 ? Math.ceil(total / pageSize) : 0;
  return {
    page,
    pageSize,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}

export function paginated<T>(
  res: Response,
  items: T[],
  page: number,
  pageSize: number,
  total: number,
) {
  const body: Paginated<T> = { items, pagination: buildPaginationMeta(page, pageSize, total) };
  return ok(res, body);
}

/**
 * A rendered document, served as a file.
 *
 * `inline` shows it in the browser's own viewer instead of saving it, which is
 * what a preview and a print dialog want — three documents were setting the
 * same four headers, and the one that forgot the framing policy showed the
 * office an empty grey box.
 */
export function pdf(
  res: Response,
  file: Uint8Array,
  filename: string,
  inline: boolean = false,
): void {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `${inline ? 'inline' : 'attachment'}; filename="${filename}"`,
  );
  res.setHeader('Content-Length', String(file.length));
  // Helmet's default policy blocks a same-origin PDF from being framed.
  res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
  res.end(Buffer.from(file));
}
