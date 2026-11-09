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
    vi.fn((url: string) =>
      Promise.resolve(
        new Response(
          JSON.stringify(url.includes('corpus-submissions') ? { submissions: [] } : { candidates: CANDIDATES }),
        ),
      ),
    ),
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

describe('CorpusCandidatesPanel lists user submissions (#1338)', () => {
  it('shows a "Submitted by users" section with status, text and submitter', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        Promise.resolve(
          new Response(
            JSON.stringify(
              url.includes('corpus-submissions')
                ? {
                    submissions: [
                      {
                        id: 's1',
                        key: 'planet-in-sign:sun:2',
                        locale: 'en',
                        text: 'A user suggested this wording.',
                        status: 'pending',
                        submitterId: 'u1',
                        submitterUsername: 'bob',
                        licenceVersion: 'v1',
                        acceptedAt: new Date().toISOString(),
                        createdAt: new Date().toISOString(),
                        decidedAt: undefined,
                        decidedByUsername: undefined,
                      },
                    ],
                  }
                : { candidates: [] },
            ),
          ),
        ),
      ),
    );
    const container = await mount();
    const section = container.querySelector<HTMLElement>('section.corpus-submissions');
    expect(section?.querySelector('h2')?.textContent).toBe('Submitted by users');
    expect(section?.textContent).toContain('A user suggested this wording.');
    expect(section?.textContent).toContain('Submitted by bob');
    expect(section?.textContent).toContain('Pending');
    expect(section?.querySelectorAll('button')).toHaveLength(2);
  });
});

describe('CorpusSubmissionsSection approve and reject (#1338 slice 3)', () => {
  const submission = (id: string, status: string, extra: Record<string, unknown> = {}) => ({
    id,
    key: 'planet-in-sign:sun:2',
    locale: 'en',
    text: 'A user suggested this wording.',
    status,
    submitterId: 'u1',
    submitterUsername: 'bob',
    licenceVersion: 'v1',
    acceptedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    ...extra,
  });

  it('asks for confirmation, posts the approval, then reloads and shows the decided row without buttons', async () => {
    let decided = false;
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
          calls.push(`${init.method} ${url}`);
          decided = true;
          return Promise.resolve(new Response(JSON.stringify({ id: 's1', status: 'approved' })));
        }
        if (url.includes('corpus-submissions')) {
          const row = decided
            ? submission('s1', 'approved', { decidedAt: new Date().toISOString(), decidedByUsername: 'alice' })
            : submission('s1', 'pending');
          return Promise.resolve(new Response(JSON.stringify({ submissions: [row] })));
        }
        return Promise.resolve(new Response(JSON.stringify({ candidates: [] })));
      }),
    );
    const container = await mount();
    const section = container.querySelector<HTMLElement>('section.corpus-submissions');
    const buttons = (): HTMLButtonElement[] => [...(section?.querySelectorAll('button') ?? [])];
    act(() => {
      buttons()[0]?.click();
    });
    // Nothing is sent before the confirmation.
    expect(calls).toHaveLength(0);
    expect(section?.textContent).toContain('every reader sees');
    const confirm = buttons().find((button) => button.textContent === 'Approve and publish');
    await act(async () => {
      confirm?.click();
      await Promise.resolve();
    });
    expect(calls).toEqual(['POST /api/corpus-submissions/s1/approve']);
    expect(section?.textContent).toContain('Approved');
    expect(section?.textContent).toContain('by alice');
    expect(buttons()).toHaveLength(0);
  });
});

describe('CorpusSubmissionsSection shows a word diff (#1338)', () => {
  const row = (status: string, text: string): object => ({
    id: 's1',
    key: 'planet-in-sign:sun:2',
    locale: 'en',
    text,
    status,
    submitterId: 'u1',
    submitterUsername: 'bob',
    licenceVersion: 'v1',
    acceptedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  });

  function stubFetch(submissionRow: object, committed: string, override?: string): void {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('corpus-submissions'))
          return Promise.resolve(new Response(JSON.stringify({ submissions: [submissionRow] })));
        if (url.includes('/api/corpus-overrides/')) {
          const entries = override === undefined ? [] : [{ key: 'planet-in-sign:sun:2', text: override }];
          return Promise.resolve(new Response(JSON.stringify({ entries })));
        }
        if (url.endsWith('corpus/en.json')) {
          return Promise.resolve(new Response(JSON.stringify([{ key: 'planet-in-sign:sun:2', text: committed }])));
        }
        return Promise.resolve(new Response(JSON.stringify({ candidates: [] })));
      }),
    );
  }

  async function settled(): Promise<void> {
    await act(async () => {
      for (let n = 0; n < 10; n++) await Promise.resolve();
    });
  }

  it('shows both the old and the new text, with removals and additions marked by a symbol and a label', async () => {
    stubFetch(row('pending', 'A rough sea of feeling.'), 'A calm sea of feeling.');
    const container = await mount();
    await settled();
    const section = container.querySelector<HTMLElement>('section.corpus-submissions');
    const panes = [...(section?.querySelectorAll('.text-diff') ?? [])];
    expect(panes).toHaveLength(2);
    // Old text complete, with the removed word marked.
    expect(panes[0]?.textContent).toContain('calm');
    expect(panes[0]?.textContent).toContain('sea of feeling.');
    const removed = section?.querySelector('del.text-diff-removed');
    expect(removed?.textContent).toContain('calm');
    expect(removed?.textContent).toContain('Removed:');
    expect(removed?.textContent).toContain('\u2212');
    // New text complete, with the added word marked.
    expect(panes[1]?.textContent).toContain('rough');
    const added = section?.querySelector('ins.text-diff-added');
    expect(added?.textContent).toContain('rough');
    expect(added?.textContent).toContain('Added:');
    expect(added?.textContent).toContain('+');
    // Removals appear only in the old text, additions only in the new text.
    expect(panes[0]?.querySelector('ins')).toBeNull();
    expect(panes[1]?.querySelector('del')).toBeNull();
    expect(section?.textContent).toContain('Current text (live now)');
  });

  it('compares a pending row with the live override, not the committed text', async () => {
    stubFetch(row('pending', 'Override words. Plus more.'), 'Committed words.', 'Override words.');
    const container = await mount();
    await settled();
    const panes = [...container.querySelectorAll('.text-diff')];
    expect(panes[0]?.textContent).toContain('Override words.');
    expect(panes[0]?.textContent).not.toContain('Committed');
  });

  it('compares a decided row with the shipped text', async () => {
    stubFetch(row('approved', 'Override words.'), 'Committed words.', 'Override words.');
    const container = await mount();
    await settled();
    const section = container.querySelector<HTMLElement>('section.corpus-submissions');
    expect(section?.textContent).toContain('Text before this decision (as shipped)');
    expect(section?.querySelector('.text-diff')?.textContent).toContain('Committed');
  });

  it('still shows the suggested text, plainly, when the current text cannot be loaded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        url.includes('corpus-submissions')
          ? Promise.resolve(new Response(JSON.stringify({ submissions: [row('pending', 'Only the new text.')] })))
          : Promise.resolve(new Response('no', { status: 500 })),
      ),
    );
    const container = await mount();
    await settled();
    const section = container.querySelector<HTMLElement>('section.corpus-submissions');
    expect(section?.textContent).toContain('Only the new text.');
    expect(section?.textContent).toContain('could not be loaded');
    expect(section?.querySelector('ins, del')).toBeNull();
  });
});
