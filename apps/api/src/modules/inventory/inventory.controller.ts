import type { Request, Response } from 'express';
import type {
  AdjustStockInput,
  IssueStockInput,
  ListStockQuery,
  ReceiveStockInput,
  SetReorderLevelInput,
  TransferStockInput,
} from '@yuva/shared';
import { created, ok } from '../../utils/api-response.js';
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
