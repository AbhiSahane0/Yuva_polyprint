import type { Request, Response } from 'express';
import type {
  LabourInput,
  MachineInput,
  UpdateLabourInput,
  UpdateMachineInput,
} from '@yuva/shared';
import { created, ok } from '../../utils/api-response.js';
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
