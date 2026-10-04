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
    persona: undefined,
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

const rows = (container: HTMLElement): HTMLTableRowElement[] => [
  ...container.querySelectorAll<HTMLTableRowElement>('tbody tr'),
];

describe('CorpusCandidatesPanel shows what a candidate means (#428)', () => {
  it('shows each candidate as its meaning, with the key beneath', async () => {
    const container = await mount();
    const row = rows(container).find((r) => r.querySelector('.entry-key')?.textContent === 'planet-in-house:sun:2');
    expect(row?.querySelector('.entry-meaning')?.textContent).toBe('Sun in the 2nd house');
    expect(row?.querySelector('td:nth-child(2)')?.textContent.startsWith('Sun in the 2nd house')).toBe(true);
    expect(container.querySelector('thead')?.textContent).toContain('Entry');
  });

  it('lists them by what they mean, so the 2nd house comes before the 10th', async () => {
    const container = await mount();
    expect(rows(container).map((r) => r.querySelector('.entry-meaning')?.textContent)).toEqual([
      'Sun in Gemini',
      'Sun in the 2nd house',
      'Sun in the 10th house',
      'Mars in its own sign (ruler)',
    ]);
  });

  it('names the meaning in each row’s checkbox, not the key', async () => {
    const container = await mount();
    const labels = [...container.querySelectorAll('tbody input[type="checkbox"]')].map((box) =>
      box.getAttribute('aria-label'),
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
    expect(rows(container).map((r) => r.querySelector('.entry-meaning')?.textContent)).toEqual([
      'Zon in Tweelingen',
      'Zon in het 2e huis',
      'Zon in het 10e huis',
      'Mars in eigen teken (heerser)',
    ]);
    expect(container.querySelector('thead')?.textContent).toContain('Onderdeel');
  });
});
