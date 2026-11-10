// @vitest-environment jsdom
/**
 * The life-event picker's category filter (#1439): default all categories, narrowing to one or more, events without
 * a category only under "all", and the pure filter.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { filterLifeEventsByCategories, type LifeEvent } from '../src/domain/life-events.js';
import { LifeEventPicker } from '../src/ui/LifeEventPicker.js';
import { lifeEventPickerMessages } from '../src/ui/LifeEventPicker.messages.js';

const events: LifeEvent[] = [
  { id: 'a', date: '2001-01-01', label: 'Moved', category: 'relocation' },
  { id: 'b', date: '2002-02-02', label: 'Wed', category: 'marriage' },
  { id: 'c', date: '2003-03-03', label: 'Old, no category' },
  { id: 'd', date: '2004-04-04', label: 'Moved again', category: 'relocation' },
];
const t = lifeEventPickerMessages.en;
let root: Root;
let container: HTMLElement;
const picked = vi.fn();

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root.render(<LifeEventPicker events={events} onPick={picked} />);
  });
});
afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  picked.mockClear();
});

function optionLabels(): string[] {
  return [...container.querySelectorAll('select option')].map((option) => option.textContent).slice(1);
}
function openFilter(): void {
  act(() => {
    container.querySelector<HTMLButtonElement>('.primitive-disclosure-trigger')?.click();
  });
}
function box(name: string): HTMLInputElement {
  const found = [...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].find((input) =>
    input.closest('label')?.textContent.includes(name),
  );
  if (found === undefined) throw new Error(`no checkbox ${name}`);
  return found;
}

describe('pure filter', () => {
  it('keeps everything for undefined and narrows to the set otherwise', () => {
    expect(filterLifeEventsByCategories(events, undefined)).toHaveLength(4);
    expect(filterLifeEventsByCategories(events, new Set(['relocation'])).map((event) => event.id)).toEqual(['a', 'd']);
    expect(filterLifeEventsByCategories(events, new Set())).toEqual([]);
  });
});

describe('LifeEventPicker category filter', () => {
  it('lists every event by default, including one without a category', () => {
    expect(optionLabels()).toHaveLength(4);
    expect(container.textContent).toContain(t.filterSummary(4, 4));
  });

  it('lists only categories in use and narrows to one or several', () => {
    openFilter();
    const names = [...container.querySelectorAll('fieldset label')].map((label) => label.textContent.trim());
    expect(names).toEqual(['Marriage', 'Relocation']);
    act(() => {
      box('Marriage').click();
    });
    expect(optionLabels()).toEqual([t.option('2001-01-01', 'Moved'), t.option('2004-04-04', 'Moved again')]);
    expect(container.textContent).toContain(t.filterSummary(2, 4));
    act(() => {
      box('Marriage').click();
    });
    expect(optionLabels()).toHaveLength(4);
  });

  it('can narrow to none, says so, and resets to all', () => {
    openFilter();
    act(() => {
      box('Marriage').click();
    });
    act(() => {
      box('Relocation').click();
    });
    expect(optionLabels()).toEqual([]);
    expect(container.querySelector('select option')?.textContent).toBe(t.filterEmpty);
    act(() => {
      [...container.querySelectorAll('button')].find((b) => b.textContent === t.filterAll)?.click();
    });
    expect(optionLabels()).toHaveLength(4);
  });

  it('still reports the picked event', () => {
    const select = container.querySelector('select');
    act(() => {
      if (select === null) return;
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(select, 'b');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(picked).toHaveBeenCalledWith(events[1]);
  });

  it('shows no filter when no event has a category', () => {
    act(() => {
      root.render(<LifeEventPicker events={[{ id: 'x', date: '2001-01-01', label: 'Plain' }]} onPick={picked} />);
    });
    expect(container.querySelector('.primitive-disclosure')).toBeNull();
  });
});
