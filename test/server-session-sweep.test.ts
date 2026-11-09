/**
 * The expired-session sweep's lifecycle in `server/index.ts` (#1364): `build()` starts an hourly,
 * unref'd timer after opening the database, and `onClose` clears it before the database closes, so
 * a tick after `app.close()` never touches a closed handle.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { build, SESSION_SWEEP_INTERVAL_MS } from '../server/index.ts';

process.env.LOG_LEVEL = 'silent';

let dir: string;
let dbPath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'astraya-sweep-test-'));
  dbPath = join(dir, 'astraya.db');
});

afterEach(() => {
  vi.useRealTimers();
  rmSync(dir, { recursive: true, force: true });
});

function insertSessions(rows: readonly { id: string; expiresAt: string }[]): void {
  const raw = new DatabaseSync(dbPath);
  raw.exec("INSERT INTO users (id, username, password_hash, created_at) VALUES ('u', 'user', 'h', 'now')");
  const insert = raw.prepare(
    'INSERT INTO sessions (id, user_id, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?)',
  );
  for (const row of rows) insert.run(row.id, 'u', 'now', row.expiresAt, 'now');
  raw.close();
}

function sessionIds(): string[] {
  const raw = new DatabaseSync(dbPath);
  const ids = (raw.prepare('SELECT id FROM sessions ORDER BY id').all() as { id: string }[]).map((r) => r.id);
  raw.close();
  return ids;
}

describe('expired-session sweep timer', () => {
  it('removes an expired row after one interval, and keeps a valid one', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const app = await build({ dbPath });
    try {
      const now = Date.now();
      insertSessions([
        { id: 'expired', expiresAt: new Date(now + 1000).toISOString() },
        { id: 'valid', expiresAt: new Date(now + 2 * SESSION_SWEEP_INTERVAL_MS).toISOString() },
      ]);
      expect(sessionIds()).toEqual(['expired', 'valid']);

      await vi.advanceTimersByTimeAsync(SESSION_SWEEP_INTERVAL_MS);
      // The sweep's only await is between full batches; one short batch runs synchronously.
      expect(sessionIds()).toEqual(['valid']);
    } finally {
      await app.close();
    }
  });

  it('stops with app.close(): advancing past further intervals does not throw', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const app = await build({ dbPath });
    await app.close();
    expect(vi.getTimerCount()).toBe(0);
    await expect(vi.advanceTimersByTimeAsync(3 * SESSION_SWEEP_INTERVAL_MS)).resolves.not.toThrow();
  });
});
