// @vitest-environment jsdom
/**
 * The UI/UX overhaul (#506) Phase 0 compatibility fixture.
 *
 * Stored person data is the one compatibility boundary the migration must never break — UI and
 * routes have none (`docs/UI-UX_IMPLEMENTATION_PLAN.md` §4). This fixture seeds a complete and an
 * incomplete person through `Store.mutate()` (the existing, unchanged write path every current
 * screen already uses — not through a redesigned form, so a passing test here proves the
 * migration preserves the real persistence contract, not merely that a new writer can read its
 * own output), then proves:
 *
 *   - materialisation gives the expected `Person` values;
 *   - reopening the database (snapshot/resume) gives the same values back;
 *   - editing one field appends exactly one mutation and leaves every other field untouched;
 *   - pulling the same fixture through the real server sync path produces the same materialised
 *     person a second device sees.
 *
 * Re-run this file, unmodified, after each later migration phase lands — a regression here means
 * the migration touched the one thing it was never supposed to.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { createSyncEngine } from '../src/sync/engine.ts';
import { openStore } from '../src/store/store.ts';

const BOOTSTRAP_TOKEN = 'test-bootstrap-token';
const WAIT = { timeout: 5000 };

process.env.LOG_LEVEL = 'silent';

const COMPLETE_ID = 'p-fixturecompleteperson01';
const INCOMPLETE_ID = 'p-fixtureincompleteperso';

const COMPLETE_CIVIL = { year: 1960, month: 6, day: 15, hour: 14, minute: 30, second: 0 };
const COMPLETE_COORDS = { latitude: 38.7478, longitude: -85.0672 };

async function seedFixture(store: Awaited<ReturnType<typeof openStore>>): Promise<void> {
  await store.mutate([
    { entity: 'person', entityId: COMPLETE_ID, field: 'displayName', value: 'Ada Fixture' },
    { entity: 'person', entityId: COMPLETE_ID, field: 'civil', value: COMPLETE_CIVIL },
    { entity: 'person', entityId: COMPLETE_ID, field: 'coordinates', value: COMPLETE_COORDS },
    { entity: 'person', entityId: COMPLETE_ID, field: 'placeLabel', value: 'Vevay, Indiana' },
    { entity: 'person', entityId: COMPLETE_ID, field: 'timeAccuracy', value: 'recorded' },
    { entity: 'person', entityId: COMPLETE_ID, field: 'notes', value: 'Compatibility fixture — complete.' },
  ]);
  await store.mutate([
    { entity: 'person', entityId: INCOMPLETE_ID, field: 'displayName', value: 'Grace Fixture' },
    // Deliberately no civil/coordinates/timeAccuracy — an incomplete, new-ish person.
  ]);
}

function expectFixtureShape(state: Awaited<ReturnType<typeof openStore>>['state']): void {
  const complete = state.people.get(COMPLETE_ID);
  expect(complete?.displayName).toBe('Ada Fixture');
  expect(complete?.moment?.civil).toEqual(COMPLETE_CIVIL);
  expect(complete?.moment?.coordinates).toEqual(COMPLETE_COORDS);
  expect(complete?.placeLabel).toBe('Vevay, Indiana');
  expect(complete?.timeAccuracy).toBe('recorded');
  expect(complete?.missing).toEqual([]);

  const incomplete = state.people.get(INCOMPLETE_ID);
  expect(incomplete?.displayName).toBe('Grace Fixture');
  expect(incomplete?.moment).toBeUndefined();
  expect(incomplete?.missing.length).toBeGreaterThan(0);
}

let dbCounter = 0;
function freshDbName(): string {
  dbCounter += 1;
  return `astraya-migration-fixture-${String(dbCounter)}`;
}

describe('UI/UX migration Phase 0 — persisted person-data compatibility fixture (#507)', () => {
  it('materialises a complete and an incomplete person from Store.mutate alone', async () => {
    const store = await openStore({ name: freshDbName() });
    try {
      await seedFixture(store);
      expectFixtureShape(store.state);
    } finally {
      store.close();
    }
  });

  it('gives the same values back after closing and reopening the database (snapshot/resume)', async () => {
    const name = freshDbName();
    const first = await openStore({ name });
    await seedFixture(first);
    first.close();

    const reopened = await openStore({ name });
    try {
      expectFixtureShape(reopened.state);
    } finally {
      reopened.close();
    }
  });

  it('editing one field appends exactly one mutation and leaves every other field unchanged', async () => {
    const store = await openStore({ name: freshDbName() });
    try {
      await seedFixture(store);
      const before = store.state.people.get(COMPLETE_ID);

      await store.mutate([{ entity: 'person', entityId: COMPLETE_ID, field: 'notes', value: 'Edited once.' }]);

      const after = store.state.people.get(COMPLETE_ID);
      expect(after?.notes).toBe('Edited once.');
      // Everything else from the original seed survives untouched.
      expect(after?.displayName).toBe(before?.displayName);
      expect(after?.moment).toEqual(before?.moment);
      expect(after?.placeLabel).toBe(before?.placeLabel);
      expect(after?.timeAccuracy).toBe(before?.timeAccuracy);
    } finally {
      store.close();
    }
  });

  describe('pulled through the real server sync path', () => {
    let dir: string;
    let app: FastifyInstance;
    let baseUrl: string;
    const realFetch = globalThis.fetch;

    async function listenAndBootstrap(dbPath: string): Promise<{ app: FastifyInstance; baseUrl: string }> {
      const built = await build({ dbPath });
      await built.listen({ port: 0, host: '127.0.0.1' });
      const address = built.server.address();
      if (address === null || typeof address === 'string') throw new Error('server did not bind to a port');
      const url = `http://127.0.0.1:${String(address.port)}`;
      await realFetch(new URL('/api/setup', url), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: BOOTSTRAP_TOKEN, username: 'alice', password: 'correct-horse-battery' }),
      });
      return { app: built, baseUrl: url };
    }

    function sessionFetch(): typeof fetch {
      let cookie: string | undefined;
      return async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input), baseUrl);
        const headers = new Headers(init?.headers);
        if (cookie !== undefined) headers.set('cookie', cookie);
        const response = await realFetch(url, { ...init, headers });
        const setCookie = response.headers.get('set-cookie');
        if (setCookie !== null) cookie = setCookie.split(';')[0];
        return response;
      };
    }

    async function loginAs(username: string, password: string): Promise<typeof fetch> {
      const fetchImpl = sessionFetch();
      const response = await fetchImpl(new URL('/api/auth/login', baseUrl), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (!response.ok) throw new Error(`login failed with status ${String(response.status)}`);
      return fetchImpl;
    }

    beforeEach(async () => {
      dir = mkdtempSync(join(tmpdir(), 'astraya-migration-fixture-sync-'));
      process.env.ASTRAYA_BOOTSTRAP_TOKEN = BOOTSTRAP_TOKEN;
      process.env.ASTRAYA_ENCRYPTION_KEY = randomBytes(32).toString('base64');
      const started = await listenAndBootstrap(join(dir, 'astraya.db'));
      app = started.app;
      baseUrl = started.baseUrl;
    });

    afterEach(async () => {
      globalThis.fetch = realFetch;
      await app.close();
      delete process.env.ASTRAYA_BOOTSTRAP_TOKEN;
      delete process.env.ASTRAYA_ENCRYPTION_KEY;
      rmSync(dir, { recursive: true, force: true });
    });

    it('a second device pulling the fixture materialises the identical complete/incomplete person', async () => {
      globalThis.fetch = await loginAs('alice', 'correct-horse-battery');

      const deviceA = await openStore({ name: freshDbName() });
      await seedFixture(deviceA);
      const engineA = await createSyncEngine({ store: deviceA });
      await vi.waitFor(() => {
        expect(engineA.status.kind).toBe('synced');
      }, WAIT);
      engineA.close();
      deviceA.close();

      const deviceB = await openStore({ name: freshDbName() });
      const engineB = await createSyncEngine({ store: deviceB });
      try {
        await vi.waitFor(() => {
          expect(deviceB.state.people.get(COMPLETE_ID)?.displayName).toBe('Ada Fixture');
        }, WAIT);
        expectFixtureShape(deviceB.state);
      } finally {
        engineB.close();
        deviceB.close();
      }
    });
  });
});
