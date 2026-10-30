/**
 * Admin user management (#135): list, create, reset-password, disable/enable,
 * change role, and delete — each backed by the matching route in
 * `server/auth/admin-routes.ts` through `sync/admin-client.ts`. An admin sees the list read-only;
 * only a super admin gets the controls that create, change or remove an account (#431) — the
 * server refuses them for anyone else regardless of what is rendered here. Outside `Stored`:
 * this screen manages *other* users' accounts, not this device's local data, so it
 * needs the session but not the store.
 *
 * A create-user account and a password reset both mint the same kind of one-time
 * link, shown here exactly once — the same "shown once in the response" pattern the
 * bootstrap token already establishes over a log line, here over HTTP since the
 * admin is already signed in.
 */
/**
 * @module AdminPanel
 * @purpose Renders the admin user-management screen (create/disable/enable/reset-password/change-role/delete) and the separate AI-customized interpretation usage report screen.
 * @conventions Server enforces the real role check (super-admin vs admin vs user); this component only reads `useSessionUserOrUndefined()` to decide which controls to render. Text comes from co-located `AdminPanel.messages.ts` via `useMessages()`.
 * @exports AdminPanel, AdminUsagePanel
 */
import { useLocale } from './locale.js';
import { formatCents, formatInteger, formatTimestamp } from './format.js';
import { Badge, type BadgeTone } from './primitives/Badge.js';
import { Button } from './primitives/Button.js';
import { Notice } from './primitives/Notice.js';
import { Select } from './primitives/Select.js';
import { StatList } from './primitives/StatList.js';
import { TextField } from './primitives/TextField.js';
import { activeUsageUsers, totalRequests, userActivity, type UserActivity } from './admin-status.js';
import { useEffect, useState } from 'react';
import { SortableTable } from './SortableTable.js';
import type { TableColumn } from './table-sort.js';
import {
  createUser,
  disableUser,
  enableUser,
  getDeletionImpact,
  getInterpretationUsage,
  listUsers,
  resetPassword,
  setUserRole,
  deleteUser,
} from '../sync/admin-client.js';
import { getOidcConfig } from '../sync/auth-client.js';
import { adminPanelMessages } from './AdminPanel.messages.js';
import { useMessages } from './messages.js';
import { sharedMessages } from './shared.messages.js';
import type { AdminUser, DeletionImpact, InterpretationUsageReport } from '../sync/admin-client.js';
import type { OidcConfig, Role } from '../sync/auth-client.js';
import { useSessionUserOrUndefined } from './session-context.js';
import { StatusMessage } from './primitives/StatusMessage.js';
import { BackLink } from './BackLink.js';
import { PageHeader } from './PageHeader.js';

const ROLE_ORDER: readonly Role[] = ['user', 'admin', 'super_admin'];

function roleLabel(role: Role, t: typeof adminPanelMessages.en): string {
  return role === 'super_admin' ? t.superAdminRoleLabel : role === 'admin' ? t.adminRoleLabel : t.memberRoleLabel;
}

function describeImpact(impact: DeletionImpact, t: typeof adminPanelMessages.en): string {
  if (impact.kind === 'counted') {
    const people = impact.people === 1 ? t.onePerson : t.peopleCount(String(impact.people));
    const charts = impact.charts === 1 ? t.oneChart : t.chartsCount(String(impact.charts));
    return t.peopleAndCharts(people, charts);
  }
  const rows = impact.opRows === 1 ? t.oneStoredChange : t.storedChangesCount(String(impact.opRows));
  return t.unconfiguredSyncSuffix(rows);
}

interface PendingDelete {
  readonly user: AdminUser;
  readonly impact: DeletionImpact;
}

const ACTIVITY_TONE: Readonly<Record<UserActivity, BadgeTone | undefined>> = {
  active: 'success',
  idle: undefined,
  disabled: 'danger',
};

function activityLabel(activity: UserActivity, t: typeof adminPanelMessages.en): string {
  return activity === 'active' ? t.statusActive : activity === 'idle' ? t.statusIdle : t.statusDisabled;
}

function CreateUserForm({ create }: { create: (username: string, role: Role) => Promise<void> }): React.JSX.Element {
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<Role>('user');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const t = useMessages(adminPanelMessages);
  const shared = useMessages(sharedMessages);

  const submit = (event: React.SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    void create(username, role)
      .then(() => {
        setUsername('');
        setRole('user');
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <form onSubmit={submit}>
      {error !== undefined && <StatusMessage kind="error">{error}</StatusMessage>}
      <div className="field-grid">
        <TextField label={shared.usernameLabel} autoComplete="off" value={username} onChange={setUsername} />
        <Select
          label={t.createRoleLabel}
          value={role}
          options={ROLE_ORDER.map((option) => ({ value: option, label: roleLabel(option, t) }))}
          onChange={(value) => {
            const next = ROLE_ORDER.find((candidate) => candidate === value);
            if (next !== undefined) setRole(next);
          }}
        />
      </div>
      <p className="actions">
        <button type="submit" disabled={busy || username.trim() === ''}>
          {t.createUserButton}
        </button>
      </p>
    </form>
  );
}

export function AdminPanel(): React.JSX.Element {
  const [users, setUsers] = useState<readonly AdminUser[]>();
  const [oidcConfig, setOidcConfig] = useState<OidcConfig>();
  const [error, setError] = useState<string>();
  const [busyUserId, setBusyUserId] = useState<string>();
  const [passwordLink, setPasswordLink] = useState<{ userId: string; url: string }>();
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>();
  const t = useMessages(adminPanelMessages);
  const shared = useMessages(sharedMessages);
  const sessionUser = useSessionUserOrUndefined();
  const canManage = sessionUser?.isSuperAdmin === true;
  const oidcEnabled = oidcConfig?.enabled === true;
  // Read once per render: the Active/Idle status is a 24-hour window, not a live clock.
  const now = Date.now();

  const refresh = (): Promise<void> =>
    listUsers().then((loaded) => {
      setUsers(loaded);
    });

  useEffect(() => {
    void refresh().catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : String(cause));
    });
    void getOidcConfig()
      .then(setOidcConfig)
      .catch(() => undefined);
  }, []);

  const run = (userId: string | undefined, action: () => Promise<void>): void => {
    setBusyUserId(userId);
    setError(undefined);
    setPasswordLink(undefined);
    void action()
      .then(() => refresh())
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        setBusyUserId(undefined);
      });
  };

  const create = (username: string, role: Role): Promise<void> =>
    createUser(username, role).then(({ setPasswordUrl }) => {
      setPasswordLink({ userId: username, url: setPasswordUrl });
      return refresh();
    });

  const requestReset = (user: AdminUser): void => {
    run(user.id, () =>
      resetPassword(user.id).then(({ setPasswordUrl }) => {
        setPasswordLink({ userId: user.id, url: setPasswordUrl });
      }),
    );
  };

  const toggleEnabled = (user: AdminUser): void => {
    run(user.id, () => (user.disabledAt === null ? disableUser(user.id) : enableUser(user.id)).then(() => undefined));
  };

  const changeRole = (user: AdminUser, role: Role): void => {
    run(user.id, () => setUserRole(user.id, role).then(() => undefined));
  };

  const requestDelete = (user: AdminUser): void => {
    setError(undefined);
    setBusyUserId(user.id);
    void getDeletionImpact(user.id)
      .then((impact) => {
        setPendingDelete({ user, impact });
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        setBusyUserId(undefined);
      });
  };

  const confirmDelete = (): void => {
    const target = pendingDelete;
    if (!target) return;
    setPendingDelete(undefined);
    run(target.user.id, () => deleteUser(target.user.id));
  };

  const userColumns = ((): readonly TableColumn<AdminUser>[] => {
    const seen = (value: string | null): string => (value === null ? t.neverSeen : formatTimestamp(value));
    const columns: TableColumn<AdminUser>[] = [
      {
        key: 'username',
        label: shared.usernameLabel,
        valueOf: (user) => user.username,
        renderCell: (user) => {
          const activity = userActivity(user, now);
          return (
            <span className="admin-user-name">
              <strong>{user.username}</strong>{' '}
              <Badge tone={ACTIVITY_TONE[activity]}>{activityLabel(activity, t)}</Badge>
            </span>
          );
        },
      },
      {
        key: 'role',
        label: t.roleColumn,
        valueOf: (user) => roleLabel(user.role, t),
        renderCell: (user) =>
          canManage ? (
            <Select
              label={t.roleSelectLabel(user.username)}
              hideLabel
              value={user.role}
              // Nobody can change their own role.
              disabled={busyUserId === user.id || user.id === sessionUser.id}
              options={ROLE_ORDER.map((option) => ({ value: option, label: roleLabel(option, t) }))}
              onChange={(value) => {
                const next = ROLE_ORDER.find((candidate) => candidate === value);
                if (next !== undefined) changeRole(user, next);
              }}
            />
          ) : (
            roleLabel(user.role, t)
          ),
      },
      {
        key: 'lastSeen',
        label: t.lastSeenColumn,
        valueOf: (user) => user.lastSeenAt ?? '',
        render: (user) => seen(user.lastSeenAt),
        renderCell: (user) => <span className="admin-meta">{seen(user.lastSeenAt)}</span>,
      },
      {
        key: 'lastSync',
        label: t.lastSyncColumn,
        valueOf: (user) => user.lastSyncAt ?? '',
        render: (user) => seen(user.lastSyncAt),
        renderCell: (user) => <span className="admin-meta">{seen(user.lastSyncAt)}</span>,
      },
      {
        key: 'lastAiUsage',
        label: t.lastAiUsageColumn,
        valueOf: (user) => user.lastAiUsageAt ?? '',
        render: (user) => seen(user.lastAiUsageAt),
        renderCell: (user) => <span className="admin-meta">{seen(user.lastAiUsageAt)}</span>,
      },
    ];
    if (canManage) {
      columns.push({
        key: 'actions',
        label: t.actionsColumn,
        sortable: false,
        valueOf: () => '',
        renderCell: (user) => {
          const disabled = busyUserId === user.id;
          return (
            <span className="actions admin-user-actions">
              <Button
                size="compact"
                variant="quiet"
                disabled={disabled}
                onClick={() => {
                  toggleEnabled(user);
                }}
              >
                {user.disabledAt === null ? t.disableButton : t.enableButton}
              </Button>
              <Button
                size="compact"
                variant="quiet"
                disabled={disabled}
                onClick={() => {
                  requestReset(user);
                }}
              >
                {t.resetPasswordButton}
              </Button>
              <span className="admin-action-separator" aria-hidden="true" />
              <Button
                size="compact"
                variant="danger"
                disabled={disabled}
                onClick={() => {
                  requestDelete(user);
                }}
              >
                {t.deleteButton}
              </Button>
              {passwordLink?.userId === user.id && (
                <p className="hint">
                  {t.copyLinkNow} <code>{passwordLink.url}</code>
                </p>
              )}
            </span>
          );
        },
      });
    }
    return columns;
  })();

  return (
    <main className="shell admin-view">
      <div className="admin-view-head">
        <BackLink fallback="#/people" />
        <PageHeader title={t.heading} />
      </div>
      <div className="admin-stack">
        {error !== undefined && <StatusMessage kind="error">{error}</StatusMessage>}

        {!canManage && <p className="hint">{t.readOnlyUsersHint}</p>}

        {canManage && oidcEnabled && <Notice tone="warning">{t.oidcHint}</Notice>}

        {canManage && pendingDelete !== undefined && (
          <StatusMessage kind="error">
            {t.deleteWarning(pendingDelete.user.username, describeImpact(pendingDelete.impact, t))}{' '}
            <button type="button" className="danger" onClick={confirmDelete}>
              {t.deletePermanentlyButton}
            </button>{' '}
            <button
              type="button"
              className="quiet"
              onClick={() => {
                setPendingDelete(undefined);
              }}
            >
              {t.cancelButton}
            </button>
          </StatusMessage>
        )}

        {canManage && !oidcEnabled && (
          <>
            <h2>{t.createUserHeading}</h2>
            <CreateUserForm create={create} />
            {passwordLink !== undefined && users?.every((u) => u.id !== passwordLink.userId) === true && (
              <p className="hint">
                {t.copyLinkNow} <code>{passwordLink.url}</code>
              </p>
            )}
          </>
        )}

        {users === undefined ? (
          <>
            <h2>{t.usersHeading}</h2>
            <StatusMessage kind="loading">{t.loadingUsers}</StatusMessage>
          </>
        ) : (
          <SortableTable
            wrap
            headingLevel={2}
            caption={t.usersHeading}
            columns={userColumns}
            rows={users}
            getRowKey={(user) => user.id}
          />
        )}
      </div>
    </main>
  );
}

/**
 * AI-customized interpretation usage (#382), its own admin screen (#414) rather than the foot of
 * the user list, so it is one click from the admin menu. Admin-only on the server regardless of
 * what this renders.
 */
export function AdminUsagePanel(): React.JSX.Element {
  const [usage, setUsage] = useState<InterpretationUsageReport>();
  const [error, setError] = useState<string>();
  const t = useMessages(adminPanelMessages);
  const [locale] = useLocale();

  useEffect(() => {
    void getInterpretationUsage()
      .then(setUsage)
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
      });
  }, []);

  const usageColumns: readonly TableColumn<InterpretationUsageReport['users'][number]>[] = [
    { key: 'user', label: t.usageUserColumn, valueOf: (row) => row.username },
    {
      key: 'requests',
      label: t.usageRequestsColumn,
      valueOf: (row) => row.requestCount,
      render: (row) => formatInteger(row.requestCount, locale),
    },
    {
      key: 'tokens',
      label: t.usageTokensColumn,
      valueOf: (row) => row.promptTokens + row.outputTokens,
      render: (row) => `${formatInteger(row.promptTokens, locale)} / ${formatInteger(row.outputTokens, locale)}`,
    },
    {
      key: 'cost',
      label: t.usageCostColumn,
      valueOf: (row) => row.costCents,
      render: (row) => formatCents(row.costCents, locale),
    },
    {
      key: 'cost24h',
      label: t.usageCostLast24hColumn,
      valueOf: (row) => row.costCentsLast24h,
      render: (row) => formatCents(row.costCentsLast24h, locale),
    },
    {
      key: 'lastUsed',
      label: t.usageLastUsedColumn,
      valueOf: (row) => row.lastUsedAt,
      render: (row) => formatTimestamp(row.lastUsedAt),
    },
  ];

  return (
    <main className="shell admin-view">
      <div className="admin-view-head">
        <BackLink fallback="#/people" />
        <PageHeader title={t.usageHeading} />
      </div>
      <div className="admin-stack">
        {error !== undefined && <StatusMessage kind="error">{error}</StatusMessage>}
        {usage === undefined ? (
          <StatusMessage kind="loading">{t.loadingUsage}</StatusMessage>
        ) : usage.users.length === 0 ? (
          <p className="hint">{t.usageEmpty}</p>
        ) : (
          <>
            <StatList
              items={[
                { label: t.usageSummaryCost24h, value: formatCents(usage.totalCostCentsLast24h, locale) },
                { label: t.usageSummaryRequests, value: formatInteger(totalRequests(usage.users), locale) },
                {
                  label: t.usageSummaryActiveUsers,
                  value: formatInteger(activeUsageUsers(usage.users, Date.now()), locale),
                },
              ]}
            />
            <Notice tone="info">
              {t.usageCapsNote(
                formatCents(usage.caps.userDailyCapCents, locale),
                formatCents(usage.caps.totalDailyCapCents, locale),
                formatCents(usage.totalCostCentsLast24h, locale),
              )}
            </Notice>
            <SortableTable
              headingLevel={2}
              caption={t.usageTableHeading}
              columns={usageColumns}
              rows={usage.users}
              getRowKey={(row) => row.userId}
            />
          </>
        )}
      </div>
    </main>
  );
}
