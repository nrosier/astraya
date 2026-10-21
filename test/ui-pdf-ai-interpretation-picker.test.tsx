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

function entry(id: string, locale: 'en' | 'nl'): SavedInterpretationSummary {
  return { id, mode: 'chart', locale, createdAt: '2026-01-02T03:04:05Z', description: null, kind: null, basis: null };
}

let root: Root | undefined;
let container: HTMLElement | undefined;

async function mount(props: {
  selectedIds?: readonly string[];
  locale?: 'en' | 'nl';
  signedIn?: boolean;
  onChange?: (ids: readonly string[]) => void;
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

describe('PdfAiInterpretationPicker', () => {
  it('is disabled and never fetches when signed out', async () => {
    const c = await mount({ signedIn: false });
    expect(list).not.toHaveBeenCalled();
    expect(c.querySelector('fieldset')?.disabled).toBe(true);
    expect(c.querySelector('[role=alert]')).toBeNull();
  });

  it('offers only entries in the PDF language', async () => {
    list.mockResolvedValue([entry('a', 'en'), entry('b', 'nl'), entry('c', 'en')]);
    const en = await mount({ locale: 'en' });
    expect(boxes(en)).toHaveLength(2);
  });

  it('hides English entries from a Dutch PDF', async () => {
    list.mockResolvedValue([entry('a', 'en'), entry('b', 'nl')]);
    const nl = await mount({ locale: 'nl' });
    expect(boxes(nl)).toHaveLength(1);
  });

  it('shows the error line when the list fails', async () => {
    list.mockRejectedValue(new Error('offline'));
    const c = await mount({});
    expect(c.querySelector('[role=alert]')).not.toBeNull();
  });

  it('shows the empty state when nothing matches', async () => {
    list.mockResolvedValue([entry('b', 'nl')]);
    const c = await mount({ locale: 'en' });
    expect(boxes(c)).toHaveLength(0);
    expect(c.querySelectorAll('p.hint').length).toBeGreaterThanOrEqual(2);
    expect(c.querySelector('[role=alert]')).toBeNull();
  });

  it('reorders the selection and reports the new order', async () => {
    list.mockResolvedValue([entry('a', 'en'), entry('b', 'en'), entry('c', 'en')]);
    const onChange = vi.fn();
    const c = await mount({ selectedIds: ['a', 'b', 'c'], onChange });
    const buttons = [...c.querySelectorAll('button')];
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
});
