import type { Request, Response } from 'express';
import type {
  FinishFloorJobInput,
  FloorBoardQuery,
  HoldFloorJobInput,
  ResumeFloorJobInput,
  StartFloorJobInput,
} from '@yuva/shared';
import { ok } from '../../utils/api-response.js';
import { ApiError } from '../../utils/api-error.js';
import * as floorService from './floor.service.js';

/**
 * Which machine the tablet is bolted to.
 *
 * Sent by the tablet on every write rather than inferred from the job, because
 * it is the thing being asserted: *this* machine is doing *this* job. Without
 * it the screen could start a job at a machine nobody is standing at.
 */
function machineOf(req: Request): string {
  const machineId = (req.query.machineId ?? req.body?.machineId) as string | undefined;
  if (!machineId) throw ApiError.badRequest('This tablet is not set to a machine yet');
  return machineId;
}

export async function machines(_req: Request, res: Response) {
  ok(res, await floorService.listMachines());
}

export async function board(req: Request, res: Response) {
  ok(res, await floorService.floorBoard(req.query as unknown as FloorBoardQuery));
}

export async function start(req: Request, res: Response) {
  ok(
    res,
    await floorService.startJob(
      req.params.stageId as string,
      machineOf(req),
      req.body as StartFloorJobInput,
    ),
  );
}

export async function finish(req: Request, res: Response) {
  ok(
    res,
    await floorService.finishJob(
      req.params.stageId as string,
      machineOf(req),
      req.body as FinishFloorJobInput,
    ),
  );
}

export async function hold(req: Request, res: Response) {
  ok(
    res,
    await floorService.holdJob(
      req.params.stageId as string,
      machineOf(req),
      req.body as HoldFloorJobInput,
    ),
  );
}

export async function resume(req: Request, res: Response) {
  ok(
    res,
    await floorService.resumeJob(
      req.params.stageId as string,
      machineOf(req),
      req.body as ResumeFloorJobInput,
    ),
  );
}
