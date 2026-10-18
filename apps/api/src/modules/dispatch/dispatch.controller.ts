import type { Request, Response } from 'express';
import type {
  CancelDispatchInput,
  CreateDispatchInput,
  ListDispatchesQuery,
  PostDispatchInput,
  ReadyToSendQuery,
  UpdateDispatchInput,
} from '@yuva/shared';
import { created, ok, xlsx } from '../../utils/api-response.js';
import {
  buildReport,
  describe as describeFilters,
  EXPORT_LIMIT,
  reportFilename,
} from '../../lib/report-workbook.js';
import { DISPATCH_STATUS_LABELS } from '@yuva/shared';
import * as dispatchService from './dispatch.service.js';

/** Who sent it. A delivery nobody's name is against is one nobody can be asked about. */
const actor = (req: Request): string => req.user?.displayName ?? 'Office';

export async function list(req: Request, res: Response) {
  ok(res, await dispatchService.listDispatches(req.query as unknown as ListDispatchesQuery));
}

export async function nextNumber(_req: Request, res: Response) {
  ok(res, { number: await dispatchService.peekNextNumber() });
}

/** The godown queue — what is made and still standing on the floor. */
export async function ready(req: Request, res: Response) {
  ok(res, await dispatchService.readyToSend(req.query as unknown as ReadyToSendQuery));
}

export async function getOne(req: Request, res: Response) {
  ok(res, await dispatchService.getDispatchById(req.params.id as string));
}

export async function create(req: Request, res: Response) {
  created(res, await dispatchService.createDispatch(req.body as CreateDispatchInput, actor(req)));
}

export async function update(req: Request, res: Response) {
  ok(
    res,
    await dispatchService.updateDispatch(req.params.id as string, req.body as UpdateDispatchInput),
  );
}

export async function post(req: Request, res: Response) {
  ok(
    res,
    await dispatchService.postDispatch(
      req.params.id as string,
      req.body as PostDispatchInput,
      actor(req),
    ),
  );
}

export async function cancel(req: Request, res: Response) {
  ok(
    res,
    await dispatchService.cancelDispatch(
      req.params.id as string,
      req.body as CancelDispatchInput,
      actor(req),
    ),
  );
}

export async function remove(req: Request, res: Response) {
  ok(res, await dispatchService.deleteDispatch(req.params.id as string));
}

/** What left the works, and on whose lorry. */
export async function exportList(req: Request, res: Response) {
  const query = req.query as unknown as ListDispatchesQuery;
  const { items } = await dispatchService.listDispatches({
    ...query,
    page: 1,
    pageSize: EXPORT_LIMIT,
  });

  const file = await buildReport({
    title: 'Dispatch',
    filters: describeFilters(req.query as Record<string, unknown>),
    rows: items,
    columns: [
      { header: 'No.', width: 9, format: 'int', value: (d) => d.number },
      { header: 'Date', width: 12, format: 'date', value: (d) => asDate(d.dispatchDate) },
      { header: 'Customer', width: 32, value: (d) => d.customerName },
      { header: 'Status', width: 13, value: (d) => DISPATCH_STATUS_LABELS[d.status] ?? d.status },
      { header: 'Lines', width: 8, format: 'int', value: (d) => d.lineCount },
      { header: 'Packages', width: 10, format: 'int', total: true, value: (d) => d.packageCount },
      { header: 'Kg', width: 13, format: 'kg', total: true, value: (d) => d.totalKg },
      { header: 'Pouches', width: 13, format: 'int', total: true, value: (d) => d.totalPouches },
      { header: 'Value', width: 15, format: 'rs', total: true, value: (d) => d.totalValue },
      { header: 'Vehicle', width: 14, value: (d) => d.vehicleNumber },
      { header: 'Transporter', width: 22, value: (d) => d.transporter },
      { header: 'LR no.', width: 14, value: (d) => d.lrNumber },
      { header: 'Raised by', width: 18, value: (d) => d.raisedBy },
    ],
  });
  res.setHeader('Cache-Control', 'no-store');
  xlsx(res, file, reportFilename('Dispatch'));
}

/** A yyyy-mm-dd string as a date Excel will sort and format. Null stays null. */
function asDate(value: string | null | undefined): Date | null {
  return value ? new Date(`${String(value).slice(0, 10)}T00:00:00Z`) : null;
}
