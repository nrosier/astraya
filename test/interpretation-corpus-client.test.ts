/**
 * Tests for runtime corpus loading (#212): the browser-side counterpart to
 * `index.ts`'s synchronous, whole-corpus `CORPUS` export.
 */
import { describe, expect, it, vi } from 'vitest';
import { CORPUS_BASE_URL, loadRuntimeCorpus } from '../src/interpretation/corpus-client.js';
import type { CorpusEntry } from '../src/interpretation/schema.js';

const ENTRY: CorpusEntry = {
  key: 'planet-in-sign:sun:0',
  locale: 'en',
  text: 'Neutral text.',
  tier: 'core',
  tags: [],
  provenance: { source: 'hand-written' },
};

function fakeFetch(byUrl: ReadonlyMap<string, readonly CorpusEntry[]>): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const body = byUrl.get(url);
    if (body === undefined) return new Response('not found', { status: 404 });
    return new Response(JSON.stringify(body));
  });
}

describe('loadRuntimeCorpus (#212)', () => {
  it('fetches the locale’s file', async () => {
    const fetchImpl = fakeFetch(new Map([[`${CORPUS_BASE_URL}en.json`, [ENTRY]]]));

    const result = await loadRuntimeCorpus('en', fetchImpl);

    expect(result).toEqual([ENTRY]);
    // Plus one call for the (soft-failing) admin-overrides fetch, #292.
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('scopes chunk URLs to the requested locale', async () => {
    const fetchImpl = fakeFetch(new Map([[`${CORPUS_BASE_URL}nl.json`, [ENTRY]]]));

    await loadRuntimeCorpus('nl', fetchImpl);

    expect(fetchImpl).toHaveBeenCalledWith(`${CORPUS_BASE_URL}nl.json`);
  });

  it('throws, naming the failed file, rather than silently returning partial text', async () => {
    const fetchImpl = fakeFetch(new Map([[`${CORPUS_BASE_URL}en.json`, [ENTRY]]]));

    await expect(loadRuntimeCorpus('nl', fetchImpl)).rejects.toThrow(/nl\.json/);
  });

  it('replaces a static entry with a matching admin override (#292)', async () => {
    const overridden: CorpusEntry = { ...ENTRY, text: 'Corrected text.' };
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url === `${CORPUS_BASE_URL}en.json`) return new Response(JSON.stringify([ENTRY]));
      if (url === '/api/corpus-overrides/en') return new Response(JSON.stringify({ entries: [overridden] }));
      return new Response('not found', { status: 404 });
    });

    const result = await loadRuntimeCorpus('en', fetchImpl);

    expect(result).toEqual([overridden]);
  });

  it('still returns static entries when the override fetch fails (e.g. a static, serverless deploy)', async () => {
    const fetchImpl = fakeFetch(new Map([[`${CORPUS_BASE_URL}en.json`, [ENTRY]]]));

    const result = await loadRuntimeCorpus('en', fetchImpl);

    expect(result).toEqual([ENTRY]);
  });
});
