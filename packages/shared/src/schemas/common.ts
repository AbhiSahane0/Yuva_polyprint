import { z } from 'zod';
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../constants/pagination.js';

export const idParamSchema = z.object({
  id: z.string().min(1, 'id is required'),
});

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(DEFAULT_PAGE),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export const sortOrderSchema = z.enum(['asc', 'desc']).default('desc');

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(200).optional(),
});

export type IdParam = z.infer<typeof idParamSchema>;
export type PaginationQueryInput = z.infer<typeof paginationQuerySchema>;
export type SortOrder = z.infer<typeof sortOrderSchema>;
