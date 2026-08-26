import { z } from 'zod';
import { APP_MODULES } from '../constants/modules.js';

/*
 * Usernames are lower-cased on the way in. The office will type "Anand" and
 * "anand" interchangeably, and two accounts differing only in case would be a
 * standing trap.
 */
const username = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Username must be at least 3 characters')
  .max(32, 'Username must be 32 characters or fewer')
  .regex(
    /^[a-z0-9][a-z0-9._-]*$/,
    'Use letters, numbers, dots, dashes and underscores; start with a letter or number',
  );

/*
 * Eight characters, and that is the whole rule. Composition requirements push
 * people towards "Passw0rd!" and towards writing it on the monitor; length is
 * what actually helps, and this is an internal tool behind a login.
 */
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(200, 'Password must be 200 characters or fewer');

export const modulesSchema = z
  .array(z.enum(APP_MODULES))
  .max(APP_MODULES.length)
  .transform((values) => [...new Set(values)]);

export const loginSchema = z.object({
  // Not the strict `username` schema: a rejected format here would tell an
  // attacker their guess was not even a valid username. Only trim and lower.
  username: z.string().trim().toLowerCase().min(1, 'Enter your username'),
  password: z.string().min(1, 'Enter your password'),
});

export const createUserSchema = z.object({
  username,
  password,
  displayName: z.string().trim().min(1, 'Enter a name').max(80),
  isAdmin: z.boolean().default(false),
  modules: modulesSchema.default([]),
});

export const updateUserSchema = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
  isAdmin: z.boolean().optional(),
  isActive: z.boolean().optional(),
  modules: modulesSchema.optional(),
});

export const resetPasswordSchema = z.object({ password });

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password'),
  newPassword: password,
});

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
