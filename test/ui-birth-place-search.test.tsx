// @vitest-environment jsdom
/**
 * BirthPlaceSearch.tsx's out-of-order-response guard (#463): a search started earlier but slow to
 * resolve must not be able to overwrite the results of a search started later and already shown,
 * and the superseded request should actually be cancelled (via `AbortSignal`), not just ignored
 * once it eventually settles.
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
  return Array.from(container.querySelectorAll('.birth-place-search-results button')).map((b) => b.textContent);
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
    expect(container.querySelector('.warning')).toBeNull();

    await act(async () => {
      second.resolve([RESULT_B]);
      await Promise.resolve();
    });
    expect(resultText(container)).toEqual(['Search B result']);
    expect(container.querySelector('.warning')).toBeNull();
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
