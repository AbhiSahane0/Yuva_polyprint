import type { Request, Response } from 'express';
import type { EmployeeInput, ListEmployeesQuery, UpdateEmployeeInput } from '@yuva/shared';
import { created, ok } from '../../utils/api-response.js';
import * as service from './employee.service.js';

export async function list(req: Request, res: Response) {
  ok(res, await service.listEmployees(req.query as unknown as ListEmployeesQuery));
}

export async function getOne(req: Request, res: Response) {
  ok(res, await service.getEmployeeById(req.params.id as string));
}

export async function create(req: Request, res: Response) {
  created(res, await service.createEmployee(req.body as EmployeeInput));
}

export async function update(req: Request, res: Response) {
  ok(res, await service.updateEmployee(req.params.id as string, req.body as UpdateEmployeeInput));
}

export async function remove(req: Request, res: Response) {
  ok(res, await service.deleteEmployee(req.params.id as string));
}
