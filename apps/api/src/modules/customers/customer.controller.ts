import type { Request, Response } from 'express';
import type { CreateCustomerInput, ListCustomersQuery, UpdateCustomerInput } from '@yuva/shared';
import { created, ok, paginated } from '../../utils/api-response.js';
import * as customerService from './customer.service.js';

export async function list(req: Request, res: Response) {
  const query = req.query as unknown as ListCustomersQuery;
  const { items, total } = await customerService.listCustomers(query);
  paginated(res, items, query.page, query.pageSize, total);
}

export async function getById(req: Request, res: Response) {
  const customer = await customerService.getCustomerById(req.params.id as string);
  ok(res, customer);
}

export async function create(req: Request, res: Response) {
  const customer = await customerService.createCustomer(req.body as CreateCustomerInput);
  created(res, customer);
}

export async function update(req: Request, res: Response) {
  const customer = await customerService.updateCustomer(
    req.params.id as string,
    req.body as UpdateCustomerInput,
  );
  ok(res, customer);
}

export async function remove(req: Request, res: Response) {
  const result = await customerService.deleteCustomer(req.params.id as string);
  ok(res, result);
}
