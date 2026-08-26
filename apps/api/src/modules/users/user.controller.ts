import type { Request, Response } from 'express';
import type { CreateUserInput, ResetPasswordInput, UpdateUserInput } from '@yuva/shared';
import { created, ok } from '../../utils/api-response.js';
import * as userService from './user.service.js';

export async function list(_req: Request, res: Response) {
  ok(res, await userService.listUsers());
}

export async function create(req: Request, res: Response) {
  created(res, await userService.createUser(req.body as CreateUserInput));
}

export async function update(req: Request, res: Response) {
  const user = await userService.updateUser(
    req.params.id as string,
    req.body as UpdateUserInput,
    req.user!.id,
  );
  ok(res, user);
}

export async function resetPassword(req: Request, res: Response) {
  const { password } = req.body as ResetPasswordInput;
  await userService.resetPassword(req.params.id as string, password);
  ok(res, { reset: true });
}

export async function remove(req: Request, res: Response) {
  await userService.deleteUser(req.params.id as string, req.user!.id);
  ok(res, { deleted: true });
}
