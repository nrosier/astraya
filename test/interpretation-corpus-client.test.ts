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

describe('loadRuntimeCorpus: the reader’s own corrections (#1338)', () => {
  const CHUNK = `${CORPUS_BASE_URL}en.json`;
  const COMMITTED = { ...ENTRY, text: 'The committed text for the Sun in Aries.' };
  const OVERRIDE = { ...ENTRY, text: 'The approved server-wide text for the Sun in Aries.' };
  const OTHER = { ...ENTRY, key: 'planet-in-sign:moon:0', text: 'The committed text for the Moon in Aries.' };

  function withOverrides(overrides: readonly CorpusEntry[]): typeof fetch {
    return vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url === CHUNK) return new Response(JSON.stringify([COMMITTED, OTHER]));
      if (url === '/api/corpus-overrides/en') return new Response(JSON.stringify({ entries: overrides }));
      return new Response('not found', { status: 404 });
    });
  }

  const textOf = (entries: readonly CorpusEntry[], key: string): string | undefined =>
    entries.find((entry) => entry.key === key)?.text;

  it('a correction wins over the approved override and over the committed text', async () => {
    const layer = new Map([[ENTRY.key, 'My own text for the Sun in Aries.']]);
    const withOverride = await loadRuntimeCorpus('en', withOverrides([OVERRIDE]), layer);
    expect(textOf(withOverride, ENTRY.key)).toBe('My own text for the Sun in Aries.');
    const withoutOverride = await loadRuntimeCorpus('en', withOverrides([]), layer);
    expect(textOf(withoutOverride, ENTRY.key)).toBe('My own text for the Sun in Aries.');
    // Another key is untouched.
    expect(textOf(withOverride, OTHER.key)).toBe(OTHER.text);
  });

  it('with no correction the override, or else the committed text, is used unchanged', async () => {
    expect(textOf(await loadRuntimeCorpus('en', withOverrides([OVERRIDE])), ENTRY.key)).toBe(OVERRIDE.text);
    expect(textOf(await loadRuntimeCorpus('en', withOverrides([])), ENTRY.key)).toBe(COMMITTED.text);
    expect(textOf(await loadRuntimeCorpus('en', withOverrides([]), new Map()), ENTRY.key)).toBe(COMMITTED.text);
  });

  it('keeps everything but the text of a corrected entry, and ignores a correction for a missing entry', async () => {
    const layer = new Map([
      [ENTRY.key, 'My own text for the Sun in Aries.'],
      ['planet-in-sign:venus:0', 'There is no such entry to correct.'],
    ]);
    const entries = await loadRuntimeCorpus('en', withOverrides([]), layer);
    expect(entries).toHaveLength(2);
    expect(entries.find((entry) => entry.key === ENTRY.key)).toEqual({
      ...COMMITTED,
      text: 'My own text for the Sun in Aries.',
    });
  });
});
