/**
 * The admin Users status and AI usage summary (#816): an account is Active when it was seen, synced or used AI
 * in the last 24 hours, Idle otherwise, and Disabled whatever its activity. Pure functions, no DOM.
 */
import { describe, expect, it } from 'vitest';
import { ACTIVE_WINDOW_MS, activeUsageUsers, totalRequests, userActivity } from '../src/ui/admin-status.js';

const NOW = Date.parse('2026-10-27T12:00:00.000Z');
const ago = (ms: number): string => new Date(NOW - ms).toISOString();
const HOUR = 60 * 60 * 1000;

const idle = { disabledAt: null, lastSeenAt: null, lastSyncAt: null, lastAiUsageAt: null };

describe('userActivity (#816 Users status Badge)', () => {
  it('is active when seen, synced or used AI within the last 24 hours', () => {
    expect(userActivity({ ...idle, lastSeenAt: ago(2 * HOUR) }, NOW)).toBe('active');
    expect(userActivity({ ...idle, lastSyncAt: ago(HOUR) }, NOW)).toBe('active');
    expect(userActivity({ ...idle, lastAiUsageAt: ago(ACTIVE_WINDOW_MS) }, NOW)).toBe('active');
  });

  it('is idle when the latest activity is older than 24 hours, or there is none', () => {
    expect(userActivity({ ...idle, lastSeenAt: ago(ACTIVE_WINDOW_MS + 1) }, NOW)).toBe('idle');
    expect(userActivity(idle, NOW)).toBe('idle');
  });

  it('is disabled whatever its activity, so a disabled account never reads Active', () => {
    expect(userActivity({ ...idle, disabledAt: ago(HOUR), lastSeenAt: ago(HOUR) }, NOW)).toBe('disabled');
  });

  it('treats an unparseable timestamp as no activity', () => {
    expect(userActivity({ ...idle, lastSeenAt: 'not-a-date' }, NOW)).toBe('idle');
  });
});

describe('AI usage summary (#816)', () => {
  const rows = [
    { requestCount: 42, lastUsedAt: ago(HOUR) },
    { requestCount: 17, lastUsedAt: ago(3 * 24 * HOUR) },
    { requestCount: 3, lastUsedAt: ago(2 * HOUR) },
  ];

  it('totals every request in the report', () => {
    expect(totalRequests(rows)).toBe(62);
    expect(totalRequests([])).toBe(0);
  });

  it('counts users who used AI in the last 24 hours', () => {
    expect(activeUsageUsers(rows, NOW)).toBe(2);
    expect(activeUsageUsers([], NOW)).toBe(0);
  });
});
