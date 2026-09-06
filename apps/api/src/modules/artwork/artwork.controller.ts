import type { Request, Response } from 'express';
import type { ListArtworkQuery, RequestArtworkUploadInput, UpdateArtworkInput } from '@yuva/shared';
import { created, ok } from '../../utils/api-response.js';
import * as artworkService from './artwork.service.js';

/** Whoever uploaded it. Falls back to 'Office', matching the other modules. */
const actor = (req: Request): string => req.user?.displayName ?? 'Office';

export async function listForJob(req: Request, res: Response) {
  ok(
    res,
    await artworkService.listForJob(
      req.params.jobId as string,
      req.query as unknown as ListArtworkQuery,
    ),
  );
}

export async function requestUpload(req: Request, res: Response) {
  created(
    res,
    await artworkService.requestUpload(req.body as RequestArtworkUploadInput, actor(req)),
  );
}

export async function confirmUpload(req: Request, res: Response) {
  ok(res, await artworkService.confirmUpload(req.params.id as string));
}

/** `?download=1` saves the file; without it a PDF or an image opens in a tab. */
export async function link(req: Request, res: Response) {
  const download = req.query.download === '1' || req.query.download === 'true';
  ok(res, await artworkService.linkFor(req.params.id as string, download));
}

export async function update(req: Request, res: Response) {
  ok(res, await artworkService.update(req.params.id as string, req.body as UpdateArtworkInput));
}

export async function remove(req: Request, res: Response) {
  ok(res, await artworkService.remove(req.params.id as string));
}

export async function restore(req: Request, res: Response) {
  ok(res, await artworkService.restore(req.params.id as string));
}
