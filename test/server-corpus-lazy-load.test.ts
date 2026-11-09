/**
 * The interpretation corpus (about 11 MB of JSON, both locales) must load on the first Tier 2
 * request that needs it, not when the server boots (#1367).
 *
 * How "not loaded" is proven: `server/interpretation/corpus.ts` is the only server module that
 * reaches `src/interpretation/index.ts` (and through it the two JSON files), via a memoised dynamic
 * `import()`. Two checks follow. (1) Static: no server file has a static import of that module or of
 * the corpus JSON, so importing `server/index.ts` cannot load them. (2) Runtime: after `build()` with
 * the key unset, `isCorpusLoaded()` is false. An RSS ceiling was rejected because RSS is noisy across
 * the shared vitest workers; the import graph is deterministic.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';

process.env.LOG_LEVEL = 'silent';

const SERVER_DIR = resolve(import.meta.dirname, '../server');
const SESSION_COOKIE = 'astraya_session';

function serverFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? serverFiles(join(dir, entry.name))
      : entry.name.endsWith('.ts')
        ? [join(dir, entry.name)]
        : [],
  );
}

/** Specifiers of static `import`/`export ... from` statements (comments stripped). */
function staticSpecifiers(file: string): string[] {
  const source = readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  return [...source.matchAll(/(?:^|\n)\s*(?:import|export)\b[^;]*?\bfrom\s*['"]([^'"]+)['"]/g)].map((m) => m[1] ?? '');
}

describe('the corpus is not in the server static import graph (#1367)', () => {
  it('no server file statically imports interpretation/index or the corpus JSON', () => {
    const offenders = serverFiles(SERVER_DIR).flatMap((file) =>
      staticSpecifiers(file)
        .filter((specifier) => /interpretation\/index\.ts$|corpus\/(en|nl)\.json$/.test(specifier))
        .map((specifier) => `${file} -> ${specifier}`),
    );
    expect(offenders).toEqual([]);
  });

  it('server/interpretation/corpus.ts reaches it only through a dynamic import', () => {
    const file = join(SERVER_DIR, 'interpretation/corpus.ts');
    expect(readFileSync(file, 'utf8')).toContain("import('../../src/interpretation/index.ts')");
    expect(staticSpecifiers(file).filter((specifier) => !specifier.includes('schema'))).toEqual([]);
  });
});

describe('getCorpus', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('loads on the first call and hands every later call the same corpus', async () => {
    const { getCorpus, isCorpusLoaded } = await import('../server/interpretation/corpus.ts');
    expect(isCorpusLoaded()).toBe(false);
    const first = getCorpus();
    expect(getCorpus()).toBe(first);
    const corpus = await first;
    expect(corpus.length).toBeGreaterThan(0);
    expect(await getCorpus()).toBe(corpus);
    expect(isCorpusLoaded()).toBe(true);
  });
});

describe('build() and the Tier 2 key (#1367)', () => {
  let dir: string;
  let app: FastifyInstance | undefined;
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    vi.resetModules();
    dir = mkdtempSync(join(tmpdir(), 'astraya-corpus-lazy-'));
    process.env.ASTRAYA_BOOTSTRAP_TOKEN = 'test-bootstrap-token';
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
    globalThis.fetch = realFetch;
    delete process.env.ASTRAYA_BOOTSTRAP_TOKEN;
    delete process.env.ASTRAYA_ENCRYPTION_KEY;
    delete process.env.ASTRAYA_INTERPRETATION_API_KEY;
    rmSync(dir, { recursive: true, force: true });
  });

  it('does not load the corpus when ASTRAYA_INTERPRETATION_API_KEY is unset', async () => {
    delete process.env.ASTRAYA_INTERPRETATION_API_KEY;
    const { build } = await import('../server/index.ts');
    const corpus = await import('../server/interpretation/corpus.ts');
    app = await build({ dbPath: join(dir, 'astraya.db') });
    await app.ready();
    expect(corpus.isCorpusLoaded()).toBe(false);
  });

  it('loads it on the first grounded request with the key set, then reuses it', async () => {
    process.env.ASTRAYA_INTERPRETATION_API_KEY = 'test-gemini-key';
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: 'pass' }] } }],
            usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
          }),
        ),
    );
    globalThis.fetch = fetchMock;
    const { build } = await import('../server/index.ts');
    const corpus = await import('../server/interpretation/corpus.ts');
    app = await build({ dbPath: join(dir, 'astraya.db') });
    const setup = await app.inject({
      method: 'POST',
      url: '/api/setup',
      payload: { token: 'test-bootstrap-token', username: 'alice', password: 'correct-horse-battery' },
    });
    const sessionId = setup.cookies.find((c) => c.name === SESSION_COOKIE)?.value ?? '';
    expect(corpus.isCorpusLoaded()).toBe(false);

    const grounded = {
      personId: 'p-aaaaaaaaaaaaaaaa',
      placementKeys: ['dignity-state:sun:ruler'],
      customPrompt: 'warm and encouraging, focused on career growth',
      locale: 'en',
    };
    await app.inject({
      method: 'POST',
      url: '/api/interpretation/generate',
      cookies: { [SESSION_COOKIE]: sessionId },
      payload: grounded,
    });
    expect(corpus.isCorpusLoaded()).toBe(true);
    const loaded = await corpus.getCorpus();

    await app.inject({
      method: 'POST',
      url: '/api/interpretation/generate',
      cookies: { [SESSION_COOKIE]: sessionId },
      payload: grounded,
    });
    expect(await corpus.getCorpus()).toBe(loaded);
  });
});
