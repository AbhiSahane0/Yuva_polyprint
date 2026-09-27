import type { Request, Response } from 'express';
import type { EndMaintenanceInput, MachineBoardQuery, StartMaintenanceInput } from '@yuva/shared';
import { created, ok } from '../../utils/api-response.js';
import * as machineService from './machine.service.js';

/** Who put it down, or who brought it back. */
const actor = (req: Request): string => req.user?.displayName ?? 'Office';

export async function board(req: Request, res: Response) {
  ok(res, await machineService.machineBoard(req.query as unknown as MachineBoardQuery));
}

export async function history(req: Request, res: Response) {
  ok(res, await machineService.machineHistory(req.params.id as string));
}

export async function start(req: Request, res: Response) {
  created(
    res,
    await machineService.startMaintenance(req.body as StartMaintenanceInput, actor(req)),
  );
}

export async function end(req: Request, res: Response) {
  ok(
    res,
    await machineService.endMaintenance(
      req.params.id as string,
      req.body as EndMaintenanceInput,
      actor(req),
    ),
  );
}
