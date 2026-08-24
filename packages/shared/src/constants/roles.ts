/**
 * Platform roles. Per-module permissions are layered on top of these;
 * this file only fixes the role vocabulary itself.
 */
export const ROLES = [
  'OWNER',
  'MANAGER',
  'SUPERVISOR',
  'WAREHOUSE',
  'OPERATOR',
  'QUALITY',
  'ADMIN',
] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: 'Owner',
  MANAGER: 'Manager',
  SUPERVISOR: 'Supervisor',
  WAREHOUSE: 'Warehouse',
  OPERATOR: 'Operator',
  QUALITY: 'Quality',
  ADMIN: 'Admin',
};
