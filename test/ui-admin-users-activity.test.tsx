// @vitest-environment jsdom
/**
 * `AdminPanel`'s Users table "Last sync" / "Last AI usage" columns (#445) — against a real
 * `build()` server and a real `SessionProvider`, same shape as `test/session-context.test.tsx`:
 * `admin-client.ts`'s `call()` always fetches a relative URL, so there is no lighter way to
 * exercise `AdminPanel`'s own data fetch than actually serving it. The ops/interpretation_usage
 * rows are seeded directly against the sqlite file (same style as `test/server-admin.test.ts`),
 * since pushing a real op and recording real Tier 2 usage are already covered end to end
 * elsewhere (`test/server-ops.test.ts`, `test/interpretation-routes.test.ts`); this test is about
 * the column rendering, not either of those code paths.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { hashPassword } from '../server/auth/passwords.ts';
import { SessionProvider, useSession, useStoreStatus } from '../src/ui/session-context.js';
import type { StoreStatus } from '../src/ui/session-context.js';
import type { AuthUser } from '../src/sync/auth-client.js';
import { AdminPanel } from '../src/ui/AdminPanel.js';

const BOOTSTRAP_TOKEN = 'test-bootstrap-token';

process.env.LOG_LEVEL = 'silent';

let dir: string;
let dbPath: string;
let app: FastifyInstance;
let baseUrl: string;
const realFetch = globalThis.fetch;

interface SessionProbeApi {
  readonly status: StoreStatus;
  readonly user: AuthUser | undefined;
  readonly signIn: (username: string, password: string) => Promise<void>;
}
let latestSession: SessionProbeApi | undefined;

function SessionProbe(): null {
  const status = useStoreStatus();
  const { user, signIn } = useSession();
  latestSession = { status, user, signIn };
  return null;
}

/**
 * `AdminPanel` fetches its user list unconditionally on mount, with no retry after signing in —
 * production only ever mounts it from an already-authenticated route, so this mirrors that by
 * holding off until a user exists rather than mounting `AdminPanel` eagerly alongside sign-in.
 */
function AdminPanelAfterSignIn(): React.JSX.Element | null {
  const { user } = useSession();
  return user === undefined ? null : <AdminPanel />;
}

/** A persistent cookie jar for the whole test, matching a single browser tab's single origin. */
function installFetch(): void {
  let cookie: string | undefined;
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), baseUrl);
    const headers = new Headers(init?.headers);
    if (cookie !== undefined) headers.set('cookie', cookie);
    const response = await realFetch(url, { ...init, headers });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie !== null) cookie = setCookie.split(';')[0];
    return response;
  };
}

/** Bypasses `/api/setup`'s one-admin-only rule, for the second (non-admin) user in this test. */
async function insertUser(username: string, password: string): Promise<string> {
  const id = randomUUID();
  const passwordHash = await hashPassword(password);
  const raw = new DatabaseSync(dbPath);
  raw
    .prepare("INSERT INTO users (id, username, password_hash, role, created_at) VALUES (?, ?, ?, 'user', ?)")
    .run(id, username, passwordHash, new Date().toISOString());
  raw.close();
  return id;
}

/**
 * Seeds one `ops` row and one `interpretation_usage` row directly, bypassing the real relay/Tier
 * 2 call — `ops.payload` is opaque encrypted bytes on the real write path, but this column's
 * content is irrelevant to the `MAX(ops.received_at)` query this test exercises, so an arbitrary
 * BLOB stands in for it.
 */
function seedActivity(userId: string): void {
  const raw = new DatabaseSync(dbPath);
  const now = new Date().toISOString();
  raw
    .prepare('INSERT INTO ops (user_id, hlc, device_id, op_version, payload, received_at) VALUES (?, ?, ?, 1, ?, ?)')
    .run(userId, `1-1-${randomUUID()}`, 'device', Buffer.from('fixture'), now);
  raw
    .prepare(
      'INSERT INTO interpretation_usage (user_id, prompt_tokens, output_tokens, cost_cents, created_at) VALUES (?, ?, ?, ?, ?)',
    )
    .run(userId, 100, 50, 0.5, now);
  raw.close();
}

async function mountSignedIn(): Promise<{ container: HTMLElement; root: Root }> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <SessionProvider>
        <SessionProbe />
        <AdminPanelAfterSignIn />
      </SessionProvider>,
    );
    await Promise.resolve();
    await Promise.resolve();
  });
  await vi.waitFor(() => {
    expect(latestSession?.status.kind).toBe('ready');
  });
  await act(async () => {
    await latestSession?.signIn('alice', 'correct-horse-battery');
  });
  await vi.waitFor(() => {
    expect(latestSession?.user?.username).toBe('alice');
  });
  return { container, root };
}

function rowFor(container: HTMLElement, username: string): HTMLTableRowElement {
  const rows = Array.from(container.querySelectorAll('tr'));
  const row = rows.find((candidate) => candidate.textContent.includes(username));
  if (!(row instanceof HTMLTableRowElement)) throw new Error(`test fixture bug: no row rendered for ${username}`);
  return row;
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'astraya-admin-ui-test-'));
  dbPath = join(dir, 'astraya.db');
  process.env.ASTRAYA_BOOTSTRAP_TOKEN = BOOTSTRAP_TOKEN;
  process.env.ASTRAYA_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  app = await build({ dbPath });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (address === null || typeof address === 'string') throw new Error('server did not bind to a port');
  baseUrl = `http://127.0.0.1:${String(address.port)}`;
  await realFetch(new URL('/api/setup', baseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: BOOTSTRAP_TOKEN, username: 'alice', password: 'correct-horse-battery' }),
  });
  installFetch();
});

afterEach(async () => {
  globalThis.fetch = realFetch;
  await app.close();
  delete process.env.ASTRAYA_BOOTSTRAP_TOKEN;
  delete process.env.ASTRAYA_ENCRYPTION_KEY;
  rmSync(dir, { recursive: true, force: true });
  latestSession = undefined;
});

describe('AdminPanel Users table, Last sync / Last AI usage columns (#445)', () => {
  it('renders "Never" for a user with no ops or AI usage, and a timestamp for one with both', async () => {
    const bobId = await insertUser('bob', 'correct-horse-battery');
    seedActivity(bobId);

    const { container, root } = await mountSignedIn();
    try {
      await vi.waitFor(() => {
        expect(container.textContent).toContain('bob');
      });

      const aliceRow = rowFor(container, 'alice');
      const aliceCells = Array.from(aliceRow.querySelectorAll('td')).map((cell) => cell.textContent);
      // alice is the admin signed in for this test and has never synced an op or used Tier 2.
      expect(aliceCells[3]).toBe('never');
      expect(aliceCells[4]).toBe('never');

      const bobRow = rowFor(container, 'bob');
      const bobCells = Array.from(bobRow.querySelectorAll('td')).map((cell) => cell.textContent);
      expect(bobCells[3]).not.toBe('never');
      expect(bobCells[4]).not.toBe('never');
    } finally {
      act(() => {
        root.unmount();
      });
      container.remove();
    }
  });
});
