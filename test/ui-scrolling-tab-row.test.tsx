// @vitest-environment jsdom
/**
 * The shared scrolling tab row (#818): a semantic nav of the caller's links, the right-edge fade shown while tabs
 * are hidden, pinned actions rendered outside the scroll viewport, and a vertical wheel turned into sideways
 * movement. jsdom does no layout, so the scroller's sizes are stubbed on the element prototype.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ScrollingTabRow } from '../src/ui/ScrollingTabRow.js';

const SCROLL_WIDTH = 900;
const CLIENT_WIDTH = 300;

describe('ScrollingTabRow', () => {
  let mounted: { container: HTMLElement; root: Root } | undefined;
  let scrollLeft = 0;

  beforeEach(() => {
    scrollLeft = 0;
    Object.defineProperty(HTMLElement.prototype, 'scrollWidth', { configurable: true, get: () => SCROLL_WIDTH });
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => CLIENT_WIDTH });
    Object.defineProperty(HTMLElement.prototype, 'scrollLeft', {
      configurable: true,
      get: () => scrollLeft,
      set: (value: number) => {
        scrollLeft = value;
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: (options: ScrollToOptions) => {
        scrollLeft = options.left ?? 0;
      },
    });
  });

  afterEach(() => {
    if (mounted !== undefined) {
      act(() => {
        mounted?.root.unmount();
      });
      mounted.container.remove();
      mounted = undefined;
    }
    for (const key of ['scrollWidth', 'clientWidth', 'scrollLeft', 'scrollTo']) {
      Reflect.deleteProperty(HTMLElement.prototype, key);
    }
  });

  async function mount(): Promise<HTMLElement> {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <ScrollingTabRow label="Sections" actions={<button type="button">Pinned</button>} actionsLabel="Actions">
          <a href="#/one" aria-current="page">
            One
          </a>
          <a href="#/two">Two</a>
        </ScrollingTabRow>,
      );
      await Promise.resolve();
    });
    mounted = { container, root };
    return container;
  }

  it('renders a labelled nav holding the caller’s links', async () => {
    const container = await mount();
    const nav = container.querySelector('nav');
    expect(nav?.getAttribute('aria-label')).toBe('Sections');
    expect([...(nav?.querySelectorAll('a') ?? [])].map((link) => link.textContent)).toEqual(['One', 'Two']);
  });

  it('shows the right-edge fade only while tabs are hidden, and never the left one at 0', async () => {
    const container = await mount();
    const row = container.querySelector('.tab-row');
    expect(row?.getAttribute('data-can-scroll-end')).toBe('true');
    expect(row?.getAttribute('data-can-scroll-start')).toBe('false');
    expect(container.querySelector('.tab-row__fade--end')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('renders the pinned actions outside the scroll viewport', async () => {
    const container = await mount();
    const viewport = container.querySelector('.tab-row__viewport');
    const pinned = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Pinned');
    expect(pinned).toBeDefined();
    expect(pinned !== undefined && viewport?.contains(pinned)).toBe(false);
    expect(container.querySelector('.tab-row__actions')?.contains(pinned ?? null)).toBe(true);
  });

  it('moves the viewport sideways for a vertical wheel delta and leaves a horizontal one alone', async () => {
    const container = await mount();
    const scroller = container.querySelector('.tab-row__scroll');
    expect(scroller).not.toBeNull();
    const vertical = new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true });
    await act(async () => {
      scroller?.dispatchEvent(vertical);
      await Promise.resolve();
    });
    expect(scrollLeft).toBe(120);
    expect(vertical.defaultPrevented).toBe(true);

    const horizontal = new WheelEvent('wheel', { deltaX: 80, deltaY: 10, bubbles: true, cancelable: true });
    await act(async () => {
      scroller?.dispatchEvent(horizontal);
      await Promise.resolve();
    });
    expect(scrollLeft).toBe(120);
    expect(horizontal.defaultPrevented).toBe(false);
  });
});
