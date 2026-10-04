/**
 * OIDC admin-group diagnostics (#414): the sign-in check and the startup note are log records
 * built by pure functions, so they can be asserted without scraping a logger. The promotion
 * itself is covered in `server-oidc.test.ts`.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { adminGroupStartupNotice, describeOidcAdminGroupCheck } from '../server/auth/admin-promotion.ts';

afterEach(() => {
  delete process.env.ASTRAYA_OIDC_ADMIN_GROUPS;
  delete process.env.ASTRAYA_OIDC_SUPER_ADMIN_GROUPS;
});

describe('describeOidcAdminGroupCheck', () => {
  it('reports the groups seen, the groups configured and the match when a group matches', () => {
    process.env.ASTRAYA_OIDC_ADMIN_GROUPS = 'astraya_admin, other';
    const check = describeOidcAdminGroupCheck(['everyone', 'astraya_admin'], 'groups');
    expect(check.level).toBe('info');
    expect(check.message).toContain('matched admin group astraya_admin');
    expect(check.fields).toEqual({
      groupClaim: 'groups',
      groupsSeen: ['everyone', 'astraya_admin'],
      adminGroupsConfigured: ['astraya_admin', 'other'],
      superAdminGroupsConfigured: [],
      matchedGroups: ['astraya_admin'],
      matchedSuperAdminGroups: [],
    });
  });

  it('warns, naming the claim, when admin groups are configured but the token carried none', () => {
    process.env.ASTRAYA_OIDC_ADMIN_GROUPS = 'astraya_admin';
    const check = describeOidcAdminGroupCheck([], 'roles');
    expect(check.level).toBe('warn');
    expect(check.message).toContain('"roles" claim');
    expect(check.message).toContain('property mapping');
  });

  it('says why a user was not promoted when they have groups but none match, noting the exact-case rule', () => {
    process.env.ASTRAYA_OIDC_ADMIN_GROUPS = 'astraya_admin';
    const check = describeOidcAdminGroupCheck(['Astraya_Admin'], 'groups');
    expect(check.level).toBe('info');
    expect(check.message).toContain('Astraya_Admin');
    expect(check.message).toContain('astraya_admin');
    expect(check.message).toContain('case included');
    expect(check.fields.matchedGroups).toEqual([]);
  });

  it('reports a super admin group match separately from an admin group match (#431)', () => {
    process.env.ASTRAYA_OIDC_ADMIN_GROUPS = 'astraya_admin';
    process.env.ASTRAYA_OIDC_SUPER_ADMIN_GROUPS = 'astraya_owner';
    const check = describeOidcAdminGroupCheck(['astraya_owner', 'astraya_admin'], 'groups');
    expect(check.message).toContain('matched super admin group astraya_owner');
    expect(check.message).toContain('matched admin group astraya_admin');
    expect(check.fields.matchedSuperAdminGroups).toEqual(['astraya_owner']);
    expect(check.fields.matchedGroups).toEqual(['astraya_admin']);
  });

  it('names both variables when a user matches neither list', () => {
    process.env.ASTRAYA_OIDC_ADMIN_GROUPS = 'astraya_admin';
    process.env.ASTRAYA_OIDC_SUPER_ADMIN_GROUPS = 'astraya_owner';
    const check = describeOidcAdminGroupCheck(['everyone'], 'groups');
    expect(check.message).toContain('ASTRAYA_OIDC_ADMIN_GROUPS (astraya_admin)');
    expect(check.message).toContain('ASTRAYA_OIDC_SUPER_ADMIN_GROUPS (astraya_owner)');
    expect(check.message).toContain('case included');
  });

  it('warns about a missing claim when only super admin groups are configured', () => {
    process.env.ASTRAYA_OIDC_SUPER_ADMIN_GROUPS = 'astraya_owner';
    expect(describeOidcAdminGroupCheck([], 'groups').level).toBe('warn');
  });

  it('says nothing is attempted when no admin groups are configured', () => {
    const check = describeOidcAdminGroupCheck(['astraya_admin'], 'groups');
    expect(check.level).toBe('info');
    expect(check.message).toContain('ASTRAYA_OIDC_ADMIN_GROUPS is not set');
  });
});

describe('adminGroupStartupNotice', () => {
  it('warns when admin groups are set but OIDC is not configured, and says how a .env file is loaded', () => {
    process.env.ASTRAYA_OIDC_ADMIN_GROUPS = 'astraya_admin';
    const notice = adminGroupStartupNotice(false, 'groups');
    expect(notice?.level).toBe('warn');
    expect(notice?.message).toContain('OIDC is not configured');
    expect(notice?.message).toContain('--env-file');
  });

  it('states which groups promote, and from which claim, when everything is configured', () => {
    process.env.ASTRAYA_OIDC_ADMIN_GROUPS = 'astraya_admin';
    const notice = adminGroupStartupNotice(true, 'groups');
    expect(notice?.level).toBe('info');
    expect(notice?.message).toContain('astraya_admin');
    expect(notice?.message).toContain('"groups"');
  });

  it('states which groups make a super admin and which an admin (#431)', () => {
    process.env.ASTRAYA_OIDC_ADMIN_GROUPS = 'astraya_admin';
    process.env.ASTRAYA_OIDC_SUPER_ADMIN_GROUPS = 'astraya_owner';
    const notice = adminGroupStartupNotice(true, 'groups');
    expect(notice?.message).toContain('astraya_owner are made super admin');
    expect(notice?.message).toContain('astraya_admin are made admin');
  });

  it('warns when only super admin groups are set but OIDC is not configured', () => {
    process.env.ASTRAYA_OIDC_SUPER_ADMIN_GROUPS = 'astraya_owner';
    const notice = adminGroupStartupNotice(false, 'groups');
    expect(notice?.level).toBe('warn');
    expect(notice?.message).toContain('ASTRAYA_OIDC_SUPER_ADMIN_GROUPS');
  });

  it('notes that nobody is promoted when OIDC is on but no admin groups are set', () => {
    const notice = adminGroupStartupNotice(true, 'groups');
    expect(notice?.level).toBe('info');
    expect(notice?.message).toContain('not set');
  });

  it('stays silent when neither OIDC nor admin groups are in play', () => {
    expect(adminGroupStartupNotice(false, 'groups')).toBeUndefined();
  });
});
