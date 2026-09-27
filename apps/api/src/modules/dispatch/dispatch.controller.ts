import type { Request, Response } from 'express';
import type {
  CancelDispatchInput,
  CreateDispatchInput,
  ListDispatchesQuery,
  PostDispatchInput,
  ReadyToSendQuery,
  UpdateDispatchInput,
} from '@yuva/shared';
import { created, ok } from '../../utils/api-response.js';
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
