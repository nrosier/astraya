/**
 * @module ui/admin-status
 * @purpose Pure helpers behind the admin Users status Badge and the AI usage summary tiles (#816): which accounts count as active, and the request and active-user totals.
 * @conventions No React and no I/O; `now` is passed in so the 24-hour window is testable. "Active" means any recorded activity (seen, sync or AI usage) in the last 24 hours; a disabled account is always "disabled", whatever its activity.
 * @exports ACTIVE_WINDOW_MS, UserActivity, userActivity, totalRequests, activeUsageUsers
 */
import type { AdminUser, InterpretationUsageSummary } from '../sync/admin-client.js';

/** The rolling window the Users status and the AI usage "active" tile both use: 24 hours. */
export const ACTIVE_WINDOW_MS = 24 * 60 * 60 * 1000;

export type UserActivity = 'active' | 'idle' | 'disabled';

function within(value: string | null, now: number): boolean {
  if (value === null) return false;
  const at = new Date(value).getTime();
  return !Number.isNaN(at) && now - at <= ACTIVE_WINDOW_MS;
}

/** Disabled wins; otherwise active when the account was seen, synced or used AI in the last 24 hours. */
export function userActivity(
  user: Pick<AdminUser, 'disabledAt' | 'lastSeenAt' | 'lastSyncAt' | 'lastAiUsageAt'>,
  now: number,
): UserActivity {
  if (user.disabledAt !== null) return 'disabled';
  return within(user.lastSeenAt, now) || within(user.lastSyncAt, now) || within(user.lastAiUsageAt, now)
    ? 'active'
    : 'idle';
}

/** Every request in the report, all time, matching the table's own Requests column. */
export function totalRequests(rows: readonly Pick<InterpretationUsageSummary, 'requestCount'>[]): number {
  return rows.reduce((sum, row) => sum + row.requestCount, 0);
}

/** Users whose last AI-customized request falls inside the last 24 hours. */
export function activeUsageUsers(rows: readonly Pick<InterpretationUsageSummary, 'lastUsedAt'>[], now: number): number {
  return rows.filter((row) => within(row.lastUsedAt, now)).length;
}
