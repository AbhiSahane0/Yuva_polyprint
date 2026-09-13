import type { Request, Response } from 'express';
import type { CreateMaterialInput, SaveRatesInput, UpdateMaterialInput } from '@yuva/shared';
import { created, ok } from '../../utils/api-response.js';
import * as materialService from './material.service.js';

export async function list(req: Request, res: Response) {
  const query = req.query as { onDate?: string; includeInactive?: string };
  ok(
    res,
    await materialService.listMaterials({
      ...(query.onDate ? { onDate: query.onDate } : {}),
      includeInactive: query.includeInactive === 'true',
    }),
  );
}

export async function create(req: Request, res: Response) {
  created(res, await materialService.createMaterial(req.body as CreateMaterialInput));
}

export async function update(req: Request, res: Response) {
  ok(
    res,
    await materialService.updateMaterial(req.params.id as string, req.body as UpdateMaterialInput),
  );
}

export async function remove(req: Request, res: Response) {
  ok(res, await materialService.deleteMaterial(req.params.id as string));
}

export async function history(req: Request, res: Response) {
  ok(res, await materialService.getRateHistory(req.params.id as string));
}

export async function saveRates(req: Request, res: Response) {
  ok(res, await materialService.saveRates(req.body as SaveRatesInput));
}
