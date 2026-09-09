import type { Request, Response } from 'express';
import type {
  LabourInput,
  MachineInput,
  UpdateLabourInput,
  UpdateMachineInput,
} from '@yuva/shared';
import { costRate, type CostingWorkbookInput } from '@yuva/shared';
import { created, ok } from '../../utils/api-response.js';
import { ApiError } from '../../utils/api-error.js';
import { buildEstimationWorkbook } from './estimation-workbook.js';
import * as costingService from './costing.service.js';

export async function masterData(req: Request, res: Response) {
  const includeRetired = req.query.includeRetired === 'true';
  ok(res, await costingService.getMasterData(includeRetired));
}

export async function createMachine(req: Request, res: Response) {
  created(res, await costingService.createMachine(req.body as MachineInput));
}

export async function updateMachine(req: Request, res: Response) {
  ok(
    res,
    await costingService.updateMachine(req.params.id as string, req.body as UpdateMachineInput),
  );
}

export async function retireMachine(req: Request, res: Response) {
  ok(res, await costingService.retireMachine(req.params.id as string));
}

export async function createLabour(req: Request, res: Response) {
  created(res, await costingService.createLabour(req.body as LabourInput));
}

export async function updateLabour(req: Request, res: Response) {
  ok(
    res,
    await costingService.updateLabour(req.params.id as string, req.body as UpdateLabourInput),
  );
}

export async function retireLabour(req: Request, res: Response) {
  ok(res, await costingService.retireLabour(req.params.id as string));
}

/**
 * The costing as a spreadsheet, in the works' own Estimation layout.
 *
 * The whole input comes up in the request rather than being read back from a
 * quotation, because the costing is a calculator: it prices quantities the
 * document may never carry, against colours nobody has committed to. What is
 * on screen is what should download.
 */
export async function workbook(req: Request, res: Response) {
  const body = req.body as CostingWorkbookInput;

  const result = costRate(body.costing);
  if (result === null) throw ApiError.badRequest('That job cannot be costed yet');

  const file = await buildEstimationWorkbook(body.costing, result, {
    quotationNumber: body.quotationNumber ?? null,
    customerName: body.customerName,
    jobName: body.jobName,
    date: new Date(),
  });

  const name = `Costing ${body.jobName || 'quotation'}`.replace(/[^\w -]+/g, '').slice(0, 60);
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader('Content-Disposition', `attachment; filename="${name}.xlsx"`);
  res.send(file);
}
