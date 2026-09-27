import type { Request, Response } from 'express';
import type { PlanningQuery, PlanOrderInput } from '@yuva/shared';
import { ok } from '../../utils/api-response.js';
import * as planningService from './planning.service.js';

/** Who booked it. A plan nobody's name is against is one nobody can be asked about. */
const actor = (req: Request): string => req.user?.displayName ?? 'Office';

export async function board(req: Request, res: Response) {
  ok(res, await planningService.planningBoard(req.query as unknown as PlanningQuery));
}

export async function machines(_req: Request, res: Response) {
  ok(res, await planningService.machineLoad());
}

export async function forOrder(req: Request, res: Response) {
  ok(res, await planningService.planningFor(req.params.id as string));
}

export async function plan(req: Request, res: Response) {
  ok(
    res,
    await planningService.planOrder(
      req.params.id as string,
      req.body as PlanOrderInput,
      actor(req),
    ),
  );
}
