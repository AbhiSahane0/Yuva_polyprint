import type { Request, Response } from 'express';
import type {
  ClosePurchaseLineInput,
  CreatePurchaseOrderInput,
  ListPurchaseOrdersQuery,
  ListSuppliersQuery,
  ReceivePurchaseLineInput,
  SupplierInput,
  UpdatePurchaseOrderInput,
  UpdateSupplierInput,
} from '@yuva/shared';
import { created, ok } from '../../utils/api-response.js';
import * as purchaseService from './purchase.service.js';

/** Whoever is recording it. Falls back to 'Office', matching rates and stock. */
const actor = (req: Request): string => req.user?.displayName ?? 'Office';

export async function listSuppliers(req: Request, res: Response) {
  ok(res, await purchaseService.listSuppliers(req.query as unknown as ListSuppliersQuery));
}

export async function createSupplier(req: Request, res: Response) {
  created(res, await purchaseService.createSupplier(req.body as SupplierInput));
}

export async function updateSupplier(req: Request, res: Response) {
  ok(
    res,
    await purchaseService.updateSupplier(req.params.id as string, req.body as UpdateSupplierInput),
  );
}

export async function removeSupplier(req: Request, res: Response) {
  ok(res, await purchaseService.deleteSupplier(req.params.id as string));
}

export async function listOrders(req: Request, res: Response) {
  ok(
    res,
    await purchaseService.listPurchaseOrders(req.query as unknown as ListPurchaseOrdersQuery),
  );
}

export async function nextNumber(_req: Request, res: Response) {
  ok(res, { number: await purchaseService.peekNextNumber() });
}

export async function getOrder(req: Request, res: Response) {
  ok(res, await purchaseService.getPurchaseOrder(req.params.id as string));
}

export async function createOrder(req: Request, res: Response) {
  created(
    res,
    await purchaseService.createPurchaseOrder(req.body as CreatePurchaseOrderInput, actor(req)),
  );
}

export async function updateOrder(req: Request, res: Response) {
  ok(
    res,
    await purchaseService.updatePurchaseOrder(
      req.params.id as string,
      req.body as UpdatePurchaseOrderInput,
    ),
  );
}

export async function receive(req: Request, res: Response) {
  created(
    res,
    await purchaseService.receivePurchaseLine(req.body as ReceivePurchaseLineInput, actor(req)),
  );
}

export async function closeLine(req: Request, res: Response) {
  const body = req.body as ClosePurchaseLineInput;
  ok(res, await purchaseService.closePurchaseLine(body.lineId, body.reason));
}
