import type { Request, Response } from 'express';
import { ok } from '../../utils/api-response.js';
import { DEFAULT_HISTORY_LIMIT, getMonitorSnapshot } from './monitor.service.js';

/** The monitor snapshot. Administrators only — the route applies that guard. */
export async function monitor(req: Request, res: Response): Promise<void> {
  /*
   * ?limit= how many sign-ins of history to return. Anything unparseable falls
   * back to the default rather than erroring: the screen sends a number, but a
   * person reading this with curl should not be punished for a typo. The
   * service clamps the value to its own ceiling.
   */
  const requested = Number(req.query.limit);
  const snapshot = await getMonitorSnapshot(
    Number.isFinite(requested) && requested > 0 ? requested : DEFAULT_HISTORY_LIMIT,
  );

  // Never cached: the whole point is what is true at the moment of asking.
  res.setHeader('Cache-Control', 'no-store');
  ok(res, snapshot);
}
