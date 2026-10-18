import type { Request, Response } from 'express';
import type {
  AddProductionStageInput,
  CreateProductionOrderInput,
  ListProductionQuery,
  OverrideMaterialsInput,
  UpdateProductionOrderInput,
  UpdateProductionStageInput,
} from '@yuva/shared';
import { created, ok, xlsx } from '../../utils/api-response.js';
import {
  buildReport,
  describe as describeFilters,
  EXPORT_LIMIT,
  reportFilename,
} from '../../lib/report-workbook.js';
import { MACHINE_KIND_LABELS, PRODUCTION_STATUS_LABELS } from '@yuva/shared';
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

/** What is on the floor, and how far along. */
export async function exportList(req: Request, res: Response) {
  const query = req.query as unknown as ListProductionQuery;
  const { items } = await service.listProduction({ ...query, page: 1, pageSize: EXPORT_LIMIT });

  const file = await buildReport({
    title: 'Production runs',
    filters: describeFilters(req.query as Record<string, unknown>),
    rows: items,
    columns: [
      { header: 'Run', width: 9, format: 'int', value: (p) => p.number },
      { header: 'Order', width: 9, format: 'int', value: (p) => p.orderNumber },
      { header: 'Customer', width: 30, value: (p) => p.customerName },
      { header: 'Job', width: 34, value: (p) => p.jobName },
      { header: 'Status', width: 13, value: (p) => PRODUCTION_STATUS_LABELS[p.status] ?? p.status },
      { header: 'Quantity kg', width: 13, format: 'kg', total: true, value: (p) => p.quantityKg },
      { header: 'Progress', width: 11, format: 'percent', value: (p) => p.progressPercent },
      {
        header: 'At',
        width: 16,
        value: (p) =>
          p.currentStage ? (MACHINE_KIND_LABELS[p.currentStage] ?? p.currentStage) : null,
      },
      { header: 'Due', width: 12, format: 'date', value: (p) => asDate(p.dueDate) },
      { header: 'Started', width: 12, format: 'date', value: (p) => asDate(p.startedAt) },
      { header: 'Completed', width: 12, format: 'date', value: (p) => asDate(p.completedAt) },
    ],
  });
  res.setHeader('Cache-Control', 'no-store');
  xlsx(res, file, reportFilename('Production runs'));
}

/** A yyyy-mm-dd string as a date Excel will sort and format. Null stays null. */
function asDate(value: string | null | undefined): Date | null {
  return value ? new Date(`${String(value).slice(0, 10)}T00:00:00Z`) : null;
}
