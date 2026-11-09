// @vitest-environment jsdom
/**
 * `src/sync/engine.ts` against a real `build()` server (listening on an
 * ephemeral port, not `app.inject()` — this module makes real `fetch()`
 * calls) and real `openStore()` stores (`fake-indexeddb`, already installed
 * globally by `test/setup.ts`). jsdom supplies `window` for the engine's
 * `online` listener.
 *
 * Same cookie-jar `fetch` trick as `test/sync-auth-client.test.ts`: the
 * engine's calls are relative paths a browser would resolve against its own
 * page, which Node's `fetch` cannot do on its own.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { hashPassword } from '../server/auth/passwords.ts';
import { ACCOUNT_HEADER, createSyncEngine } from '../src/sync/engine.ts';
import { openStore } from '../src/store/store.ts';
import { openDatabase, allRecords } from '../src/store/db.ts';
import { birthNoteRevision } from '../src/store/notes.ts';
import { createClock, randomNodeId, tick } from '../src/store/hlc.ts';

const BOOTSTRAP_TOKEN = 'test-bootstrap-token';
const WAIT = { timeout: 5000 };

process.env.LOG_LEVEL = 'silent';

let dir: string;
let dbPath: string;
let app: FastifyInstance;
let baseUrl: string;
/** The bootstrapped account's id: every engine below syncs for it unless a test says otherwise (#1378). */
let aliceId: string;
let fetchCalls: { method: string; url: string }[] = [];
let dbCounter = 0;
const realFetch = globalThis.fetch;

function freshDbName(): string {
  dbCounter += 1;
  return `astraya-sync-engine-test-${String(dbCounter)}`;
}

async function listenAndBootstrap(dbPath: string): Promise<{ app: FastifyInstance; baseUrl: string; aliceId: string }> {
  const built = await build({ dbPath });
  await built.listen({ port: 0, host: '127.0.0.1' });
  const address = built.server.address();
  if (address === null || typeof address === 'string') throw new Error('server did not bind to a port');
  const url = `http://127.0.0.1:${String(address.port)}`;
  const setup = await realFetch(new URL('/api/setup', url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: BOOTSTRAP_TOKEN, username: 'alice', password: 'correct-horse-battery' }),
  });
  const { user } = (await setup.json()) as { user: { id: string } };
  return { app: built, baseUrl: url, aliceId: user.id };
}

/** A cookie-jar `fetch` for one session, resolving the engine's relative paths against `baseUrl`. */
function sessionFetch(): typeof fetch {
  let cookie: string | undefined;
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), baseUrl);
    fetchCalls.push({ method: init?.method ?? 'GET', url: url.pathname + url.search });
    const headers = new Headers(init?.headers);
    if (cookie !== undefined) headers.set('cookie', cookie);
    const response = await realFetch(url, { ...init, headers });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie !== null) cookie = setCookie.split(';')[0];
    return response;
  };
}

/** Signs `fetchImpl`'s cookie jar in as `username`, replacing whichever session it held before. */
async function logInWith(fetchImpl: typeof fetch, username: string, password: string): Promise<void> {
  const response = await fetchImpl(new URL('/api/auth/login', baseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) throw new Error(`login failed with status ${String(response.status)}`);
}

async function loginAs(username: string, password: string): Promise<typeof fetch> {
  const fetchImpl = sessionFetch();
  await logInWith(fetchImpl, username, password);
  return fetchImpl;
}

/** A second, ordinary account, inserted directly since `/api/setup` creates only the first one (#1378). */
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

/** Rows in one account's server log, read straight from the database so no route sits between the test and the data. */
function serverOpCount(userId: string): number {
  const raw = new DatabaseSync(dbPath, { readOnly: true });
  const row = raw.prepare('SELECT COUNT(*) AS count FROM ops WHERE user_id = ?').get(userId) as { count: number };
  raw.close();
  return row.count;
}

/** Lets a late response settle: anything the engine would do with it happens well inside this. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 500));
}

interface HeldPull {
  release?: () => void;
  signal?: AbortSignal | null;
}

/**
 * Wraps `fetchImpl` so the engine's first pull reaches the real server at once but its answer is held until the test
 * releases it: a response already on its way when the engine closes. The request goes out without the engine's abort
 * signal, so the hold, not the abort, decides when the answer lands; the signal is kept so the test can check it fired.
 */
function holdFirstPull(
  fetchImpl: typeof fetch,
  calls: { method: string; url: string }[],
  held: HeldPull,
): typeof fetch {
  let holding = true;
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), baseUrl);
    const method = init?.method ?? 'GET';
    calls.push({ method, url: url.pathname + url.search });
    if (holding && method === 'GET' && url.pathname === '/api/ops') {
      holding = false;
      held.signal = init?.signal ?? null;
      const response = await fetchImpl(input, { ...init, signal: null });
      await new Promise<void>((resolve) => {
        held.release = resolve;
      });
      return response;
    }
    return fetchImpl(input, init);
  };
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'astraya-sync-engine-test-'));
  dbPath = join(dir, 'astraya.db');
  process.env.ASTRAYA_BOOTSTRAP_TOKEN = BOOTSTRAP_TOKEN;
  process.env.ASTRAYA_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  const started = await listenAndBootstrap(dbPath);
  app = started.app;
  baseUrl = started.baseUrl;
  aliceId = started.aliceId;
  fetchCalls = [];
});

afterEach(async () => {
  globalThis.fetch = realFetch;
  await app.close();
  delete process.env.ASTRAYA_BOOTSTRAP_TOKEN;
  delete process.env.ASTRAYA_ENCRYPTION_KEY;
  rmSync(dir, { recursive: true, force: true });
});

describe('pushing', () => {
  it('sends a local write to the server and reports synced once it lands', async () => {
    globalThis.fetch = await loginAs('alice', 'correct-horse-battery');
    const store = await openStore({ name: freshDbName() });
    await store.mutate([{ entity: 'person', entityId: 'p1', field: 'displayName', value: 'Ada' }]);
    const engine = await createSyncEngine({ store, accountId: aliceId });
    try {
      await vi.waitFor(() => {
        expect(engine.status.kind).toBe('synced');
      }, WAIT);
      expect(engine.pending()).toBe(0);

      const pull = await globalThis.fetch(new URL('/api/ops', baseUrl), { headers: { [ACCOUNT_HEADER]: aliceId } });
      const { ops } = (await pull.json()) as { ops: { payload: string }[] };
      expect(ops).toHaveLength(1);
    } finally {
      engine.close();
      store.close();
    }
  });
});

describe('pulling', () => {
  it('merges a record another device already pushed under the same account', async () => {
    globalThis.fetch = await loginAs('alice', 'correct-horse-battery');

    const deviceA = await openStore({ name: freshDbName() });
    await deviceA.mutate([{ entity: 'person', entityId: 'p1', field: 'displayName', value: 'Ada' }]);
    const engineA = await createSyncEngine({ store: deviceA, accountId: aliceId });
    await vi.waitFor(() => {
      expect(engineA.status.kind).toBe('synced');
    }, WAIT);
    engineA.close();
    deviceA.close();

    const deviceB = await openStore({ name: freshDbName() });
    const engineB = await createSyncEngine({ store: deviceB, accountId: aliceId });
    try {
      await vi.waitFor(() => {
        expect(deviceB.state.people.get('p1')?.displayName).toBe('Ada');
      }, WAIT);
      // The pulled record lands before the engine's push round trip ends and it reports "synced" (#703): wait for
      // that too, rather than reading it the moment the record appears.
      await vi.waitFor(() => {
        expect(engineB.status.kind).toBe('synced');
      }, WAIT);
    } finally {
      engineB.close();
      deviceB.close();
    }
  });
});

describe('resuming', () => {
  it('picks up from the persisted cursor instead of re-pushing already-acknowledged records', async () => {
    globalThis.fetch = await loginAs('alice', 'correct-horse-battery');
    const name = freshDbName();

    const first = await openStore({ name });
    await first.mutate([{ entity: 'person', entityId: 'p1', field: 'displayName', value: 'Ada' }]);
    const engine1 = await createSyncEngine({ store: first, accountId: aliceId });
    await vi.waitFor(() => {
      expect(engine1.status.kind).toBe('synced');
    }, WAIT);
    engine1.close();
    first.close();

    fetchCalls = [];
    const second = await openStore({ name });
    const engine2 = await createSyncEngine({ store: second, accountId: aliceId });
    try {
      await vi.waitFor(() => {
        expect(engine2.status.kind).toBe('synced');
      }, WAIT);
      expect(fetchCalls.some((call) => call.method === 'POST' && call.url === '/api/ops')).toBe(false);
    } finally {
      engine2.close();
      second.close();
    }
  });
});

describe('device-local outgoing filtering (#324)', () => {
  it('does not re-push a record pulled from a peer', async () => {
    globalThis.fetch = await loginAs('alice', 'correct-horse-battery');

    const deviceA = await openStore({ name: freshDbName() });
    await deviceA.mutate([{ entity: 'person', entityId: 'p1', field: 'displayName', value: 'Ada' }]);
    const engineA = await createSyncEngine({ store: deviceA, accountId: aliceId });
    await vi.waitFor(() => {
      expect(engineA.status.kind).toBe('synced');
    }, WAIT);
    engineA.close();
    deviceA.close();

    const deviceBFetchCalls: { method: string; url: string }[] = [];
    const baseFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), baseUrl);
      deviceBFetchCalls.push({ method: init?.method ?? 'GET', url: url.pathname + url.search });
      return baseFetch(input, init);
    };

    const deviceB = await openStore({ name: freshDbName() });
    const engineB = await createSyncEngine({ store: deviceB, accountId: aliceId });
    try {
      await vi.waitFor(() => {
        expect(deviceB.state.people.get('p1')?.displayName).toBe('Ada');
      }, WAIT);
      await vi.waitFor(() => {
        expect(engineB.status.kind).toBe('synced');
      }, WAIT);
      expect(engineB.pending()).toBe(0);
      // Without the device-id filter, `store.outgoing()` would also return the record just
      // folded in by `receive()` (its hlc is past `cursor.pushed`), and this device would
      // re-POST a peer's own op straight back to the server.
      expect(deviceBFetchCalls.some((call) => call.method === 'POST')).toBe(false);
    } finally {
      engineB.close();
      deviceB.close();
    }
  });
});

describe('purge propagation (#308)', () => {
  it('propagates a purge to a peer that already synced the entity, and a fresh device never sees it', async () => {
    globalThis.fetch = await loginAs('alice', 'correct-horse-battery');

    const nameA = freshDbName();
    const deviceA = await openStore({ name: nameA });
    await deviceA.mutate([{ entity: 'person', entityId: 'p1', field: 'displayName', value: 'Ada' }]);
    const engineA = await createSyncEngine({ store: deviceA, accountId: aliceId });
    await vi.waitFor(() => {
      expect(engineA.status.kind).toBe('synced');
    }, WAIT);

    const nameB = freshDbName();
    const deviceB = await openStore({ name: nameB });
    const engineB = await createSyncEngine({ store: deviceB, accountId: aliceId });
    try {
      await vi.waitFor(() => {
        expect(deviceB.state.people.get('p1')?.displayName).toBe('Ada');
      }, WAIT);
      await vi.waitFor(() => {
        expect(engineB.status.kind).toBe('synced');
      }, WAIT);

      // Device A purges and pushes the marker. `status.kind` is already 'synced' from
      // the earlier sync, so it can't prove this push happened — `pending()` dropping
      // back to 0 can, since the purge just put a record on it.
      await deviceA.purge('person', 'p1');
      engineA.syncNow();
      await vi.waitFor(() => {
        expect(engineA.pending()).toBe(0);
      }, WAIT);

      // Device B, which already held the person, pulls the marker and both hides
      // and physically strips its own copy of the person's other records.
      engineB.syncNow();
      await vi.waitFor(() => {
        expect(deviceB.state.people.has('p1')).toBe(false);
      }, WAIT);
      expect(deviceB.state.deleted.people.has('p1')).toBe(false);

      const observer = await openDatabase(nameB);
      const remaining = (await allRecords(observer)).filter((record) => record.entityId === 'p1');
      observer.close();
      // Only the purge markers remain: one per entity a person purge covers (#919).
      expect(remaining.map((record) => record.entity).sort()).toEqual(['birthNote', 'consultationNote', 'person']);
      for (const record of remaining) expect(record).toMatchObject({ entityId: 'p1', field: 'purged', value: true });

      // A fresh device, signing in for the first time after the purge, never sees the person at all.
      const deviceC = await openStore({ name: freshDbName() });
      const engineC = await createSyncEngine({ store: deviceC, accountId: aliceId });
      try {
        await vi.waitFor(() => {
          expect(engineC.status.kind).toBe('synced');
        }, WAIT);
        expect(deviceC.state.people.has('p1')).toBe(false);
        expect(deviceC.state.deleted.people.has('p1')).toBe(false);
      } finally {
        engineC.close();
        deviceC.close();
      }
    } finally {
      engineB.close();
      deviceB.close();
      engineA.close();
      deviceA.close();
    }
  });
});

describe('pull resilience (#320)', () => {
  it("a corrupted row in a pulled page doesn't block the rows around it", async () => {
    const clock = createClock(randomNodeId());
    const first = tick(clock, Date.now());
    const second = tick(first.clock, Date.now() + 1);
    const goodBody = { entity: 'person', entityId: 'p1', field: 'displayName', value: 'Ada' };
    const goodRow = {
      seq: 1,
      hlc: first.hlc,
      deviceId: first.clock.nodeId,
      opVersion: 1,
      payload: Buffer.from(JSON.stringify(goodBody)).toString('base64'),
    };
    const badRow = {
      seq: 2,
      hlc: second.hlc,
      deviceId: second.clock.nodeId,
      opVersion: 1,
      // Not valid base64 (`!` isn't in the alphabet) — `fromWire`'s `atob` throws on this row.
      payload: 'not-valid-base64!!!',
    };

    globalThis.fetch = async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost');
      if (url.pathname === '/api/ops') {
        return new Response(JSON.stringify({ ops: [badRow, goodRow] }), { status: 200 });
      }
      return new Response(JSON.stringify({ ops: [] }), { status: 200 });
    };

    const store = await openStore({ name: freshDbName() });
    const engine = await createSyncEngine({ store, accountId: aliceId });
    try {
      await vi.waitFor(() => {
        expect(engine.status.kind).toBe('synced');
      }, WAIT);
      expect(store.state.people.get('p1')?.displayName).toBe('Ada');
    } finally {
      engine.close();
      store.close();
    }
  });
});

describe('failure', () => {
  it('reports a failing status carrying the error, rather than throwing out of the engine', async () => {
    delete process.env.ASTRAYA_ENCRYPTION_KEY;
    const disabledDir = mkdtempSync(join(tmpdir(), 'astraya-sync-engine-disabled-test-'));
    const disabled = await listenAndBootstrap(join(disabledDir, 'astraya.db'));
    baseUrl = disabled.baseUrl;

    try {
      globalThis.fetch = await loginAs('alice', 'correct-horse-battery');
      const store = await openStore({ name: freshDbName() });
      const engine = await createSyncEngine({ store, accountId: aliceId });
      try {
        await vi.waitFor(() => {
          expect(engine.status.kind).toBe('failing');
        }, WAIT);
        expect(engine.status.kind === 'failing' && engine.status.message.length > 0).toBe(true);
      } finally {
        engine.close();
        store.close();
      }
    } finally {
      await disabled.app.close();
      rmSync(disabledDir, { recursive: true, force: true });
    }
  });
});

// The tests below (#106) fully replace `globalThis.fetch` with a stub rather than talking to
// the `beforeEach`-started server, so they can control exactly which response — or which kind
// of failure to throw — the engine sees, independent of anything the relay would really do.

describe('error classification (#106)', () => {
  it('classifies fetch itself throwing as offline', async () => {
    globalThis.fetch = async () => {
      throw new TypeError('fetch failed');
    };
    const store = await openStore({ name: freshDbName() });
    const engine = await createSyncEngine({ store, accountId: aliceId });
    try {
      await vi.waitFor(() => {
        expect(engine.status.kind).toBe('failing');
      }, WAIT);
      expect(engine.status.kind === 'failing' && engine.status.message).toBe('No network connection.');
    } finally {
      engine.close();
      store.close();
    }
  });

  it('classifies a 401 as unauthorized, with a message pointing at signing in again', async () => {
    globalThis.fetch = async () => new Response(null, { status: 401 });
    const store = await openStore({ name: freshDbName() });
    const engine = await createSyncEngine({ store, accountId: aliceId });
    try {
      await vi.waitFor(() => {
        expect(engine.status.kind).toBe('failing');
      }, WAIT);
      expect(engine.status.kind === 'failing' && engine.status.message).toBe(
        'Your session has expired. Sign in again to keep syncing.',
      );
    } finally {
      engine.close();
      store.close();
    }
  });

  it('classifies a 5xx as a server problem', async () => {
    globalThis.fetch = async () => new Response(null, { status: 503 });
    const store = await openStore({ name: freshDbName() });
    const engine = await createSyncEngine({ store, accountId: aliceId });
    try {
      await vi.waitFor(() => {
        expect(engine.status.kind).toBe('failing');
      }, WAIT);
      expect(engine.status.kind === 'failing' && engine.status.message).toBe(
        'The server is having trouble (status 503).',
      );
    } finally {
      engine.close();
      store.close();
    }
  });

  it('classifies an unreadable response body as malformed', async () => {
    globalThis.fetch = async () => new Response('not json', { status: 200 });
    const store = await openStore({ name: freshDbName() });
    const engine = await createSyncEngine({ store, accountId: aliceId });
    try {
      await vi.waitFor(() => {
        expect(engine.status.kind).toBe('failing');
      }, WAIT);
      expect(engine.status.kind === 'failing' && engine.status.message).toBe('The server response could not be read.');
    } finally {
      engine.close();
      store.close();
    }
  });

  it('classifies a response missing its operations array as malformed', async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({}), { status: 200 });
    const store = await openStore({ name: freshDbName() });
    const engine = await createSyncEngine({ store, accountId: aliceId });
    try {
      await vi.waitFor(() => {
        expect(engine.status.kind).toBe('failing');
      }, WAIT);
      expect(engine.status.kind === 'failing' && engine.status.message).toBe(
        'The server response was missing its operations.',
      );
    } finally {
      engine.close();
      store.close();
    }
  });

  it('quarantines a clock-skewed op instead of retrying it forever (#312)', async () => {
    globalThis.fetch = async (_input, init) => {
      if (init?.method === 'POST') {
        const body = JSON.parse(init.body as string) as { ops: { hlc: string }[] };
        return new Response(JSON.stringify({ seqs: [], skipped: body.ops.map((op) => op.hlc) }), { status: 200 });
      }
      return new Response(JSON.stringify({ ops: [] }), { status: 200 });
    };
    const store = await openStore({ name: freshDbName() });
    await store.mutate([{ entity: 'person', entityId: 'p1', field: 'displayName', value: 'Ada' }]);
    const engine = await createSyncEngine({ store, accountId: aliceId });
    try {
      // No error, no retry loop: a quarantined op is still a completed push.
      await vi.waitFor(() => {
        expect(engine.status.kind).toBe('synced');
      }, WAIT);
      expect(engine.quarantined()).toBe(1);
      expect(engine.pending()).toBe(0);
    } finally {
      engine.close();
      store.close();
    }
  });

  it('classifies any other rejection on push using the server’s error field', async () => {
    globalThis.fetch = async (_input, init) => {
      if (init?.method === 'POST') {
        return new Response(JSON.stringify({ error: 'batch too large' }), { status: 400 });
      }
      return new Response(JSON.stringify({ ops: [] }), { status: 200 });
    };
    const store = await openStore({ name: freshDbName() });
    await store.mutate([{ entity: 'person', entityId: 'p1', field: 'displayName', value: 'Ada' }]);
    const engine = await createSyncEngine({ store, accountId: aliceId });
    try {
      await vi.waitFor(() => {
        expect(engine.status.kind).toBe('failing');
      }, WAIT);
      expect(engine.status.kind === 'failing' && engine.status.message).toBe('batch too large');
    } finally {
      engine.close();
      store.close();
    }
  });
});

describe('exponential backoff with jitter (#106)', () => {
  it('grows the retry delay after each consecutive failure', async () => {
    const attemptTimes: number[] = [];
    globalThis.fetch = async () => {
      attemptTimes.push(Date.now());
      return new Response(null, { status: 500 });
    };

    const store = await openStore({ name: freshDbName() });
    const engine = await createSyncEngine({ store, accountId: aliceId });
    try {
      await vi.waitFor(
        () => {
          expect(attemptTimes.length).toBeGreaterThanOrEqual(3);
        },
        { timeout: 10_000 },
      );
    } finally {
      engine.close();
      store.close();
    }

    const [t0, t1, t2] = attemptTimes;
    if (t0 === undefined || t1 === undefined || t2 === undefined) throw new Error('expected at least 3 attempts');
    const gap1 = t1 - t0;
    const gap2 = t2 - t1;
    // First backoff is BASE_RETRY_MS (1s) jittered to 50-100%; the second consecutive
    // failure's is double that, jittered the same way. Loose bounds to absorb test-runner
    // scheduling noise, but tight enough that "no backoff" or "no growth" would fail them.
    expect(gap1).toBeGreaterThan(300);
    expect(gap1).toBeLessThan(1300);
    expect(gap2).toBeGreaterThan(gap1);
    expect(gap2).toBeLessThan(2600);
  }, 10_000);
});

describe('onUnauthorized (#106)', () => {
  it('is called exactly once per failure episode, not on every backoff retry', async () => {
    globalThis.fetch = async () => new Response(null, { status: 401 });
    const store = await openStore({ name: freshDbName() });
    const onUnauthorized = vi.fn();
    const engine = await createSyncEngine({ store, accountId: aliceId, onUnauthorized });
    try {
      await vi.waitFor(() => {
        expect(onUnauthorized).toHaveBeenCalledTimes(1);
      }, WAIT);
      // Give at least one more backoff retry a chance to fire — still 401 every time — and
      // confirm the callback is not invoked again for it.
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      expect(onUnauthorized).toHaveBeenCalledTimes(1);
    } finally {
      engine.close();
      store.close();
    }
  }, 10_000);
});

describe('partial push recovery (#106)', () => {
  it('retries a push whose response never reached the client without duplicating the op server-side', async () => {
    const loggedIn = await loginAs('alice', 'correct-horse-battery');
    let postAttempts = 0;
    globalThis.fetch = async (input, init) => {
      if (init?.method === 'POST') {
        postAttempts += 1;
        // The real server processes this and commits the op — only the response back to the
        // client is what's simulated as lost, on the first attempt only.
        const response = await loggedIn(input, init);
        if (postAttempts === 1) throw new TypeError('network dropped mid-response');
        return response;
      }
      return loggedIn(input, init);
    };

    const store = await openStore({ name: freshDbName() });
    await store.mutate([{ entity: 'person', entityId: 'p1', field: 'displayName', value: 'Ada' }]);
    const engine = await createSyncEngine({ store, accountId: aliceId });
    try {
      await vi.waitFor(
        () => {
          expect(engine.status.kind).toBe('synced');
        },
        { timeout: 10_000 },
      );
      expect(postAttempts).toBeGreaterThanOrEqual(2);

      // The server's (user, hlc) uniqueness made the retried, identical chunk a no-op —
      // exactly one row, not two, despite the op having actually reached the server twice.
      const pull = await loggedIn(new URL('/api/ops', baseUrl), { headers: { [ACCOUNT_HEADER]: aliceId } });
      const { ops } = (await pull.json()) as { ops: unknown[] };
      expect(ops).toHaveLength(1);
    } finally {
      engine.close();
      store.close();
    }
  }, 10_000);
});

describe('local writes are never blocked by a failing sync (#106)', () => {
  it('accepts a mutate() while the engine is failing', async () => {
    globalThis.fetch = async () => new Response(null, { status: 500 });
    const store = await openStore({ name: freshDbName() });
    const engine = await createSyncEngine({ store, accountId: aliceId });
    try {
      await vi.waitFor(() => {
        expect(engine.status.kind).toBe('failing');
      }, WAIT);
      await store.mutate([{ entity: 'person', entityId: 'p1', field: 'displayName', value: 'Ada' }]);
      expect(store.state.people.get('p1')?.displayName).toBe('Ada');
    } finally {
      engine.close();
      store.close();
    }
  });
});

describe('an oversized legacy note stays out of the push queue (#919)', () => {
  it('keeps it local and reports synced, while an ordinary op behind it still lands', async () => {
    globalThis.fetch = await loginAs('alice', 'correct-horse-battery');
    const store = await openStore({ name: freshDbName() });
    await store.mutate([{ entity: 'person', entityId: 'p1', field: 'notes', value: 'a'.repeat(50_001) }]);
    await store.mutate([{ entity: 'person', entityId: 'p1', field: 'displayName', value: 'Ada' }]);
    const engine = await createSyncEngine({ store, accountId: aliceId });
    try {
      await vi.waitFor(() => {
        expect(engine.status.kind).toBe('synced');
      }, WAIT);
      expect(engine.pending()).toBe(0);

      const pull = await globalThis.fetch(new URL('/api/ops', baseUrl), { headers: { [ACCOUNT_HEADER]: aliceId } });
      const { ops } = (await pull.json()) as { ops: { payload: string }[] };
      expect(ops).toHaveLength(1);
      expect(store.outgoing().some((op) => op.field === 'notes')).toBe(true);
    } finally {
      engine.close();
      store.close();
    }
  });

  it('counts one held-back note, and keeps the status synced', async () => {
    globalThis.fetch = await loginAs('alice', 'correct-horse-battery');
    const store = await openStore({ name: freshDbName() });
    await store.mutate([{ entity: 'person', entityId: 'p1', field: 'notes', value: 'a'.repeat(50_001) }]);
    const engine = await createSyncEngine({ store, accountId: aliceId });
    try {
      await vi.waitFor(() => {
        expect(engine.status.kind).toBe('synced');
      }, WAIT);
      expect(engine.heldBack()).toBe(1);
      expect(engine.pending()).toBe(0);
      expect(engine.status.kind).toBe('synced');
    } finally {
      engine.close();
      store.close();
    }
  });

  it('counts zero held-back notes when no note is over the limit', async () => {
    globalThis.fetch = await loginAs('alice', 'correct-horse-battery');
    const store = await openStore({ name: freshDbName() });
    await store.mutate([{ entity: 'person', entityId: 'p1', field: 'notes', value: 'a short note' }]);
    const engine = await createSyncEngine({ store, accountId: aliceId });
    try {
      await vi.waitFor(() => {
        expect(engine.status.kind).toBe('synced');
      }, WAIT);
      expect(engine.heldBack()).toBe(0);
    } finally {
      engine.close();
      store.close();
    }
  });
});

describe('storage quota (#919)', () => {
  it('a 409 yields the quota state, schedules no retry, and keeps the local ops', async () => {
    const postAttempts: number[] = [];
    globalThis.fetch = async (_input, init) => {
      if (init?.method === 'POST') {
        postAttempts.push(Date.now());
        return new Response(JSON.stringify({ error: 'Storage quota exceeded (200000 ops).' }), { status: 409 });
      }
      return new Response(JSON.stringify({ ops: [] }), { status: 200 });
    };
    const store = await openStore({ name: freshDbName() });
    await store.mutate([{ entity: 'person', entityId: 'p1', field: 'displayName', value: 'Ada' }]);
    const engine = await createSyncEngine({ store, accountId: aliceId });
    try {
      await vi.waitFor(() => {
        expect(engine.status.kind).toBe('quota');
      }, WAIT);
      // The first backoff would fire within 1s. Waiting well past it shows no retry was scheduled.
      const attemptsAtQuota = postAttempts.length;
      await new Promise((resolve) => setTimeout(resolve, 2_500));
      expect(postAttempts).toHaveLength(attemptsAtQuota);
      // The local op is still in the log and still pending: nothing was discarded.
      expect(engine.pending()).toBe(1);
      expect(store.outgoing()).toHaveLength(1);
    } finally {
      engine.close();
      store.close();
    }
  }, 10_000);

  it('a user-initiated sync tries again after a quota refusal', async () => {
    let quotaFull = true;
    globalThis.fetch = async (_input, init) => {
      if (init?.method === 'POST') {
        if (quotaFull) return new Response(JSON.stringify({ error: 'quota' }), { status: 409 });
        return new Response(JSON.stringify({ seqs: [1], skipped: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({ ops: [] }), { status: 200 });
    };
    const store = await openStore({ name: freshDbName() });
    await store.mutate([{ entity: 'person', entityId: 'p1', field: 'displayName', value: 'Ada' }]);
    const engine = await createSyncEngine({ store, accountId: aliceId });
    try {
      await vi.waitFor(() => {
        expect(engine.status.kind).toBe('quota');
      }, WAIT);
      quotaFull = false;
      engine.syncNow();
      await vi.waitFor(() => {
        expect(engine.status.kind).toBe('synced');
      }, WAIT);
      expect(engine.pending()).toBe(0);
    } finally {
      engine.close();
      store.close();
    }
  }, 10_000);
});

describe('push batch size (#919)', () => {
  it('splits 16 near-maximum revisions across several requests, and the server accepts all of them', async () => {
    globalThis.fetch = await loginAs('alice', 'correct-horse-battery');
    const store = await openStore({ name: freshDbName() });
    // A 50,000-character CJK revision is about 150 KB of UTF-8 before base64, so 16 of them
    // cannot share one request under the per-batch byte cap.
    const text = '漢'.repeat(50_000);
    let parents: string[] = [];
    for (let i = 0; i < 16; i += 1) {
      const revisionId = `r-${String(i)}`;
      await store.mutate([birthNoteRevision('p1', revisionId, text, parents)]);
      parents = [revisionId];
    }
    const pushBodySizes: number[] = [];
    const loggedIn = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      if (init?.method === 'POST' && typeof init.body === 'string') pushBodySizes.push(init.body.length);
      return loggedIn(input, init);
    };
    const engine = await createSyncEngine({ store, accountId: aliceId });
    try {
      await vi.waitFor(
        () => {
          expect(engine.status.kind).toBe('synced');
        },
        { timeout: 20_000 },
      );
      expect(engine.pending()).toBe(0);
      expect(pushBodySizes.length).toBeGreaterThan(1);
      // Every request stays under the server's 1 MiB body limit (server/index.ts).
      for (const size of pushBodySizes) expect(size).toBeLessThan(1024 * 1024);

      const pull = await loggedIn(new URL('/api/ops', baseUrl), { headers: { [ACCOUNT_HEADER]: aliceId } });
      const { ops } = (await pull.json()) as { ops: unknown[] };
      expect(ops).toHaveLength(16);
    } finally {
      engine.close();
      store.close();
    }
  }, 30_000);

  it('a 413 for a batch of several ops is split and resent, not treated as a permanent failure', async () => {
    const loggedIn = await loginAs('alice', 'correct-horse-battery');
    const store = await openStore({ name: freshDbName() });
    await store.mutate([
      { entity: 'person', entityId: 'p1', field: 'displayName', value: 'Ada' },
      { entity: 'person', entityId: 'p2', field: 'displayName', value: 'Grace' },
    ]);
    let rejectedBatch = false;
    globalThis.fetch = async (input, init) => {
      if (init?.method === 'POST' && !rejectedBatch) {
        const body: unknown = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
        const ops = typeof body === 'object' && body !== null ? (body as { ops?: unknown[] }).ops : undefined;
        if (ops === undefined) throw new Error('expected a JSON push body');
        if (ops.length > 1) {
          rejectedBatch = true;
          return new Response(JSON.stringify({ error: 'Request body is too large' }), { status: 413 });
        }
      }
      return loggedIn(input, init);
    };
    const engine = await createSyncEngine({ store, accountId: aliceId });
    try {
      await vi.waitFor(() => {
        expect(engine.status.kind).toBe('synced');
      }, WAIT);
      expect(rejectedBatch).toBe(true);
      expect(engine.pending()).toBe(0);
    } finally {
      engine.close();
      store.close();
    }
  });

  it('a 413 for one op the server cannot take is kept pending and reported as failing', async () => {
    globalThis.fetch = async (_input, init) => {
      if (init?.method === 'POST') return new Response(JSON.stringify({ error: 'too large' }), { status: 413 });
      return new Response(JSON.stringify({ ops: [] }), { status: 200 });
    };
    const store = await openStore({ name: freshDbName() });
    await store.mutate([{ entity: 'person', entityId: 'p1', field: 'displayName', value: 'Ada' }]);
    const engine = await createSyncEngine({ store, accountId: aliceId });
    try {
      await vi.waitFor(() => {
        expect(engine.status.kind).toBe('failing');
      }, WAIT);
      expect(engine.pending()).toBe(1);
    } finally {
      engine.close();
      store.close();
    }
  });
});

describe('closing and account binding (#1378)', () => {
  it('a pull answered after close writes nothing and starts no further request', async () => {
    const jar = await loginAs('alice', 'correct-horse-battery');
    // A peer's record already on the server, so the late pull page has something the engine could wrongly write.
    const clock = createClock(randomNodeId());
    const peer = tick(clock, Date.now());
    const peerBody = { entity: 'person', entityId: 'peer', field: 'displayName', value: 'Peer' };
    const seeded = await jar(new URL('/api/ops', baseUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [ACCOUNT_HEADER]: aliceId },
      body: JSON.stringify({
        ops: [
          {
            hlc: peer.hlc,
            deviceId: peer.clock.nodeId,
            opVersion: 1,
            payload: Buffer.from(JSON.stringify(peerBody)).toString('base64'),
          },
        ],
      }),
    });
    expect(seeded.status).toBe(200);

    const calls: { method: string; url: string }[] = [];
    const held: HeldPull = {};
    globalThis.fetch = holdFirstPull(jar, calls, held);
    const store = await openStore({ name: freshDbName() });
    await store.mutate([{ entity: 'person', entityId: 'p1', field: 'displayName', value: 'Ada' }]);
    const engine = await createSyncEngine({ store, accountId: aliceId });
    try {
      await vi.waitFor(() => {
        expect(held.release).toBeDefined();
      }, WAIT);
      engine.close();
      expect(held.signal?.aborted).toBe(true);
      held.release?.();
      await settle();

      expect(calls).toEqual([{ method: 'GET', url: '/api/ops?since=0' }]);
      expect(store.state.people.has('peer')).toBe(false);
      expect((await store.getSyncCursor()).pulled).toBeUndefined();
      expect(serverOpCount(aliceId)).toBe(1);
    } finally {
      engine.close();
      store.close();
    }
  });

  it('refuses a sync whose session cookie belongs to another account, and writes nothing to either', async () => {
    const bobId = await insertUser('bob', 'another-strong-password');
    globalThis.fetch = await loginAs('bob', 'another-strong-password');
    const store = await openStore({ name: freshDbName() });
    await store.mutate([{ entity: 'person', entityId: 'p1', field: 'displayName', value: 'Ada' }]);
    const onUnauthorized = vi.fn();
    const engine = await createSyncEngine({ store, accountId: aliceId, onUnauthorized });
    try {
      await vi.waitFor(() => {
        expect(engine.status.kind).toBe('failing');
      }, WAIT);
      expect(engine.status.kind === 'failing' && engine.status.message).toBe(
        'This device is now signed in to a different account.',
      );
      expect(onUnauthorized).toHaveBeenCalledTimes(1);
      expect(engine.pending()).toBe(1);
      expect(serverOpCount(bobId)).toBe(0);
      expect(serverOpCount(aliceId)).toBe(0);
    } finally {
      engine.close();
      store.close();
    }
  });

  it('an empty pull page answered after close and an account switch writes nothing to either account', async () => {
    const bobId = await insertUser('bob', 'another-strong-password');
    // One browser, one cookie jar: signing in as bob replaces alice's cookie for every later request.
    const jar = await loginAs('alice', 'correct-horse-battery');
    const calls: { method: string; url: string }[] = [];
    const held: HeldPull = {};
    globalThis.fetch = holdFirstPull(jar, calls, held);
    const store = await openStore({ name: freshDbName() });
    await store.mutate([{ entity: 'person', entityId: 'p1', field: 'displayName', value: 'Ada' }]);
    const engine = await createSyncEngine({ store, accountId: aliceId });
    try {
      await vi.waitFor(() => {
        expect(held.release).toBeDefined();
      }, WAIT);
      engine.close();
      await logInWith(jar, 'bob', 'another-strong-password');
      // Alice's server log is empty, so the held answer is an empty page: the case where the old loop went straight on
      // to push alice's local record under bob's cookie.
      held.release?.();
      await settle();

      expect(calls.filter((call) => call.method === 'POST')).toEqual([]);
      expect(serverOpCount(bobId)).toBe(0);
      expect(serverOpCount(aliceId)).toBe(0);
      expect(engine.pending()).toBe(1);
    } finally {
      engine.close();
      store.close();
    }
  });
});
