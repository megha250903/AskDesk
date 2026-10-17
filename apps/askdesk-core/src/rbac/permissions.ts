import { OrganizationRole } from '../models/membership.model.js';

export type Action =
  | 'org:update'
  | 'org:delete'
  | 'member:invite'
  | 'member:remove'
  | 'member:role_change'
  | 'member:read'
  | 'billing:manage'
  | 'audit:read'
  | 'api_key:create'
  | 'api_key:revoke'
  | 'api_key:read';

export const PERMISSION_MATRIX: Record<Action, OrganizationRole[]> = {
  'org:update': ['owner'],
  'org:delete': ['owner'],
  'member:invite': ['owner', 'admin'],
  'member:remove': ['owner', 'admin'],
  'member:role_change': ['owner', 'admin'],
  'member:read': ['owner', 'admin', 'member'],
  'billing:manage': ['owner'],
  'audit:read': ['owner', 'admin'],
  'api_key:create': ['owner', 'admin'],
  'api_key:revoke': ['owner', 'admin'],
  'api_key:read': ['owner', 'admin', 'member']
};

export function can(role: OrganizationRole, action: Action): boolean {
  const allowedRoles = PERMISSION_MATRIX[action];
  if (!allowedRoles) return false;
  return allowedRoles.includes(role);
}
