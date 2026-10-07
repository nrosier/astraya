/**
 * The three levels of account (#431): an ordinary **user**, an **admin** who can do everything an
 * administrator could before except manage accounts, and a **super admin** who can do everything,
 * including granting and removing either role.
 *
 * A role is a rank, not a set of flags: a super admin can do whatever an admin can, so every check
 * is "at least this rank". The rank lives here and nowhere else.
 */

/**
 * @module roles
 * @purpose The single source of truth for Astraya's three account ranks (user, admin, super admin) and rank comparisons.
 * @conventions A role is a rank, not a set of independent flags — every permission check is "at least this rank" (`hasRole`), never a per-capability flag; the rank ordering lives only here.
 * @exports ROLES, Role, isRole, hasRole, higherRole
 */
export const ROLES = ['user', 'admin', 'super_admin'] as const;
export type Role = (typeof ROLES)[number];

const RANK: Readonly<Record<Role, number>> = { user: 0, admin: 1, super_admin: 2 };

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

/** Whether `role` is at least `required`. */
export function hasRole(role: Role, required: Role): boolean {
  return RANK[role] >= RANK[required];
}

/** The higher of two roles. */
export function higherRole(a: Role, b: Role): Role {
  return RANK[a] >= RANK[b] ? a : b;
}
