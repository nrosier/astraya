// @vitest-environment jsdom
/**
 * BirthPlaceSearch.tsx's out-of-order-response guard (#463): a search started earlier but slow to
 * resolve must not be able to overwrite the results of a search started later and already shown,
 * and the superseded request should actually be cancelled (via `AbortSignal`), not just ignored
 * once it eventually settles. Also covers the floating dropdown (#784): debounce, states, keyboard,
 * selection and combobox ARIA.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ForwardGeocodeResult } from '../src/ui/forward-geocode.js';

interface PendingSearch {
  readonly query: string;
  readonly signal: AbortSignal;
  readonly resolve: (results: ForwardGeocodeResult[]) => void;
  readonly reject: (error: unknown) => void;
}

let pending: PendingSearch[] = [];

vi.mock('../src/ui/forward-geocode.js', () => ({
  forwardGeocode: (query: string, signal: AbortSignal) =>
    new Promise<ForwardGeocodeResult[]>((resolve, reject) => {
      pending.push({ query, signal, resolve, reject });
    }),
}));

const { BirthPlaceSearch } = await import('../src/ui/BirthPlaceSearch.js');

let mounted: { container: HTMLElement; root: Root } | undefined;

afterEach(() => {
  vi.useRealTimers();
  if (mounted !== undefined) {
    act(() => {
      mounted?.root.unmount();
    });
    mounted.container.remove();
    mounted = undefined;
  }
  pending = [];
});

/**
 * Same trick `ui-corpus-overrides-panel.test.tsx` uses: React patches a controlled input's own
 * `value` setter, so assigning `.value` directly and dispatching `input` looks like no change to
 * it. Going through the prototype's original setter is what `fireEvent`/`userEvent` do internally.
 */
function setNativeValue(element: HTMLInputElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

function mount(onPick: (latitude: number, longitude: number, placeLabel?: string) => void): HTMLElement {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(<BirthPlaceSearch onPick={onPick} />);
  });
  mounted = { container, root };
  return container;
}

function searchInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector('input[type="text"]');
  if (!(input instanceof HTMLInputElement)) throw new Error('test fixture bug: no search input');
  return input;
}

function searchForm(container: HTMLElement): HTMLFormElement {
  const form = container.querySelector('form');
  if (!(form instanceof HTMLFormElement)) throw new Error('test fixture bug: no search form');
  return form;
}

/**
 * Types a query and submits the form, leaving the resulting `forwardGeocode` call pending.
 *
 * Dispatches `submit` on the form itself rather than clicking the submit button: the button is
 * disabled while a search is already in flight, which already stops an ordinary double-click,
 * but that UI nicety is not the guard this test is for. Firing the form's own `submit` event
 * directly exercises the actual request-cancelling guard in `BirthPlaceSearch.tsx`, so it still
 * catches a regression there even if the disabled-button guard is ever changed, bypassed by a
 * fast double Enter-press, or otherwise doesn't apply.
 */
function startSearch(container: HTMLElement, query: string): void {
  act(() => {
    setNativeValue(searchInput(container), query);
    searchForm(container).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

function resultText(container: HTMLElement): readonly string[] {
  return Array.from(container.querySelectorAll('.birth-place-search-option-name')).map((b) => b.textContent);
}

const RESULT_A: ForwardGeocodeResult = { latitude: 1, longitude: 1, displayName: 'Search A result' };
const RESULT_B: ForwardGeocodeResult = { latitude: 2, longitude: 2, displayName: 'Search B result' };

describe('BirthPlaceSearch, when a slower search is superseded by a faster later one (#463)', () => {
  it('aborts the earlier search and ignores it even if it resolves afterwards', async () => {
    const container = mount(() => undefined);

    startSearch(container, 'Search A');
    const first = pending[0];
    if (first === undefined) throw new Error('fixture bug: search A never reached forwardGeocode');
    expect(first.signal.aborted).toBe(false);

    startSearch(container, 'Search B');
    expect(pending).toHaveLength(2);
    // Starting the second search cancels the first one's request.
    expect(first.signal.aborted).toBe(true);
    const second = pending[1];
    if (second === undefined) throw new Error('fixture bug: search B never reached forwardGeocode');
    expect(second.signal.aborted).toBe(false);

    // Resolve B (the newer, faster search) first, then A (the older, slower one) afterwards —
    // the out-of-order case the issue describes.
    await act(async () => {
      second.resolve([RESULT_B]);
      await Promise.resolve();
    });
    expect(resultText(container)).toEqual(['Search B result']);

    await act(async () => {
      first.resolve([RESULT_A]);
      await Promise.resolve();
    });
    // A's late results must not have overwritten B's, even though A resolved last.
    expect(resultText(container)).toEqual(['Search B result']);
  });

  it('does not show an error for the superseded search when its aborted request rejects', async () => {
    const container = mount(() => undefined);

    startSearch(container, 'Search A');
    const first = pending[0];
    if (first === undefined) throw new Error('fixture bug: search A never reached forwardGeocode');

    startSearch(container, 'Search B');
    const second = pending[1];
    if (second === undefined) throw new Error('fixture bug: search B never reached forwardGeocode');

    // The real `fetch` rejects with an AbortError once the signal fires; simulate that here.
    await act(async () => {
      first.reject(new DOMException('aborted', 'AbortError'));
      await Promise.resolve();
    });
    expect(container.querySelector('[role="alert"]')).toBeNull();

    await act(async () => {
      second.resolve([RESULT_B]);
      await Promise.resolve();
    });
    expect(resultText(container)).toEqual(['Search B result']);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('cancels the in-flight search when the component unmounts', () => {
    const container = mount(() => undefined);
    startSearch(container, 'Search A');
    const first = pending[0];
    if (first === undefined) throw new Error('fixture bug: search A never reached forwardGeocode');
    expect(first.signal.aborted).toBe(false);

    act(() => {
      mounted?.root.unmount();
    });
    mounted?.container.remove();
    mounted = undefined;

    expect(first.signal.aborted).toBe(true);
  });
});

const PARIS: ForwardGeocodeResult = {
  latitude: 48.856614,
  longitude: 2.352222,
  displayName: 'Paris, Île-de-France, France',
};
const SYDNEY: ForwardGeocodeResult = {
  latitude: -33.8688,
  longitude: 151.2093,
  displayName: 'Sydney, New South Wales, Australia',
};

function type(container: HTMLElement, value: string): void {
  act(() => {
    setNativeValue(searchInput(container), value);
  });
}

function key(container: HTMLElement, name: string): void {
  act(() => {
    searchInput(container).dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));
  });
}

async function resolveWith(index: number, results: ForwardGeocodeResult[]): Promise<void> {
  const request = pending[index];
  if (request === undefined) throw new Error('fixture bug: no such pending search');
  await act(async () => {
    request.resolve(results);
    await Promise.resolve();
  });
}

function options(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[role="option"]'));
}

describe('BirthPlaceSearch floating dropdown (#784)', () => {
  it('searches after the debounce once the query is longer than 2 characters, and not before', () => {
    vi.useFakeTimers();
    const container = mount(() => undefined);

    type(container, 'Pa');
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(pending).toHaveLength(0);

    type(container, 'Par');
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(pending).toHaveLength(0);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(pending.map((p) => p.query)).toEqual(['Par']);
  });

  it('debounces: only the last keystroke in a burst triggers a search', () => {
    vi.useFakeTimers();
    const container = mount(() => undefined);
    type(container, 'Par');
    act(() => {
      vi.advanceTimersByTime(200);
    });
    type(container, 'Pari');
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(pending.map((p) => p.query)).toEqual(['Pari']);
  });

  it('shows a searching status inside the dropdown with an aria-hidden spinner', () => {
    const container = mount(() => undefined);
    startSearch(container, 'Paris');
    const status = container.querySelector('.birth-place-search-dropdown [role="status"]');
    expect(status?.textContent).toContain('Searching');
    expect(status?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('shows the empty state for an empty result array', async () => {
    const container = mount(() => undefined);
    startSearch(container, 'Nowhereville');
    await resolveWith(0, []);
    const status = container.querySelector('.birth-place-search-dropdown [role="status"]');
    expect(status?.textContent).toBe('No matching locations found');
  });

  it('shows an alert inside the dropdown when the search fails', async () => {
    const container = mount(() => undefined);
    startSearch(container, 'Paris');
    await act(async () => {
      pending[0]?.reject(new Error('503'));
      await Promise.resolve();
    });
    const alert = container.querySelector('.birth-place-search-dropdown [role="alert"]');
    expect(alert?.textContent).toContain('The place search failed');
  });

  it('exposes combobox and listbox ARIA, and tracks the active option', async () => {
    const container = mount(() => undefined);
    const input = searchInput(container);
    expect(input.getAttribute('role')).toBe('combobox');
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(input.getAttribute('aria-autocomplete')).toBe('list');

    startSearch(container, 'Paris');
    await resolveWith(0, [PARIS, SYDNEY]);

    const listbox = container.querySelector('[role="listbox"]');
    expect(listbox).not.toBeNull();
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(input.getAttribute('aria-controls')).toBe(listbox?.id);
    expect(input.getAttribute('aria-activedescendant')).toBeNull();
    expect(options(container).map((o) => o.getAttribute('aria-selected'))).toEqual(['false', 'false']);
    expect(container.querySelector('.birth-place-search-option-coords')?.textContent).toBe('48.86° N, 2.35° E');

    key(container, 'ArrowDown');
    const [first, second] = options(container);
    expect(input.getAttribute('aria-activedescendant')).toBe(first?.id);
    expect(first?.getAttribute('aria-selected')).toBe('true');
    expect(second?.getAttribute('aria-selected')).toBe('false');
  });

  it('formats southern and western hemispheres with letters', async () => {
    const container = mount(() => undefined);
    startSearch(container, 'Sydney');
    await resolveWith(0, [SYDNEY, { latitude: 40.7, longitude: -74, displayName: 'New York' }]);
    expect(
      Array.from(container.querySelectorAll('.birth-place-search-option-coords')).map((e) => e.textContent),
    ).toEqual(['33.87° S, 151.21° E', '40.70° N, 74.00° W']);
  });

  it('moves with ArrowDown and ArrowUp, wrapping at both ends', async () => {
    const container = mount(() => undefined);
    startSearch(container, 'Paris');
    await resolveWith(0, [PARIS, SYDNEY]);
    const active = (): number => options(container).findIndex((o) => o.getAttribute('aria-selected') === 'true');

    key(container, 'ArrowDown');
    expect(active()).toBe(0);
    key(container, 'ArrowDown');
    expect(active()).toBe(1);
    key(container, 'ArrowDown');
    expect(active()).toBe(0);
    key(container, 'ArrowUp');
    expect(active()).toBe(1);
  });

  it('selects the active row on Enter: fills the text, passes 4-decimal coordinates, closes', async () => {
    const onPick = vi.fn();
    const container = mount(onPick);
    startSearch(container, 'Paris');
    await resolveWith(0, [PARIS, SYDNEY]);

    key(container, 'ArrowDown');
    key(container, 'Enter');

    expect(onPick).toHaveBeenCalledExactlyOnceWith(48.8566, 2.3522, 'Paris, Île-de-France, France');
    expect(searchInput(container).value).toBe('Paris');
    expect(container.querySelector('[role="listbox"]')).toBeNull();
    expect(searchInput(container).getAttribute('aria-expanded')).toBe('false');
  });

  it('selects a clicked row', async () => {
    const onPick = vi.fn();
    const container = mount(onPick);
    startSearch(container, 'Sydney');
    await resolveWith(0, [PARIS, SYDNEY]);

    act(() => {
      options(container)[1]?.click();
    });

    expect(onPick).toHaveBeenCalledExactlyOnceWith(-33.8688, 151.2093, 'Sydney, New South Wales, Australia');
    expect(searchInput(container).value).toBe('Sydney');
    expect(container.querySelector('[role="listbox"]')).toBeNull();
  });

  it('closes on Escape without selecting', async () => {
    const onPick = vi.fn();
    const container = mount(onPick);
    startSearch(container, 'Paris');
    await resolveWith(0, [PARIS]);

    key(container, 'ArrowDown');
    key(container, 'Escape');

    expect(onPick).not.toHaveBeenCalled();
    expect(container.querySelector('[role="listbox"]')).toBeNull();
    expect(searchInput(container).value).toBe('Paris');
  });

  it('resets the active row when new results open', async () => {
    const container = mount(() => undefined);
    startSearch(container, 'Paris');
    await resolveWith(0, [PARIS, SYDNEY]);
    key(container, 'ArrowDown');
    key(container, 'ArrowDown');

    startSearch(container, 'Sydney');
    await resolveWith(1, [SYDNEY, PARIS]);
    expect(options(container).every((o) => o.getAttribute('aria-selected') === 'false')).toBe(true);
    expect(searchInput(container).getAttribute('aria-activedescendant')).toBeNull();
  });
});
