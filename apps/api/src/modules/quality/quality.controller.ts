import type { Request, Response } from 'express';
import type { CreateIssueInput, QualityQuery, UpdateIssueInput } from '@yuva/shared';
import { created, ok } from '../../utils/api-response.js';
import * as qualityService from './quality.service.js';

/** Who found it, or who closed it. An issue nobody's name is on is a rumour. */
const actor = (req: Request): string => req.user?.displayName ?? 'Office';

export async function board(req: Request, res: Response) {
  ok(res, await qualityService.qualityBoard(req.query as unknown as QualityQuery));
}

export async function targets(_req: Request, res: Response) {
  ok(res, await qualityService.issueTargets());
}

export async function getOne(req: Request, res: Response) {
  ok(res, await qualityService.getIssue(req.params.id as string));
}

export async function create(req: Request, res: Response) {
  created(res, await qualityService.raiseIssue(req.body as CreateIssueInput, actor(req)));
}

export async function update(req: Request, res: Response) {
  ok(
    res,
    await qualityService.updateIssue(
      req.params.id as string,
      req.body as UpdateIssueInput,
      actor(req),
    ),
  );
}
