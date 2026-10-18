import type { Request, Response } from 'express';
import type { CreateMaterialInput, SaveRatesInput, UpdateMaterialInput } from '@yuva/shared';
import { created, ok, xlsx } from '../../utils/api-response.js';
import { MATERIAL_CATEGORY_LABELS } from '@yuva/shared';
import { buildReport, reportFilename } from '../../lib/report-workbook.js';
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

/**
 * `?discardStock=true` says the caller has seen what stock goes with it.
 *
 * Read as a string the same way `includeInactive` is on the list — a flag that
 * only ever arrives from a dialog that has already shown the figures. Without
 * it, a material holding stock is refused and told where to do this properly.
 */
export async function remove(req: Request, res: Response) {
  const query = req.query as { discardStock?: string };
  ok(
    res,
    await materialService.deleteMaterial(req.params.id as string, {
      discardStock: query.discardStock === 'true',
    }),
  );
}

export async function history(req: Request, res: Response) {
  ok(res, await materialService.getRateHistory(req.params.id as string));
}

export async function saveRates(req: Request, res: Response) {
  ok(res, await materialService.saveRates(req.body as SaveRatesInput));
}

/**
 * The price list, on a day.
 *
 * The works asked for this first and by name — "if we want to print today's
 * rates on a particular day we able to print that sheet". It is the same query
 * the screen ran, at the same date, so the file and the screen cannot differ;
 * and it carries the previous rate beside the current one, because the reason
 * to print a rate sheet is usually to see what moved.
 */
export async function exportList(req: Request, res: Response) {
  const query = req.query as { onDate?: string; includeInactive?: string };
  const onDate = query.onDate ?? null;
  const includeInactive = query.includeInactive === 'true';

  const materials = await materialService.listMaterials({
    ...(onDate ? { onDate } : {}),
    includeInactive,
  });

  const file = await buildReport({
    title: 'Rates',
    asAt: onDate,
    filters: includeInactive ? ['Including retired materials'] : [],
    rows: materials,
    columns: [
      { header: 'Material', width: 38, value: (m) => m.name },
      {
        header: 'Category',
        width: 16,
        value: (m) => MATERIAL_CATEGORY_LABELS[m.category] ?? m.category,
      },
      { header: 'Unit', width: 8, value: (m) => m.unit },
      { header: 'Rate', width: 14, format: 'rs2', value: (m) => m.currentRate },
      { header: 'From', width: 12, format: 'date', value: (m) => asDate(m.currentRateDate) },
      { header: 'Previous', width: 14, format: 'rs2', value: (m) => m.previousRate },
      { header: 'From', width: 12, format: 'date', value: (m) => asDate(m.previousRateDate) },
      { header: 'Change', width: 11, format: 'percent', value: (m) => m.changePercent },
      { header: 'Density', width: 10, format: 'number', value: (m) => m.density },
      { header: 'Usual micron', width: 13, format: 'number', value: (m) => m.usualMicron },
      { header: 'Solids %', width: 10, format: 'number', value: (m) => m.solidsPercent },
      { header: 'Laydown GSM', width: 13, format: 'number', value: (m) => m.laydownGsm },
      { header: 'Priced from', width: 28, value: (m) => m.baseMaterialName },
      { header: 'Premium', width: 12, format: 'rs2', value: (m) => m.ratePremium },
      { header: 'In use', width: 10, value: (m) => (m.isActive ? 'Yes' : 'Retired') },
    ],
  });

  res.setHeader('Cache-Control', 'no-store');
  xlsx(res, file, reportFilename('Rates', onDate));
}

/** A yyyy-mm-dd string as a date Excel will sort and format. Null stays null. */
function asDate(value: string | null): Date | null {
  return value ? new Date(`${value}T00:00:00Z`) : null;
}
