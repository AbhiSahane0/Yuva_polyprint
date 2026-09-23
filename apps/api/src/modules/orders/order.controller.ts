import type { Request, Response } from 'express';
import type { CreateOrderInput, ListOrdersQuery, UpdateOrderInput } from '@yuva/shared';
import { created, ok } from '../../utils/api-response.js';
import * as orderService from './order.service.js';

export async function list(req: Request, res: Response) {
  ok(res, await orderService.listOrders(req.query as unknown as ListOrdersQuery));
}

export async function nextNumber(_req: Request, res: Response) {
  ok(res, { number: await orderService.peekNextNumber() });
}

export async function getOne(req: Request, res: Response) {
  ok(res, await orderService.getOrderById(req.params.id as string));
}

export async function create(req: Request, res: Response) {
  created(res, await orderService.createOrder(req.body as CreateOrderInput));
}

export async function update(req: Request, res: Response) {
  ok(res, await orderService.updateOrder(req.params.id as string, req.body as UpdateOrderInput));
}

export async function remove(req: Request, res: Response) {
  ok(res, await orderService.deleteOrder(req.params.id as string));
}
