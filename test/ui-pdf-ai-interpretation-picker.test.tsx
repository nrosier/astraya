// @vitest-environment jsdom
/**
 * The PDF builder's saved AI interpretation picker (#759): only the PDF's language is offered, signed out it is
 * disabled and never fetches, and the chosen order is changed with Move up / Move down.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SavedInterpretationSummary } from '../src/interpretation/tier2-client.js';
import { PdfAiInterpretationPicker } from '../src/ui/PdfAiInterpretationPicker.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const list = vi.hoisted(() => vi.fn());
vi.mock('../src/interpretation/tier2-client.js', () => ({ listSavedInterpretations: list }));

function entry(
  id: string,
  locale: 'en' | 'nl',
  extra: Partial<SavedInterpretationSummary> = {},
): SavedInterpretationSummary {
  return {
    id,
    mode: 'chart',
    locale,
    createdAt: '2026-01-02T03:04:05Z',
    description: null,
    kind: null,
    basis: null,
    ...extra,
  };
}

let root: Root | undefined;
let container: HTMLElement | undefined;

async function mount(props: {
  selectedIds?: readonly string[];
  locale?: 'en' | 'nl';
  signedIn?: boolean;
  onChange?: (ids: readonly string[]) => void;
  personId?: string;
}): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <PdfAiInterpretationPicker
        selectedIds={props.selectedIds ?? []}
        onChange={props.onChange ?? (() => undefined)}
        locale={props.locale ?? 'en'}
        signedIn={props.signedIn ?? true}
        personId={props.personId ?? 'p-abcdefghijklmnop'}
      />,
    );
    await Promise.resolve();
  });
  return container;
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  list.mockReset();
});

const boxes = (c: HTMLElement): HTMLInputElement[] => [...c.querySelectorAll<HTMLInputElement>('input[type=checkbox]')];

/** Opens the selection modal through its trigger. */
function openModal(c: HTMLElement): void {
  const trigger = c.querySelector<HTMLButtonElement>('fieldset > button');
  expect(trigger?.textContent).toBe('Choose interpretations');
  act(() => {
    trigger?.click();
  });
}

describe('PdfAiInterpretationPicker', () => {
  it('is disabled and never fetches when signed out', async () => {
    const c = await mount({ signedIn: false });
    expect(list).not.toHaveBeenCalled();
    expect(c.querySelector('fieldset')?.disabled).toBe(true);
    expect(c.querySelector<HTMLButtonElement>('fieldset > button')?.disabled).toBe(true);
    expect(c.querySelector('[role=alert]')).toBeNull();
  });

  it('offers only entries in the PDF language', async () => {
    list.mockResolvedValue([entry('a', 'en'), entry('b', 'nl'), entry('c', 'en')]);
    const en = await mount({ locale: 'en' });
    expect(boxes(en)).toHaveLength(0);
    openModal(en);
    expect(boxes(en)).toHaveLength(2);
  });

  it('hides English entries from a Dutch PDF', async () => {
    list.mockResolvedValue([entry('a', 'en'), entry('b', 'nl')]);
    const nl = await mount({ locale: 'nl' });
    openModal(nl);
    expect(boxes(nl)).toHaveLength(1);
  });

  it('shows the error line when the list fails', async () => {
    list.mockRejectedValue(new Error('offline'));
    const c = await mount({});
    openModal(c);
    expect(c.querySelector('[role=alert]')).not.toBeNull();
  });

  it('shows the empty state when nothing matches', async () => {
    list.mockResolvedValue([entry('b', 'nl')]);
    const c = await mount({ locale: 'en' });
    openModal(c);
    expect(boxes(c)).toHaveLength(0);
    expect(c.querySelectorAll('p.hint').length).toBeGreaterThanOrEqual(2);
    expect(c.querySelector('[role=alert]')).toBeNull();
  });

  it('reorders the selection and reports the new order', async () => {
    list.mockResolvedValue([entry('a', 'en'), entry('b', 'en'), entry('c', 'en')]);
    const onChange = vi.fn();
    const c = await mount({ selectedIds: ['a', 'b', 'c'], onChange });
    const buttons = [...c.querySelectorAll('ol button')] as HTMLButtonElement[];
    expect(buttons).toHaveLength(6);
    expect(buttons[0]?.disabled).toBe(true);
    expect(buttons[5]?.disabled).toBe(true);
    act(() => {
      buttons[3]?.click(); // move b down
    });
    expect(onChange).toHaveBeenLastCalledWith(['a', 'c', 'b']);
    act(() => {
      buttons[2]?.click(); // move b up
    });
    expect(onChange).toHaveBeenLastCalledWith(['b', 'a', 'c']);
  });

  it('shows time, description when present, and the specific type for each entry', async () => {
    list.mockResolvedValue([
      entry('a', 'en', {
        description: 'Career question',
        kind: 'focus',
        basis: { kind: 'focus', body: 'sun', perspective: 'natal' },
      }),
      entry('b', 'en', { kind: 'whole-chart', basis: { kind: 'whole-chart' } }),
    ]);
    const c = await mount({});
    openModal(c);
    const rows = [...c.querySelectorAll('dialog label')];
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toContain('2026');
    expect(rows[0]?.textContent).toContain('Career question');
    expect(rows[0]?.textContent).toContain('Sun');
    expect(rows[1]?.textContent).not.toContain('Career question');
    expect(rows[1]?.querySelectorAll('.hint')).toHaveLength(1);
    expect(rows[1]?.textContent).not.toContain('·');
    for (const row of rows) expect(row.textContent).not.toContain('AI interpretation');
  });

  it('never uses the generic AI label; with no kind and basis it shows the neutral label', async () => {
    list.mockResolvedValue([entry('a', 'en'), entry('b', 'nl')]);
    const en = await mount({});
    openModal(en);
    const text = [...en.querySelectorAll('dialog label')].map((row) => row.textContent).join(' ');
    expect(text).toContain('Saved interpretation');
    expect(text).not.toContain('AI interpretation');
  });

  it('ticking inside the modal adds the id in ticked order', async () => {
    list.mockResolvedValue([entry('a', 'en'), entry('b', 'en')]);
    const onChange = vi.fn();
    const c = await mount({ selectedIds: ['b'], onChange });
    openModal(c);
    act(() => {
      boxes(c)[0]?.click();
    });
    expect(onChange).toHaveBeenLastCalledWith(['b', 'a']);
  });

  it('closing the modal leaves the selection in place and returns focus to the trigger', async () => {
    list.mockResolvedValue([entry('a', 'en')]);
    const onChange = vi.fn();
    const c = await mount({ selectedIds: ['a'], onChange });
    openModal(c);
    const close = [...c.querySelectorAll<HTMLButtonElement>('dialog .settings-card-footer button')][0];
    act(() => {
      close?.click();
    });
    expect(boxes(c)).toHaveLength(0);
    expect(onChange).not.toHaveBeenCalled();
    expect(c.querySelectorAll('ol li')).toHaveLength(1);
    expect(document.activeElement).toBe(c.querySelector('fieldset > button'));
  });

  it("lists only the given person's results", async () => {
    list.mockResolvedValue([]);
    await mount({ personId: 'p-person-one-aaaaaa' });
    expect(list).toHaveBeenCalledWith({ personId: 'p-person-one-aaaaaa' }, 'en');
  });

  it("drops ticked ids that are not in this person's list (#768)", async () => {
    list.mockResolvedValue([entry('a', 'en'), entry('n', 'nl')]);
    const onChange = vi.fn();
    await mount({ selectedIds: ['a', 'gone', 'n'], onChange });
    expect(onChange).toHaveBeenLastCalledWith(['a', 'n']);
  });

  it('clears every tick when the person changes, before the new list arrives (#768)', async () => {
    list.mockResolvedValue([entry('a', 'en')]);
    const onChange = vi.fn();
    await mount({ selectedIds: ['a'], onChange, personId: 'p-person-one-aaaaaa' });
    expect(onChange).not.toHaveBeenCalled();
    list.mockReturnValue(new Promise(() => undefined));
    act(() => {
      root?.render(
        <PdfAiInterpretationPicker
          selectedIds={['a']}
          onChange={onChange}
          locale="en"
          signedIn
          personId="p-person-two-bbbbbb"
        />,
      );
    });
    expect(list).toHaveBeenLastCalledWith({ personId: 'p-person-two-bbbbbb' }, 'en');
    expect(onChange).toHaveBeenLastCalledWith([]);
  });
});
