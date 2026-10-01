import { z } from 'zod';
import { SHIFTS } from '../constants/employees.js';
import { partialWithoutDefaults } from './partial-update.js';
import { isoDateSchema } from './common.js';

/**
 * Adding somebody to the works.
 *
 * Two fields are required and the rest are not, on purpose: a supervisor adding
 * an operator at the machine knows their name and what they do, and a form that
 * also demands a phone number and a joining date before it will save is a form
 * that gets abandoned halfway — and then the name goes on being typed by hand.
 */
export const employeeSchema = z.object({
  name: z.string().trim().min(1, 'Who is this?').max(120),
  code: z.string().trim().max(24).default(''),

  /**
   * The costing role they are paid as. Null for office, warehouse and anyone
   * else no costing role describes — `roleName` carries it instead.
   *
   * The wage is never copied here. It lives on the role, dated, where the
   * costing reads it, so a rise is typed once rather than onto forty records.
   */
  roleId: z.string().trim().min(1).nullable().default(null),
  /** Required only when there is no role to take the name from. */
  roleName: z.string().trim().max(120).default(''),

  shift: z.enum(SHIFTS).default('GENERAL'),
  phone: z.string().trim().max(20).default(''),
  joinedOn: isoDateSchema('joining date').nullable().default(null),
  /** Cleared when somebody leaves. Their record stays — their runs name them. */
  isActive: z.boolean().default(true),
  notes: z.string().trim().max(1000).default(''),
});

export const createEmployeeSchema = employeeSchema.refine(
  (value) => Boolean(value.roleId) || value.roleName.length > 0,
  { path: ['roleName'], message: 'Pick a costing role, or type what they do' },
);

export type EmployeeInput = z.infer<typeof employeeSchema>;

export const updateEmployeeSchema = partialWithoutDefaults(employeeSchema);
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;

export const listEmployeesQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  /** Only the people on a given process — the printing men, the slitting men. */
  process: z.enum(['PRINTING', 'LAMINATION', 'SLITTING', 'POUCHING']).optional(),
  shift: z.enum(SHIFTS).optional(),
  /** Off by default: a list that hides who has left cannot explain an old card. */
  includeLeft: z.coerce.boolean().default(false),
  /** Just the ones on a machine right now. */
  workingOnly: z.coerce.boolean().default(false),
});

export type ListEmployeesQuery = z.infer<typeof listEmployeesQuerySchema>;
