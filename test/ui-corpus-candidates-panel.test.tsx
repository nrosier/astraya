// @vitest-environment jsdom
/**
 * `CorpusCandidatesPanel` shows what each candidate means instead of its key (#428), in the
 * interface language, ordered by meaning, with the key kept as secondary text and the accessible
 * name of each row's checkbox naming the meaning.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CorpusCandidatesPanel } from '../src/ui/CorpusCandidatesPanel.js';
import { setLocale } from '../src/ui/locale.js';

function candidate(id: string, key: string, text: string, source = 'llm-fill'): object {
  return {
    id,
    key,
    locale: 'en',
    text,
    tier: 'core',
    tags: [],
    source,
    triageSignal: 'unchecked',
    triageScore: undefined,
    status: 'pending',
    createdAt: new Date().toISOString(),
    decidedAt: undefined,
    decidedByUsername: undefined,
  };
}

// Deliberately in the order the key sorts as text: house 10 before house 2.
const CANDIDATES = [
  candidate('c1', 'planet-in-house:sun:10', 'Career.'),
  candidate('c2', 'planet-in-house:sun:2', 'Resources.'),
  candidate('c3', 'planet-in-sign:sun:2', 'Curious.'),
  candidate('c4', 'dignity-state:mars:ruler', 'At home.', 'classical-seed'),
];

let mounted: { container: HTMLElement; root: Root } | undefined;

beforeEach(() => {
  setLocale('en');
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(JSON.stringify({ candidates: CANDIDATES })))),
  );
});

afterEach(() => {
  if (mounted !== undefined) {
    act(() => {
      mounted?.root.unmount();
    });
    mounted.container.remove();
    mounted = undefined;
  }
  vi.unstubAllGlobals();
});

async function mount(): Promise<HTMLElement> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<CorpusCandidatesPanel />);
    await Promise.resolve();
    await Promise.resolve();
  });
  mounted = { container, root };
  return container;
}

/** Each candidate is a card (#816 D-816b), not a table row. */
const rows = (container: HTMLElement): HTMLElement[] => [
  ...container.querySelectorAll<HTMLElement>('ul.corpus-entry-list > li.corpus-candidate'),
];

describe('CorpusCandidatesPanel shows what a candidate means (#428)', () => {
  it('shows each candidate as its meaning, with the key beneath', async () => {
    const container = await mount();
    const row = rows(container).find(
      (r) => r.querySelector('code.corpus-entry-key')?.textContent === 'planet-in-house:sun:2',
    );
    expect(row?.querySelector('.corpus-entry-meaning .entry-meaning')?.textContent).toBe('Sun in the 2nd house');
    expect(container.querySelector('table')).toBeNull();
  });

  it('lists them by what they mean, so the 2nd house comes before the 10th', async () => {
    const container = await mount();
    expect(rows(container).map((r) => r.querySelector('.corpus-entry-meaning .entry-meaning')?.textContent)).toEqual([
      'Sun in Gemini',
      'Sun in the 2nd house',
      'Sun in the 10th house',
      'Mars in its own sign (ruler)',
    ]);
  });

  it('names the meaning in each row’s checkbox, not the key', async () => {
    const container = await mount();
    const labels = [...container.querySelectorAll('ul.corpus-entry-list input[type="checkbox"]')].map((box) =>
      box.closest('label')?.textContent.trim(),
    );
    expect(labels).toEqual([
      'Sun in Gemini',
      'Sun in the 2nd house',
      'Sun in the 10th house',
      'Mars in its own sign (ruler)',
    ]);
  });

  it('words the candidates in Dutch when the interface is Dutch', async () => {
    setLocale('nl');
    const container = await mount();
    expect(rows(container).map((r) => r.querySelector('.corpus-entry-meaning .entry-meaning')?.textContent)).toEqual([
      'Zon in Tweelingen',
      'Zon in het 2e huis',
      'Zon in het 10e huis',
      'Mars in eigen teken (heerser)',
    ]);
    expect(container.querySelector('h2.sr-only')?.textContent).toBe('Kandidaten');
  });

  it('renders the shared EmptyState when no candidate matches', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify({ candidates: [] })))),
    );
    const container = await mount();
    const empty = container.querySelector('div.empty.primitive-empty-state');
    expect(empty?.querySelector('p.primitive-empty-state-message')?.textContent).toBe(
      'No candidates match these filters.',
    );
    expect(container.querySelector('ul.corpus-entry-list')).toBeNull();
  });
});

describe('CorpusCandidatesPanel cards and actions (#816 D-816b)', () => {
  it('keeps the bulk-select bar above the cards, with bulk Accept as the quiet action', async () => {
    const container = await mount();
    const bar = container.querySelector('.corpus-bulk-bar');
    const list = container.querySelector('ul.corpus-entry-list');
    expect(bar).not.toBeNull();
    expect(bar && list && bar.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const accept = [...(bar?.querySelectorAll('button') ?? [])].find(
      (button) => button.textContent === 'Accept selected',
    );
    expect(accept?.classList.contains('quiet')).toBe(true);
    expect(accept?.classList.contains('primitive-button-primary')).toBe(false);
  });

  it('gives each card a primary Accept and a danger Reject, and no green', async () => {
    const container = await mount();
    const card = rows(container)[0];
    const accept = [...(card?.querySelectorAll('button') ?? [])].find((button) => button.textContent === 'Accept');
    const reject = [...(card?.querySelectorAll('button') ?? [])].find((button) => button.textContent === 'Reject');
    expect(accept?.classList.contains('primitive-button-primary')).toBe(true);
    expect(reject?.classList.contains('danger')).toBe(true);
    expect(container.innerHTML).not.toMatch(/green|success/i);
  });

  it('shows a mismatch with a danger badge and the pending count with the sort rule', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              candidates: [
                { ...candidate('c9', 'planet-in-sign:sun:0', 'Mismatch.'), triageSignal: 'mismatch', triageScore: 0.2 },
              ],
            }),
          ),
        ),
      ),
    );
    const container = await mount();
    const badge = container.querySelector('.corpus-entry-tags .primitive-badge[data-tone="danger"]');
    expect(badge?.textContent).toBe('Diverges from tradition (0.20)');
    expect(container.querySelector('.corpus-queue-count')?.textContent).toBe('1 pending review');
    expect(container.querySelector('.corpus-queue-summary')?.textContent).toContain('Sorted worst triage score first');
  });
});
