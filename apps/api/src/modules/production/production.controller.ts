import type { Request, Response } from 'express';
import type {
  AddProductionStageInput,
  CreateProductionOrderInput,
  ListProductionQuery,
  OverrideMaterialsInput,
  UpdateProductionOrderInput,
  UpdateProductionStageInput,
} from '@yuva/shared';
import { created, ok } from '../../utils/api-response.js';
import * as service from './production.service.js';

/** Whose name goes on an override. The same reading job sheets use. */
const actor = (req: Request): string => req.user?.displayName ?? 'Office';

export async function list(req: Request, res: Response) {
  ok(res, await service.listProduction(req.query as unknown as ListProductionQuery));
}

export async function nextNumber(_req: Request, res: Response) {
  ok(res, { number: await service.peekNextNumber() });
}

export async function getOne(req: Request, res: Response) {
  ok(res, await service.getProductionById(req.params.id as string));
}

export async function create(req: Request, res: Response) {
  created(res, await service.createProduction(req.body as CreateProductionOrderInput));
}

export async function update(req: Request, res: Response) {
  ok(
    res,
    await service.updateProduction(req.params.id as string, req.body as UpdateProductionOrderInput),
  );
}

export async function updateStage(req: Request, res: Response) {
  ok(
    res,
    await service.updateStage(req.params.stageId as string, req.body as UpdateProductionStageInput),
  );
}

export async function addStage(req: Request, res: Response) {
  created(
    res,
    await service.addStage(req.params.id as string, req.body as AddProductionStageInput),
  );
}

export async function overrideMaterials(req: Request, res: Response) {
  const body = req.body as OverrideMaterialsInput;
  ok(res, await service.overrideMaterials(req.params.id as string, { ...body, by: actor(req) }));
}

export async function remove(req: Request, res: Response) {
  ok(res, await service.deleteProduction(req.params.id as string));
}
