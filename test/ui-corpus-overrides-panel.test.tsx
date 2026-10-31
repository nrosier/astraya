// @vitest-environment jsdom
/**
 * A jsdom smoke test for `CorpusOverridesPanel` (#292), in the style of
 * `ui-report-view.test.tsx`: mount with `createRoot`, interact with real DOM
 * nodes via a stubbed `global.fetch`, no React Testing Library. The fetch
 * stub is stateful (a small in-memory `overrides` array) so a save/reset
 * round-trip is visible the same way it would be against the real server.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CorpusOverridesPanel } from '../src/ui/CorpusOverridesPanel.js';
import { corpusOverridesPanelMessages } from '../src/ui/CorpusOverridesPanel.messages.js';
import { setLocale } from '../src/ui/locale.js';

const NEUTRAL_ENTRY = {
  key: 'planet-in-sign:sun:0',
  locale: 'en',
  text: 'A neutral placement description.',
  tier: 'core',
  tags: ['sun'],
  provenance: { source: 'hand-written' },
};

const OTHER_ENTRY = {
  key: 'planet-in-sign:moon:1',
  locale: 'en',
  text: 'A different placement entirely.',
  tier: 'notable',
  tags: ['moon'],
  provenance: { source: 'hand-written' },
};

interface FakeOverride {
  readonly id: string;
  readonly key: string;
  readonly locale: string;
  readonly text: string;
  readonly tier: string;
  readonly tags: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly updatedByUserId: string;
  readonly updatedByUsername: string;
}

/**
 * React overrides the `value` property on a controlled input/textarea instance itself, so
 * setting `.value = ...` directly and dispatching `input` looks like "no change" to it. Going
 * through the prototype's original setter, the same trick React Testing Library's
 * `fireEvent`/`userEvent` use internally, makes the change visible to React's own tracking.
 */
function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

function urlOf(input: RequestInfo | URL): string {
  return typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
}

function makeFetchMock(corpus: readonly object[] = [NEUTRAL_ENTRY, OTHER_ENTRY]): {
  fetch: typeof fetch;
  overrides: FakeOverride[];
} {
  const overrides: FakeOverride[] = [];
  let nextId = 1;

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    await Promise.resolve();
    const url = urlOf(input);
    const method = init?.method ?? 'GET';

    if (url === '/corpus/en.json') return new Response(JSON.stringify(corpus));

    if (url.startsWith('/api/corpus-overrides/')) {
      return new Response(
        JSON.stringify({
          entries: overrides.map((o) => ({
            key: o.key,
            locale: o.locale,
            text: o.text,
            tier: o.tier,
            tags: o.tags,
            provenance: { source: 'hand-written' },
          })),
        }),
      );
    }

    if (url.startsWith('/api/admin/corpus-overrides') && method === 'GET') {
      return new Response(JSON.stringify({ overrides }));
    }

    if (url === '/api/admin/corpus-overrides' && method === 'PUT') {
      const body = JSON.parse(init?.body as string) as {
        key: string;
        locale: string;
        text: string;
        tier: string;
        tags: readonly string[];
      };
      const now = new Date().toISOString();
      const override: FakeOverride = {
        id: `ov-${String(nextId)}`,
        key: body.key,
        locale: body.locale,
        text: body.text,
        tier: body.tier,
        tags: body.tags,
        createdAt: now,
        updatedAt: now,
        updatedByUserId: 'u1',
        updatedByUsername: 'alice',
      };
      nextId += 1;
      const existing = overrides.findIndex((o) => o.key === body.key);
      if (existing === -1) overrides.push(override);
      else overrides[existing] = override;
      return new Response(JSON.stringify({ override }));
    }

    if (url.startsWith('/api/admin/corpus-overrides/') && method === 'DELETE') {
      const id = url.split('/').pop();
      const index = overrides.findIndex((o) => o.id === id);
      if (index !== -1) overrides.splice(index, 1);
      return new Response(JSON.stringify({ ok: true }));
    }

    return new Response('not found', { status: 404 });
  });

  return { fetch: fetchMock, overrides };
}

function findButton(container: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button')).find((candidate) => candidate.textContent === text);
  if (!(button instanceof HTMLButtonElement)) throw new Error(`test fixture bug: no button with text "${text}"`);
  return button;
}

function searchInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector('.corpus-toolbar input[type="text"]');
  if (!(input instanceof HTMLInputElement)) throw new Error('test fixture bug: no search input');
  return input;
}

/** Each entry is a card (#816 D-816c), in the list the panel renders. */
function tableRows(container: HTMLElement): readonly HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('ul.corpus-entry-list > li.corpus-entry'));
}

/**
 * `loadRuntimeCorpus` appends overridden entries at the end of the merged array rather than
 * keeping their original position, so a row's index shifts once it has an override — find it
 * by its key's own cell instead of assuming a position.
 */
function editButtonForKey(container: HTMLElement, key: string): HTMLButtonElement {
  // The card's header names the key in its code badge (#816).
  const row = tableRows(container).find(
    (candidate) => candidate.querySelector('code.corpus-entry-key')?.textContent === key,
  );
  const button = row?.querySelector('.corpus-entry-head button');
  if (!(button instanceof HTMLButtonElement)) throw new Error(`test fixture bug: no edit button for row "${key}"`);
  return button;
}

/**
 * Flushes both microtasks and the next macrotask turn — needed after an action that chains
 * several fetches (e.g. reset: delete, then reload the corpus and the override list), where a
 * fixed number of bare `await Promise.resolve()` ticks isn't reliably enough.
 */
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function mount(): Promise<{ container: HTMLElement; root: Root }> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<CorpusOverridesPanel />);
    await Promise.resolve();
    await Promise.resolve();
  });
  return { container, root };
}

describe('CorpusOverridesPanel (#292)', () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    setLocale('en');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup?.();
    cleanup = undefined;
  });

  it('lists corpus entries and narrows them with the search box', async () => {
    const { fetch: fetchMock } = makeFetchMock();
    vi.stubGlobal('fetch', fetchMock);
    const { container, root } = await mount();
    cleanup = () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    };

    expect(tableRows(container)).toHaveLength(2);

    await act(async () => {
      setNativeValue(searchInput(container), 'moon');
      await Promise.resolve();
    });

    const rows = tableRows(container);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.textContent).toContain('planet-in-sign:moon:1');
    expect(rows[0]?.textContent).toContain('Moon in Taurus');
  });

  it('shows each entry as a card: key badge, category and tier tags, Edit, meaning and the whole text (#816)', async () => {
    const longText = `${'A long placement description that goes on and on. '.repeat(8)}The very last words.`;
    const { fetch: fetchMock } = makeFetchMock([{ ...NEUTRAL_ENTRY, text: longText }, OTHER_ENTRY]);
    vi.stubGlobal('fetch', fetchMock);
    const { container, root } = await mount();
    cleanup = () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    };

    // No table: entries are cards in a list (#816 D-816c).
    expect(container.querySelector('table')).toBeNull();
    const first = tableRows(container)[0];
    expect(first?.querySelector('.corpus-entry-head > code.corpus-entry-key')?.textContent).toBe(NEUTRAL_ENTRY.key);
    expect(first?.querySelector('p.corpus-entry-text')?.textContent).toBe(longText);
    expect(first?.textContent).not.toContain('…');
    const badges = Array.from(first?.querySelectorAll('.corpus-entry-tags .primitive-badge') ?? []).map(
      (badge) => badge.textContent,
    );
    expect(badges).toEqual(['Planet in sign', 'Core']);
    expect(first?.querySelector('.corpus-entry-head button')?.textContent).toBe(
      corpusOverridesPanelMessages.en.editButton,
    );
  });

  it('editing and saving a correction marks the entry Overridden', async () => {
    const { fetch: fetchMock } = makeFetchMock();
    vi.stubGlobal('fetch', fetchMock);
    const { container, root } = await mount();
    cleanup = () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    };

    const t = corpusOverridesPanelMessages.en;

    await act(async () => {
      editButtonForKey(container, NEUTRAL_ENTRY.key).click();
      await Promise.resolve();
    });

    const textarea = container.querySelector('textarea');
    if (!(textarea instanceof HTMLTextAreaElement)) throw new Error('test fixture bug: no textarea in edit form');

    await act(async () => {
      setNativeValue(textarea, 'A corrected description.');
      await Promise.resolve();
    });

    await act(async () => {
      findButton(container, t.saveButton).click();
      await flush();
    });

    const rows = tableRows(container);
    expect(rows.some((row) => row.textContent.includes(t.overriddenStatus))).toBe(true);
    expect(rows.some((row) => row.textContent.includes('A corrected description.'))).toBe(true);
  });

  it('resetting a correction reverts it to the corpus default', async () => {
    const { fetch: fetchMock, overrides } = makeFetchMock();
    overrides.push({
      id: 'ov-existing',
      key: NEUTRAL_ENTRY.key,
      locale: 'en',
      text: 'A corrected description.',
      tier: 'core',
      tags: ['sun'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedByUserId: 'u1',
      updatedByUsername: 'alice',
    });
    vi.stubGlobal('fetch', fetchMock);
    const { container, root } = await mount();
    cleanup = () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    };

    const t = corpusOverridesPanelMessages.en;
    expect(tableRows(container).some((row) => row.textContent.includes(t.overriddenStatus))).toBe(true);

    await act(async () => {
      editButtonForKey(container, NEUTRAL_ENTRY.key).click();
      await Promise.resolve();
    });

    await act(async () => {
      findButton(container, t.resetButton).click();
      await Promise.resolve();
    });

    await act(async () => {
      findButton(container, t.resetPermanentlyButton).click();
      await flush();
    });

    expect(overrides).toHaveLength(0);
    expect(tableRows(container).every((row) => !row.textContent.includes(t.overriddenStatus))).toBe(true);
  });
});

/** One entry of the committed corpus's own shape, for the cases below. */
function corpusEntry(key: string, text: string, tier = 'core'): object {
  return { key, locale: 'en', text, tier, tags: [], provenance: { source: 'hand-written' } };
}

const MEANING_CORPUS = [
  corpusEntry('planet-in-house:sun:10', 'Career is where the Sun shines.'),
  corpusEntry('planet-in-house:sun:2', 'Resources carry the Sun.'),
  corpusEntry('planet-in-house:sun:3', 'Words and learning carry the Sun.'),
  corpusEntry('planet-in-sign:sun:2', 'A curious Sun.'),
  corpusEntry('planet-in-sign:moon:1', 'A steady Moon.'),
  corpusEntry('aspect-pair:square:mars:venus', 'Desire meets will.'),
  corpusEntry('sign-on-cusp:2:3', 'Gemini opens the third house.'),
  corpusEntry('not-a-real-key', 'An entry the schema cannot read.'),
];

describe('CorpusOverridesPanel shows what an entry means (#428)', () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    setLocale('en');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup?.();
    cleanup = undefined;
  });

  async function mountWith(corpus: readonly object[]): Promise<HTMLElement> {
    const { fetch: fetchMock } = makeFetchMock(corpus);
    vi.stubGlobal('fetch', fetchMock);
    const { container, root } = await mount();
    cleanup = () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    };
    return container;
  }

  // A card's meaning is its `.entry-meaning`; a key the schema cannot read has none, so its key is shown.
  const meanings = (container: HTMLElement): (string | undefined)[] =>
    tableRows(container).map(
      (row) =>
        row.querySelector('.corpus-entry-meaning .entry-meaning')?.textContent ??
        row.querySelector('code.corpus-entry-key')?.textContent,
    );
  const search = async (container: HTMLElement, value: string): Promise<void> => {
    await act(async () => {
      setNativeValue(searchInput(container), value);
      await Promise.resolve();
    });
  };

  it('shows each entry as its meaning, with the key beneath as secondary text', async () => {
    const container = await mountWith(MEANING_CORPUS);
    const row = tableRows(container).find(
      (r) => r.querySelector('code.corpus-entry-key')?.textContent === 'planet-in-house:sun:3',
    );
    expect(row?.querySelector('.corpus-entry-meaning .entry-meaning')?.textContent).toBe('Sun in the 3rd house');
    expect(row?.querySelector('code.corpus-entry-key')?.textContent).toBe('planet-in-house:sun:3');
  });

  it('reads the zero-based sign index as the sign and the house number as the house', async () => {
    const container = await mountWith(MEANING_CORPUS);
    expect(meanings(container)).toContain('Sun in Gemini');
    expect(meanings(container)).toContain('Sun in the 2nd house');
    expect(meanings(container)).toContain('Gemini on the cusp of the 3rd house');
    expect(meanings(container)).toContain('Mars square Venus');
  });

  it('shows a key the schema cannot read once, as it is', async () => {
    const container = await mountWith(MEANING_CORPUS);
    const row = tableRows(container).find(
      (r) => r.querySelector('code.corpus-entry-key')?.textContent === 'not-a-real-key',
    );
    expect(row?.querySelector('.entry-meaning')).toBeNull();
    expect(row?.querySelector('.corpus-entry-meaning')).toBeNull();
  });

  it('lists entries by what they mean, so the 2nd house comes before the 10th', async () => {
    const container = await mountWith(MEANING_CORPUS);
    expect(meanings(container)).toEqual([
      'Sun in Gemini',
      'Moon in Taurus',
      'Sun in the 2nd house',
      'Sun in the 3rd house',
      'Sun in the 10th house',
      'Gemini on the cusp of the 3rd house',
      'Mars square Venus',
      'not-a-real-key',
    ]);
  });

  it('finds entries by their meaning, by the key, and by the text', async () => {
    const container = await mountWith(MEANING_CORPUS);
    await search(container, 'sun 3rd house');
    expect(meanings(container)).toEqual(['Sun in the 3rd house']);

    await search(container, 'gemini');
    expect(meanings(container)).toEqual(['Sun in Gemini', 'Gemini on the cusp of the 3rd house']);

    await search(container, 'planet-in-house:sun:10');
    expect(meanings(container)).toEqual(['Sun in the 10th house']);

    await search(container, 'Career');
    expect(meanings(container)).toEqual(['Sun in the 10th house']);

    await search(container, '  SQUARE   venus ');
    expect(meanings(container)).toEqual(['Mars square Venus']);

    await search(container, 'sun saturn');
    expect(tableRows(container)).toHaveLength(0);
    const empty = container.querySelector('div.empty.primitive-empty-state');
    expect(empty?.querySelector('p.primitive-empty-state-message')?.textContent).toBe(
      'No entries match these filters.',
    );
    expect(container.querySelector('ul.corpus-entry-list')).toBeNull();
  });

  it('names the categories in the filter in words, and filters by them', async () => {
    const container = await mountWith(MEANING_CORPUS);
    const select = [...container.querySelectorAll('select')].find((candidate) =>
      [...candidate.options].some((option) => option.value === 'planet-in-house'),
    );
    if (select === undefined) throw new Error('test fixture bug: no category filter');
    const option = [...select.options].find((o) => o.value === 'planet-in-house');
    expect(option?.textContent).toBe('Planet in house');
    expect([...select.options].some((o) => o.textContent === 'planet-in-house')).toBe(false);

    await act(async () => {
      select.value = 'planet-in-house';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
    });
    expect(meanings(container)).toEqual(['Sun in the 2nd house', 'Sun in the 3rd house', 'Sun in the 10th house']);
    // The category column names it too.
    expect(tableRows(container)[0]?.textContent).toContain('Planet in house');
  });

  it('names the entry in the editor and in the reset confirmation, with its key', async () => {
    const container = await mountWith(MEANING_CORPUS);
    await act(async () => {
      editButtonForKey(container, 'planet-in-house:sun:3').click();
      await Promise.resolve();
    });
    const form = container.querySelector('form');
    expect(form?.querySelector('strong')?.textContent).toBe('Sun in the 3rd house');
    expect(form?.querySelector('code.entry-key')?.textContent).toBe('planet-in-house:sun:3');
  });

  it('names the entry in the reset confirmation, with its key', async () => {
    const { fetch: fetchMock, overrides } = makeFetchMock(MEANING_CORPUS);
    overrides.push({
      id: 'ov-1',
      key: 'planet-in-house:sun:3',
      locale: 'en',
      text: 'A corrected description.',
      tier: 'core',
      tags: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedByUserId: 'u1',
      updatedByUsername: 'alice',
    });
    vi.stubGlobal('fetch', fetchMock);
    const { container, root } = await mount();
    cleanup = () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    };
    await act(async () => {
      editButtonForKey(container, 'planet-in-house:sun:3').click();
      await Promise.resolve();
    });
    await act(async () => {
      findButton(container, corpusOverridesPanelMessages.en.resetButton).click();
      await Promise.resolve();
    });
    const warning = container.querySelector('p.warning');
    expect(warning?.textContent).toContain('Reset "Sun in the 3rd house (planet-in-house:sun:3)"');
  });

  it('words the entries in Dutch when the interface is Dutch', async () => {
    setLocale('nl');
    const container = await mountWith(MEANING_CORPUS);
    expect(meanings(container)).toContain('Zon in Tweelingen');
    expect(meanings(container)).toContain('Zon in het 3e huis');
    expect(meanings(container)).toContain('Mars vierkant Venus');
    expect(container.querySelector('h2.sr-only')?.textContent).toBe('Onderdelen');
    // Search by the Dutch meaning.
    await search(container, 'zon 3e huis');
    expect(meanings(container)).toEqual(['Zon in het 3e huis']);
  });

  it('has an accessible search label that says what can be searched', async () => {
    const container = await mountWith(MEANING_CORPUS);
    expect(container.textContent).toContain('Search (meaning, key or text)');
  });
});

describe('CorpusOverridesPanel entry cards: overridden accent (#816 D-816c)', () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    setLocale('en');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup?.();
    cleanup = undefined;
  });

  async function mountWithOverride(): Promise<HTMLElement> {
    const { fetch: fetchMock, overrides } = makeFetchMock([NEUTRAL_ENTRY, OTHER_ENTRY]);
    overrides.push({
      id: 'ov-accent',
      key: NEUTRAL_ENTRY.key,
      locale: 'en',
      text: 'A corrected description.',
      tier: 'core',
      tags: ['sun'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedByUserId: 'u1',
      updatedByUsername: 'alice',
    });
    vi.stubGlobal('fetch', fetchMock);
    const { container, root } = await mount();
    cleanup = () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    };
    return container;
  }

  it('gives an overridden entry the corpus-entry-overridden class, with an Overridden badge', async () => {
    const container = await mountWithOverride();
    const card = tableRows(container).find(
      (row) => row.querySelector('code.corpus-entry-key')?.textContent === NEUTRAL_ENTRY.key,
    );
    expect(card?.classList.contains('corpus-entry-overridden')).toBe(true);
    expect(card?.dataset.overridden).toBe('true');
    const badge = [...(card?.querySelectorAll('.corpus-entry-tags .primitive-badge') ?? [])].find(
      (b) => b.textContent === corpusOverridesPanelMessages.en.overriddenStatus,
    );
    expect(badge?.getAttribute('data-tone')).toBe('accent');
  });

  it('leaves a non-overridden entry as a plain card with no accent class and no Overridden badge', async () => {
    const container = await mountWithOverride();
    const card = tableRows(container).find(
      (row) => row.querySelector('code.corpus-entry-key')?.textContent === OTHER_ENTRY.key,
    );
    expect(card?.classList.contains('corpus-entry-overridden')).toBe(false);
    expect(card?.dataset.overridden).toBe('false');
    expect(card?.textContent).not.toContain(corpusOverridesPanelMessages.en.overriddenStatus);
  });

  it('marks an overridden card with a 2px --accent border on all four sides (#826 item 11), and keeps the 1px card default', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const css = readFileSync(join(import.meta.dirname, '..', 'src', 'ui', 'app.css'), 'utf8');
    const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const rule = /\.corpus-entry-overridden\s*\{([^}]*)\}/.exec(stripped);
    expect(rule?.[1]).toMatch(/border:\s*2px solid var\(--accent\)/);
    expect(rule?.[1]).not.toMatch(/box-shadow/);
    const card = /\.corpus-entry\s*\{([^}]*)\}/.exec(stripped);
    expect(card?.[1]).toMatch(/border:\s*1px solid var\(--line\)/);
  });
});
