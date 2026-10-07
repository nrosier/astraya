/**
 * Promote-only role auto-promotion (#292, #431): an env-configured username allowlist for local
 * accounts, and an OIDC group claim for SSO accounts, each of which can name **admins** and **super
 * admins** separately. Deliberately promote-only — removing a name from an allowlist, or a group from
 * the IdP side, never auto-demotes anyone, and a match for a lower role never lowers a higher one.
 * Demotion stays the manual action (`admin-routes.ts`'s role route), which avoids a surprise lockout
 * from an env-var typo or an IdP group rename, and means `isOnlyRemainingSuperAdmin` — which only
 * fires on demote/disable/delete — is structurally unreachable from this module: there is no path
 * here that ever removes a role from anyone.
 */

/**
 * @module admin-promotion
 * @purpose Promote-only auto-promotion of users to admin/super admin role, from an env-configured local-username allowlist or an OIDC group claim.
 * @conventions Strictly promote-only: removing a name from an allowlist or a group on the IdP side never auto-demotes anyone, and a lower-role match never lowers an already-higher role — manual demotion only happens via `admin-routes.ts`'s role route. A super admin match always outranks an admin match.
 * @exports loadAdminUsernameAllowlist, loadSuperAdminUsernameAllowlist, loadOidcAdminGroups, loadOidcSuperAdminGroups, describeOidcAdminGroupCheck, adminGroupStartupNotice, promoteLocalUserIfAllowlisted, promoteOidcUserIfGroupMatched
 */
import type { Database } from '../db.ts';
import { roleFields, type User } from './identity.ts';
import { hasRole, higherRole, type Role } from './roles.ts';

function splitList(raw: string | undefined, normalise: (item: string) => string): ReadonlySet<string> {
  return new Set(
    (raw ?? '')
      .split(',')
      .map((item) => normalise(item.trim()))
      .filter((item) => item !== ''),
  );
}

/** `ASTRAYA_ADMIN_USERNAMES`, comma-separated, matched case-insensitively — mirrors `users.username`'s `COLLATE NOCASE`. */
export function loadAdminUsernameAllowlist(): ReadonlySet<string> {
  return splitList(process.env.ASTRAYA_ADMIN_USERNAMES, (name) => name.toLowerCase());
}

/** `ASTRAYA_SUPER_ADMIN_USERNAMES`: the same, for the super admin role (#431). */
export function loadSuperAdminUsernameAllowlist(): ReadonlySet<string> {
  return splitList(process.env.ASTRAYA_SUPER_ADMIN_USERNAMES, (name) => name.toLowerCase());
}

/** `ASTRAYA_OIDC_ADMIN_GROUPS`, comma-separated, matched exactly — IdP group names are identifiers, so case matters. */
export function loadOidcAdminGroups(): ReadonlySet<string> {
  return splitList(process.env.ASTRAYA_OIDC_ADMIN_GROUPS, (group) => group);
}

/** `ASTRAYA_OIDC_SUPER_ADMIN_GROUPS`: the same, for the super admin role (#431). */
export function loadOidcSuperAdminGroups(): ReadonlySet<string> {
  return splitList(process.env.ASTRAYA_OIDC_SUPER_ADMIN_GROUPS, (group) => group);
}

export interface OidcAdminGroupCheck {
  readonly level: 'info' | 'warn';
  readonly message: string;
  /** Structured fields for the log line: the claim read, what was found, what is configured, what matched. */
  readonly fields: {
    readonly groupClaim: string;
    readonly groupsSeen: readonly string[];
    readonly adminGroupsConfigured: readonly string[];
    readonly superAdminGroupsConfigured: readonly string[];
    readonly matchedGroups: readonly string[];
    readonly matchedSuperAdminGroups: readonly string[];
  };
}

/**
 * What an OIDC sign-in's group check saw, as a log record (#414, #431): promotion is silent by design
 * (a non-match is not an error), which made a misconfiguration — the env var never loaded, or
 * the IdP not putting `groups` in the ID token — impossible to tell apart from "nobody was in
 * the admin group". Warns exactly when admin groups are configured but the token carried none,
 * since that is the case the operator can fix; everything else is plain information. It reports
 * the admin and the super admin groups separately, since either can match.
 */
export function describeOidcAdminGroupCheck(groups: readonly string[], groupClaim: string): OidcAdminGroupCheck {
  const adminConfigured = [...loadOidcAdminGroups()];
  const superConfigured = [...loadOidcSuperAdminGroups()];
  const matchedAdmin = groups.filter((group) => adminConfigured.includes(group));
  const matchedSuper = groups.filter((group) => superConfigured.includes(group));
  const fields = {
    groupClaim,
    groupsSeen: groups,
    adminGroupsConfigured: adminConfigured,
    superAdminGroupsConfigured: superConfigured,
    matchedGroups: matchedAdmin,
    matchedSuperAdminGroups: matchedSuper,
  };
  if (adminConfigured.length === 0 && superConfigured.length === 0) {
    return {
      level: 'info',
      message:
        'OIDC sign-in: ASTRAYA_OIDC_ADMIN_GROUPS is not set (nor ASTRAYA_OIDC_SUPER_ADMIN_GROUPS), so no promotion by group is attempted.',
      fields,
    };
  }
  if (groups.length === 0) {
    return {
      level: 'warn',
      message: `OIDC sign-in: the ID token has no "${groupClaim}" claim (or it is empty), so nobody can be promoted by group. Check the provider's scope/property mapping that emits it.`,
      fields,
    };
  }
  if (matchedAdmin.length === 0 && matchedSuper.length === 0) {
    const configured = [
      ...(adminConfigured.length > 0 ? [`ASTRAYA_OIDC_ADMIN_GROUPS (${adminConfigured.join(', ')})`] : []),
      ...(superConfigured.length > 0 ? [`ASTRAYA_OIDC_SUPER_ADMIN_GROUPS (${superConfigured.join(', ')})`] : []),
    ].join(' or ');
    return {
      level: 'info',
      message: `OIDC sign-in: none of the user's groups (${groups.join(', ')}) is in ${configured}; group names are matched exactly, case included.`,
      fields,
    };
  }
  return {
    level: 'info',
    message:
      [
        ...(matchedSuper.length > 0 ? [`matched super admin group ${matchedSuper.join(', ')}`] : []),
        ...(matchedAdmin.length > 0 ? [`matched admin group ${matchedAdmin.join(', ')}`] : []),
      ].reduce((text, part, index) => (index === 0 ? `OIDC sign-in: ${part}` : `${text}; ${part}`), '') + '.',
    fields,
  };
}

export interface StartupNotice {
  readonly level: 'info' | 'warn';
  readonly message: string;
}

/** The one-time startup note about `ASTRAYA_OIDC_ADMIN_GROUPS` and `ASTRAYA_OIDC_SUPER_ADMIN_GROUPS` (#414, #431), or `undefined` when there is nothing worth saying. */
export function adminGroupStartupNotice(oidcEnabled: boolean, groupClaim: string): StartupNotice | undefined {
  const adminConfigured = [...loadOidcAdminGroups()];
  const superConfigured = [...loadOidcSuperAdminGroups()];
  const anyConfigured = adminConfigured.length > 0 || superConfigured.length > 0;
  if (anyConfigured && !oidcEnabled) {
    const names = [
      ...(adminConfigured.length > 0 ? ['ASTRAYA_OIDC_ADMIN_GROUPS'] : []),
      ...(superConfigured.length > 0 ? ['ASTRAYA_OIDC_SUPER_ADMIN_GROUPS'] : []),
    ].join(' and ');
    return {
      level: 'warn',
      message:
        `${names} ${names.includes(' and ') ? 'are' : 'is'} set but OIDC is not configured (ASTRAYA_OIDC_ISSUER is empty), so ${names.includes(' and ') ? 'they have' : 'it has'} no effect. ` +
        'Note the server reads only the process environment: a .env file is used only if it is loaded, e.g. `node --env-file=.env server/index.ts`.',
    };
  }
  if (anyConfigured) {
    return {
      level: 'info',
      message:
        [
          ...(superConfigured.length > 0 ? [`members of ${superConfigured.join(', ')} are made super admin`] : []),
          ...(adminConfigured.length > 0 ? [`members of ${adminConfigured.join(', ')} are made admin`] : []),
        ].reduce((text, part, index) => (index === 0 ? `OIDC role promotion: ${part}` : `${text}; ${part}`), '') +
        ` at sign-in (read from the "${groupClaim}" claim).`,
    };
  }
  if (oidcEnabled) {
    return {
      level: 'info',
      message:
        'OIDC is enabled but ASTRAYA_OIDC_ADMIN_GROUPS (and ASTRAYA_OIDC_SUPER_ADMIN_GROUPS) is not set: nobody is promoted by group.',
    };
  }
  return undefined;
}

/** Raises `user` to `role` — never lowers: a user already at or above it is returned unchanged. */
function grantRole(db: Database, user: User, role: Role): User {
  if (hasRole(user.role, role)) return user;
  const target = higherRole(user.role, role);
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(target, user.id);
  return { ...user, ...roleFields(target) };
}

/** The role a username is allowlisted for, if any: `ASTRAYA_SUPER_ADMIN_USERNAMES` outranks `ASTRAYA_ADMIN_USERNAMES`. */
function allowlistedRole(username: string): Role | undefined {
  const name = username.toLowerCase();
  if (loadSuperAdminUsernameAllowlist().has(name)) return 'super_admin';
  if (loadAdminUsernameAllowlist().has(name)) return 'admin';
  return undefined;
}

/** Promotes `user` to the role its `username` is allowlisted for. A no-op (returns `user` unchanged) if it already has it or is not allowlisted. */
export function promoteLocalUserIfAllowlisted(db: Database, user: User, username: string): User {
  const role = allowlistedRole(username);
  return role === undefined ? user : grantRole(db, user, role);
}

/** The role a set of groups maps to, if any: a super admin group outranks an admin group. */
function groupRole(groups: readonly string[]): Role | undefined {
  const superGroups = loadOidcSuperAdminGroups();
  if (groups.some((group) => superGroups.has(group))) return 'super_admin';
  const adminGroups = loadOidcAdminGroups();
  if (groups.some((group) => adminGroups.has(group))) return 'admin';
  return undefined;
}

/** Promotes `user` to the role its `groups` map to. A no-op (returns `user` unchanged) if it already has it or no group matches. */
export function promoteOidcUserIfGroupMatched(db: Database, user: User, groups: readonly string[]): User {
  const role = groupRole(groups);
  return role === undefined ? user : grantRole(db, user, role);
}
