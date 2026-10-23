// @vitest-environment jsdom
/**
 * The Past interpretations tab (#761): the list of the user's stored AI interpretations, the viewer modal, and the
 * in-app delete confirmation (never a browser dialog). Mounted the same way as `ui-pdf-ai-interpretation-picker.test.tsx`.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SavedInterpretationDetail, SavedInterpretationSummary } from '../src/interpretation/tier2-client.js';
import { SavedInterpretationsPanel } from '../src/ui/SavedInterpretationsPanel.js';
import { savedInterpretationsPanelMessages } from '../src/ui/SavedInterpretationsPanel.messages.js';
import { reportViewMessages } from '../src/ui/ReportView.messages.js';
import { savedTypeLabel } from '../src/ui/result-basis-label.js';
import { formatSavedTime } from '../src/ui/saved-time.js';
import { setLocale } from '../src/ui/locale.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  list: vi.fn<(scope: unknown) => Promise<readonly SavedInterpretationSummary[]>>(),
  unlinked: vi.fn<(scope: unknown) => Promise<readonly SavedInterpretationSummary[]>>(),
  get: vi.fn(),
  remove: vi.fn(),
}));
// The person's list and the unlinked list (#768) are separate requests; each scope gets its own mock.
vi.mock('../src/interpretation/tier2-client.js', () => ({
  listSavedInterpretations: (scope: { personId: string } | { unlinked: true }) =>
    'unlinked' in scope ? mocks.unlinked(scope) : mocks.list(scope),
  getSavedInterpretation: mocks.get,
  deleteSavedInterpretation: mocks.remove,
}));

const t = savedInterpretationsPanelMessages.en;
const AI_LABEL = 'AI interpretation';

function summary(id: string, overrides: Partial<SavedInterpretationSummary> = {}): SavedInterpretationSummary {
  return {
    id,
    mode: 'freeform',
    locale: 'en',
    createdAt: '2026-03-10T16:30:00Z',
    description: null,
    kind: 'whole-chart',
    basis: { kind: 'whole-chart' },
    ...overrides,
  };
}

function detail(id: string): SavedInterpretationDetail {
  return {
    ...summary(id, { description: 'Warm and short' }),
    sections: [
      { heading: 'Core identity', body: 'Core body text.' },
      { heading: 'Relationships', body: 'Relationship body text.' },
    ],
  };
}

let root: Root | undefined;
let container: HTMLElement | undefined;

const PERSON = 'p-abcdefghijklmnop';

async function mount(options: { readonly personId?: string } = { personId: PERSON }): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<SavedInterpretationsPanel personId={options.personId} />);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
  return container;
}

/** Lets every pending promise chain (list, detail, delete) settle inside `act`. */
async function flush(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}

/** The first button under `scope` matching `selector`, or a fixture error: keeps the tests free of unchecked casts. */
function requiredButton(scope: ParentNode, selector: string): HTMLButtonElement {
  const found = scope.querySelector(selector);
  if (!(found instanceof HTMLButtonElement)) throw new Error(`test fixture bug: no button matches "${selector}"`);
  return found;
}

/** The first element under `scope` matching `selector`, or a fixture error. */
function requiredElement(scope: ParentNode, selector: string): HTMLElement {
  const found = scope.querySelector(selector);
  if (!(found instanceof HTMLElement)) throw new Error(`test fixture bug: no element matches "${selector}"`);
  return found;
}

function buttonWithText(scope: ParentNode, text: string): HTMLButtonElement {
  const found = Array.from(scope.querySelectorAll('button')).find((b) => b.textContent.trim() === text);
  if (!(found instanceof HTMLButtonElement)) throw new Error(`test fixture bug: no button "${text}"`);
  return found;
}

function rows(c: HTMLElement): HTMLLIElement[] {
  return Array.from(c.querySelectorAll<HTMLLIElement>('li.saved-interpretation-row'));
}

function rowFor(c: HTMLElement, index: number): HTMLLIElement {
  const row = rows(c)[index];
  if (row === undefined) throw new Error(`test fixture bug: no row ${String(index)}`);
  return row;
}

async function click(element: HTMLElement): Promise<void> {
  await act(async () => {
    element.click();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  localStorage.clear();
  setLocale('en');
  mocks.unlinked.mockResolvedValue([]);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = undefined;
  container = undefined;
  mocks.list.mockReset();
  mocks.unlinked.mockReset();
  mocks.get.mockReset();
  mocks.remove.mockReset();
});

describe('SavedInterpretationsPanel: the list', () => {
  it('shows a loading line while the list loads, then the list only (no extra items)', async () => {
    let resolveList: (value: readonly SavedInterpretationSummary[]) => void = () => undefined;
    mocks.list.mockReturnValue(new Promise((resolve) => (resolveList = resolve)));
    const c = await mount();
    expect(c.textContent).toContain(t.pastLoading);

    await act(async () => {
      resolveList([summary('a'), summary('b')]);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
    await flush();
    expect(c.textContent).not.toContain(t.pastLoading);
    expect(rows(c)).toHaveLength(2);
  });

  it('renders the empty state when there are no past interpretations', async () => {
    mocks.list.mockResolvedValue([]);
    const c = await mount();
    await flush();
    expect(c.textContent).toContain(t.pastEmpty);
    expect(rows(c)).toHaveLength(0);
  });

  it('renders the error state when the list cannot be loaded', async () => {
    mocks.list.mockRejectedValue(new Error('network down'));
    const c = await mount();
    await flush();
    expect(c.querySelector('[role="alert"]')?.textContent).toContain(t.pastError);
    expect(rows(c)).toHaveLength(0);
  });

  it('shows each field: time, description when present, and the type', async () => {
    mocks.list.mockResolvedValue([
      summary('with', {
        description: 'Short and warm',
        kind: 'focus',
        basis: { kind: 'focus', body: 'juno', perspective: 'natal' },
      }),
      summary('without', {
        description: null,
        kind: 'whole-chart',
        basis: { kind: 'whole-chart' },
      }),
    ]);
    const c = await mount();
    await flush();

    const first = rowFor(c, 0);
    const firstOpen = first.querySelector('button');
    expect(firstOpen?.textContent).toBe(`${formatSavedTime('2026-03-10T16:30:00Z', 'en')} · Short and warm · Juno`);
    expect(first.querySelector('.saved-interpretation-description')?.textContent).toBe('Short and warm');
    expect(first.querySelector('.saved-interpretation-type')?.textContent).toBe('Juno');
    const firstSeparators = first.querySelectorAll('.saved-interpretation-separator');
    expect(firstSeparators).toHaveLength(2);
    for (const sep of firstSeparators) {
      expect(sep.getAttribute('aria-hidden')).toBe('true');
      expect(sep.textContent).toBe('·');
    }

    const second = rowFor(c, 1);
    expect(second.textContent).toContain('Entire horoscope');
    expect(second.querySelector('.saved-interpretation-description')).toBeNull();
    const secondSeparators = second.querySelectorAll('.saved-interpretation-separator');
    expect(secondSeparators).toHaveLength(1);
    for (const sep of secondSeparators) {
      expect(sep.getAttribute('aria-hidden')).toBe('true');
      expect(sep.textContent).toBe('·');
    }
    expect(second.textContent.startsWith('·')).toBe(false);
    expect(second.textContent.endsWith('·')).toBe(false);
  });

  it('never shows the generic AI label as the type', async () => {
    const cases: SavedInterpretationSummary[] = [
      summary('whole', { kind: 'whole-chart', basis: { kind: 'whole-chart' } }),
      summary('focus', { kind: 'focus', basis: { kind: 'focus', body: 'mars', perspective: 'natal' } }),
      summary('transit', { kind: 'focus', basis: { kind: 'focus', body: 'juno', perspective: 'transit' } }),
      summary('pair', { kind: 'relationship', basis: { kind: 'relationship' } }),
      summary('places', { kind: 'placements', basis: { kind: 'placements', keys: ['planet-in-sign:sun:2'] } }),
      summary('bare', { kind: null, basis: null }),
    ];
    for (const item of cases) {
      expect(savedTypeLabel(item, 'en')).not.toBe(AI_LABEL);
      expect(savedTypeLabel(item, 'en')).not.toBe(reportViewMessages.en.aiTabLabel);
    }
    expect(savedTypeLabel(cases[0] ?? summary('x'), 'en')).toBe('Entire horoscope');

    mocks.list.mockResolvedValue(cases);
    const c = await mount();
    await flush();
    for (const type of Array.from(c.querySelectorAll('.saved-interpretation-type'))) {
      expect(type.textContent).not.toBe(AI_LABEL);
      expect(type.textContent).not.toBe(reportViewMessages.en.aiTabLabel);
    }
    expect(rowFor(c, 0).querySelector('.saved-interpretation-type')?.textContent).toBe('Entire horoscope');
    expect(rowFor(c, 5).querySelector('.saved-interpretation-type')?.textContent).toBe(t.pastTypeNeutral);
  });
});

describe('SavedInterpretationsPanel: viewer modal', () => {
  it('selecting an item opens the modal and shows its sections', async () => {
    mocks.list.mockResolvedValue([summary('a')]);
    mocks.get.mockResolvedValue(detail('a'));
    const c = await mount();
    await flush();

    await click(requiredButton(rowFor(c, 0), 'button'));
    await flush();

    expect(mocks.get).toHaveBeenCalledWith('a');
    const dialog = c.querySelector('dialog');
    expect(dialog?.textContent).toContain('Core body text.');
    expect(dialog?.textContent).toContain('Relationship body text.');
    expect(dialog?.querySelectorAll('article')).toHaveLength(2);
  });
});

describe('SavedInterpretationsPanel: delete', () => {
  it('from the list: confirmation appears, Cancel leaves the item', async () => {
    mocks.list.mockResolvedValue([summary('a'), summary('b')]);
    const c = await mount();
    await flush();

    await click(buttonWithText(rowFor(c, 0), t.pastDelete));
    const region = requiredElement(c, '[role="region"]');
    expect(region.textContent).toContain(t.pastDeleteConfirmMessage);
    expect(document.activeElement).toBe(buttonWithText(region, t.pastDeleteCancel));

    await click(buttonWithText(region, t.pastDeleteCancel));
    expect(c.querySelector('[role="region"]')).toBeNull();
    expect(rows(c)).toHaveLength(2);
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('from the list: Confirm removes the item and calls deleteSavedInterpretation with its id', async () => {
    mocks.list.mockResolvedValue([summary('a'), summary('b')]);
    mocks.remove.mockResolvedValue(undefined);
    const c = await mount();
    await flush();

    await click(buttonWithText(rowFor(c, 0), t.pastDelete));
    const region = requiredElement(c, '[role="region"]');
    await click(buttonWithText(region, t.pastDeleteConfirm));
    await flush();

    expect(mocks.remove).toHaveBeenCalledWith('a');
    expect(rows(c)).toHaveLength(1);
    expect(rowFor(c, 0).querySelector('.saved-interpretation-type')).not.toBeNull();
  });

  it('from inside the modal: removes the item and closes the modal', async () => {
    mocks.list.mockResolvedValue([summary('a'), summary('b')]);
    mocks.get.mockResolvedValue(detail('a'));
    mocks.remove.mockResolvedValue(undefined);
    const c = await mount();
    await flush();

    await click(requiredButton(rowFor(c, 0), 'button'));
    await flush();
    const dialog = requiredElement(c, 'dialog');
    await click(buttonWithText(dialog, t.pastDelete));
    const region = requiredElement(dialog, '[role="region"]');
    await click(buttonWithText(region, t.pastDeleteConfirm));
    await flush();

    expect(mocks.remove).toHaveBeenCalledWith('a');
    expect(rows(c)).toHaveLength(1);
    expect(c.querySelector('dialog')?.hasAttribute('open')).toBe(false);
    expect(c.querySelector('dialog')?.textContent).not.toContain('Core body text.');
  });

  it('a failed delete shows the failure message and keeps the item', async () => {
    mocks.list.mockResolvedValue([summary('a')]);
    mocks.remove.mockRejectedValue(new Error('server said no'));
    const c = await mount();
    await flush();

    await click(buttonWithText(rowFor(c, 0), t.pastDelete));
    const region = requiredElement(c, '[role="region"]');
    await click(buttonWithText(region, t.pastDeleteConfirm));
    await flush();

    expect(mocks.remove).toHaveBeenCalledWith('a');
    expect(c.querySelector('[role="alert"]')?.textContent).toContain(t.pastDeleteFailed);
    expect(rows(c)).toHaveLength(1);
  });

  it('never uses a browser dialog', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    const alertSpy = vi.spyOn(window, 'alert');
    mocks.list.mockResolvedValue([summary('a')]);
    const c = await mount();
    await flush();
    await click(buttonWithText(rowFor(c, 0), t.pastDelete));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
    alertSpy.mockRestore();
  });
});

describe('SavedInterpretationsPanel: person scope (#768)', () => {
  function unlinkedSection(c: HTMLElement): HTMLElement | null {
    return c.querySelector<HTMLElement>('section.saved-interpretations-unlinked');
  }

  it("lists the selected person's results and the unlinked ones as two requests", async () => {
    mocks.list.mockResolvedValue([summary('mine')]);
    mocks.unlinked.mockResolvedValue([summary('old')]);
    const c = await mount();
    await flush();
    expect(mocks.list).toHaveBeenCalledWith({ personId: PERSON });
    expect(mocks.unlinked).toHaveBeenCalledWith({ unlinked: true });
    const section = unlinkedSection(c);
    expect(section?.querySelector('h3')?.textContent).toBe(t.notLinkedHeading);
    expect(section?.textContent).toContain(t.notLinkedIntro);
    expect(section?.querySelectorAll('li.saved-interpretation-row')).toHaveLength(1);
    expect(rows(c)).toHaveLength(2);
  });

  it('shows no unlinked section when there are no unlinked results', async () => {
    mocks.list.mockResolvedValue([summary('mine')]);
    const c = await mount();
    await flush();
    expect(unlinkedSection(c)).toBeNull();
    expect(c.textContent).not.toContain(t.notLinkedHeading);
  });

  it('without a person lists nothing of its own but still shows the unlinked results', async () => {
    mocks.unlinked.mockResolvedValue([summary('old')]);
    const c = await mount({});
    await flush();
    expect(mocks.list).not.toHaveBeenCalled();
    expect(c.textContent).toContain(t.pastEmpty);
    expect(unlinkedSection(c)?.querySelectorAll('li.saved-interpretation-row')).toHaveLength(1);
  });

  it('opens an unlinked result in the viewer', async () => {
    mocks.list.mockResolvedValue([]);
    mocks.unlinked.mockResolvedValue([summary('old')]);
    mocks.get.mockResolvedValue(detail('old'));
    const c = await mount();
    await flush();
    const section = unlinkedSection(c);
    if (section === null) throw new Error('test fixture bug: no unlinked section');
    await click(requiredButton(section, 'li button'));
    await flush();
    expect(mocks.get).toHaveBeenCalledWith('old');
    expect(c.querySelector('dialog')?.textContent).toContain('Core body text.');
  });

  it('deletes an unlinked result from its section', async () => {
    mocks.list.mockResolvedValue([summary('mine')]);
    mocks.unlinked.mockResolvedValue([summary('old')]);
    mocks.remove.mockResolvedValue(undefined);
    const c = await mount();
    await flush();
    const section = unlinkedSection(c);
    if (section === null) throw new Error('test fixture bug: no unlinked section');
    await click(buttonWithText(section, t.pastDelete));
    await click(buttonWithText(requiredElement(section, '[role="region"]'), t.pastDeleteConfirm));
    await flush();
    expect(mocks.remove).toHaveBeenCalledWith('old');
    expect(unlinkedSection(c)).toBeNull();
    expect(rows(c)).toHaveLength(1);
  });
});
