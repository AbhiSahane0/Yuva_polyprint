import type { Request, Response } from 'express';
import type { ChangePasswordInput, LoginInput } from '@yuva/shared';
import { ok } from '../../utils/api-response.js';
import * as authService from './auth.service.js';

export async function login(req: Request, res: Response) {
  // Recorded against the sign-in, for the monitor page. `req.ip` is resolved
  // through the proxy Express is told to trust in app.ts.
  const result = await authService.login(req.body as LoginInput, {
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });
  ok(res, result);
}

export async function logout(req: Request, res: Response) {
  await authService.logout(req.sessionToken ?? '');
  ok(res, { signedOut: true });
}

/** Who am I — used on boot to turn a stored token back into a session. */
export function me(req: Request, res: Response) {
  ok(res, req.user);
}

export async function changePassword(req: Request, res: Response) {
  const body = req.body as ChangePasswordInput;
  await authService.changeOwnPassword(
    req.user!.id,
    body.currentPassword,
    body.newPassword,
    req.sessionToken ?? '',
  );
  ok(res, { changed: true });
}
