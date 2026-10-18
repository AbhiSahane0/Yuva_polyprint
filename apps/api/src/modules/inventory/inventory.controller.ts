import type { Request, Response } from 'express';
import type {
  AdjustStockInput,
  IssueStockInput,
  ListStockQuery,
  ReceiveStockInput,
  SetReorderLevelInput,
  TransferStockInput,
} from '@yuva/shared';
import { created, ok, xlsx } from '../../utils/api-response.js';
import {
  buildReport,
  describe as describeFilters,
  reportFilename,
} from '../../lib/report-workbook.js';
import { MATERIAL_CATEGORY_LABELS } from '@yuva/shared';
import * as inventoryService from './inventory.service.js';

/**
 * Whoever is recording the movement.
 *
 * Falls back to 'Office' rather than failing, matching `entered_by` on rates —
 * a stock movement that cannot be written because a display name is missing
 * would be a worse outcome than one attributed to the office.
 */
const actor = (req: Request): string => req.user?.displayName ?? 'Office';

export async function list(req: Request, res: Response) {
  ok(res, await inventoryService.listStock(req.query as unknown as ListStockQuery));
}

export async function detail(req: Request, res: Response) {
  ok(res, await inventoryService.getMaterialStock(req.params.id as string));
}

export async function receive(req: Request, res: Response) {
  created(res, await inventoryService.receiveStock(req.body as ReceiveStockInput, actor(req)));
}

export async function issue(req: Request, res: Response) {
  created(res, await inventoryService.issueStock(req.body as IssueStockInput, actor(req)));
}

export async function adjust(req: Request, res: Response) {
  created(res, await inventoryService.adjustStock(req.body as AdjustStockInput, actor(req)));
}

export async function transfer(req: Request, res: Response) {
  created(res, await inventoryService.transferStock(req.body as TransferStockInput, actor(req)));
}

export async function setReorderLevel(req: Request, res: Response) {
  ok(
    res,
    await inventoryService.setReorderLevel(
      req.params.id as string,
      req.body as SetReorderLevelInput,
    ),
  );
}

/**
 * Proves the cached quantities agree with the ledger.
 *
 * Admin-only and read-only. Exposed because "the system says 2,450 and the
 * shelf says 2,410" needs an answer that is not "trust it" — this says whether
 * the discrepancy is in the books or on the floor.
 */
export async function reconcile(_req: Request, res: Response) {
  const mismatches = await inventoryService.reconcile();
  ok(res, { balanced: mismatches.length === 0, mismatches });
}

/**
 * What is on the shelf, what is spoken for, and what is actually free.
 *
 * The three are different numbers and the difference is the point: film
 * claimed by an unfinished job card is still on the shelf and still counted.
 */
export async function exportList(req: Request, res: Response) {
  const { items } = await inventoryService.listStock(req.query as unknown as ListStockQuery);

  const file = await buildReport({
    title: 'Stock',
    filters: describeFilters(req.query as Record<string, unknown>),
    rows: items,
    columns: [
      { header: 'Material', width: 38, value: (s) => s.name },
      {
        header: 'Category',
        width: 16,
        value: (s) => MATERIAL_CATEGORY_LABELS[s.category] ?? s.category,
      },
      { header: 'Unit', width: 8, value: (s) => s.unit },
      { header: 'On hand', width: 14, format: 'kg', total: true, value: (s) => s.quantity },
      { header: 'Committed', width: 14, format: 'kg', total: true, value: (s) => s.committed },
      { header: 'Free', width: 14, format: 'kg', total: true, value: (s) => s.free },
      { header: 'Batches', width: 10, format: 'int', value: (s) => s.batchCount },
      { header: 'Reorder at', width: 13, format: 'kg', value: (s) => s.reorderLevel },
      {
        header: 'Low',
        width: 8,
        value: (s) => (s.reorderLevel !== null && s.free <= s.reorderLevel ? 'Yes' : null),
      },
    ],
  });
  res.setHeader('Cache-Control', 'no-store');
  xlsx(res, file, reportFilename('Stock'));
}
