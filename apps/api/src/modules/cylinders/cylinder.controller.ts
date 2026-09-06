import type { Request, Response } from 'express';
import type {
  ListCylindersQuery,
  RecordCylinderEventInput,
  RegisterCylindersInput,
  UpdateCylinderInput,
} from '@yuva/shared';
import { created, ok } from '../../utils/api-response.js';
import * as cylinderService from './cylinder.service.js';

/** Whoever recorded it. Falls back to 'Office', matching rates and stock. */
const actor = (req: Request): string => req.user?.displayName ?? 'Office';

export async function list(req: Request, res: Response) {
  ok(res, await cylinderService.listDesigns(req.query as unknown as ListCylindersQuery));
}

export async function unregistered(_req: Request, res: Response) {
  ok(res, await cylinderService.listUnregistered());
}

export async function out(_req: Request, res: Response) {
  ok(res, await cylinderService.listOut());
}

export async function detail(req: Request, res: Response) {
  ok(res, await cylinderService.getDesign(req.params.id as string));
}

export async function register(req: Request, res: Response) {
  created(
    res,
    await cylinderService.registerCylinders(req.body as RegisterCylindersInput, actor(req)),
  );
}

export async function recordEvent(req: Request, res: Response) {
  created(res, await cylinderService.recordEvent(req.body as RecordCylinderEventInput, actor(req)));
}

export async function update(req: Request, res: Response) {
  ok(
    res,
    await cylinderService.updateCylinder(req.params.id as string, req.body as UpdateCylinderInput),
  );
}

/** What deleting this design would destroy — read before the confirmation. */
export async function deletionImpact(req: Request, res: Response) {
  ok(res, await cylinderService.describeDeletion(req.params.id as string));
}

export async function deleteDesign(req: Request, res: Response) {
  ok(res, await cylinderService.deleteDesign(req.params.id as string));
}
