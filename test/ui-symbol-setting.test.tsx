// @vitest-environment jsdom
/**
 * The device preference for the symbol class (#419): kept in `localStorage`, loaded at start-up,
 * changed from the chart's settings, and followed by the data tables' symbol column.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SYMBOL_CLASS, getSymbolClass, setSymbolClass } from '../src/chart/symbol-class.js';
import type { ChartData } from '../src/domain/chart-compute.js';
import { computeChartData } from '../src/domain/chart-compute.js';
import { setLocale } from '../src/ui/locale.js';
import { ChartDataView } from '../src/ui/ChartView.js';
import { readSymbolClass, SYMBOL_CLASS_KEY, writeSymbolClass } from '../src/ui/symbol-setting.js';
import { SymbolSetting } from '../src/ui/SymbolSetting.js';
import { getEngine } from './engine-harness.js';

let data: ChartData;
let mounted: { container: HTMLElement; root: Root } | undefined;

beforeAll(async () => {
  data = await computeChartData(
    {
      civil: { year: 1970, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
      coordinates: { latitude: 41.1833, longitude: -84.7333 },
      zoneOverride: 'America/New_York',
    },
    await getEngine(),
  );
}, 60_000);

beforeEach(() => {
  localStorage.clear();
  setSymbolClass(DEFAULT_SYMBOL_CLASS);
});

afterEach(() => {
  if (mounted !== undefined) {
    act(() => {
      mounted?.root.unmount();
    });
    mounted.container.remove();
    mounted = undefined;
  }
  localStorage.clear();
  setSymbolClass(DEFAULT_SYMBOL_CLASS);
  setLocale('en');
});

async function mountNode(node: React.ReactNode): Promise<HTMLElement> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(node);
    await Promise.resolve();
  });
  mounted = { container, root };
  return container;
}

describe('the saved symbol class', () => {
  it('is drawn when nothing valid is saved, and round-trips each class', () => {
    expect(readSymbolClass()).toBe('drawn');
    localStorage.setItem(SYMBOL_CLASS_KEY, 'something-else');
    expect(readSymbolClass()).toBe('drawn');
    for (const choice of ['unicode', 'text', 'drawn'] as const) {
      writeSymbolClass(choice);
      expect(localStorage.getItem(SYMBOL_CLASS_KEY)).toBe(choice);
      expect(readSymbolClass()).toBe(choice);
      expect(getSymbolClass()).toBe(choice);
    }
  });
});

describe('the Symbols control', () => {
  it('offers the three classes, shows the saved one, and saving a change applies it at once', async () => {
    const container = await mountNode(<SymbolSetting />);
    const select = container.querySelector('select');
    if (select === null) throw new Error('fixture bug: no select');
    expect(Array.from(select.options).map((option) => option.textContent)).toEqual([
      'Drawn symbols',
      'Unicode characters',
      'Text only (SUN, MOO, …)',
    ]);
    expect(select.value).toBe('drawn');
    expect(container.querySelector('label')?.textContent).toContain('Symbols');
    await act(async () => {
      select.value = 'text';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
    });
    expect(getSymbolClass()).toBe('text');
    expect(localStorage.getItem(SYMBOL_CLASS_KEY)).toBe('text');
  });

  it('is in Dutch when the language is Dutch', async () => {
    setLocale('nl');
    const container = await mountNode(<SymbolSetting />);
    expect(container.querySelector('label')?.textContent).toContain('Symbolen');
    expect(container.querySelector('option')?.textContent).toBe('Getekende symbolen');
  });
});

describe('the symbol column of the Positions table', () => {
  const sunRowCell = (container: HTMLElement): Element | null =>
    Array.from(container.querySelectorAll('#chart-tabpanel-positions tbody tr'))
      .find((row) => row.textContent.includes('Sun'))
      ?.querySelector('td:nth-child(2)') ?? null;

  async function positions(): Promise<HTMLElement> {
    const container = await mountNode(<ChartDataView load={{ kind: 'ready', data }} displayName="Test" showHouses />);
    await act(async () => {
      container.querySelector<HTMLButtonElement>('#chart-tab-positions')?.click();
      await Promise.resolve();
    });
    return container;
  }

  it('draws a small glyph by default, hidden from assistive technology', async () => {
    const container = await positions();
    const cell = sunRowCell(container);
    expect(cell?.querySelector('svg.table-symbol circle')).not.toBeNull();
    expect(cell?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('follows the saved class: the three-letter code, or the Unicode character, and back', async () => {
    writeSymbolClass('text');
    const container = await positions();
    expect(sunRowCell(container)?.textContent).toBe('SUN');
    expect(sunRowCell(container)?.querySelector('svg')).toBeNull();

    await act(async () => {
      writeSymbolClass('unicode');
      await Promise.resolve();
    });
    expect(sunRowCell(container)?.textContent).toBe('☉');

    await act(async () => {
      writeSymbolClass('drawn');
      await Promise.resolve();
    });
    expect(sunRowCell(container)?.querySelector('svg.table-symbol')).not.toBeNull();
  });

  it('redraws the wheel when the class changes, and keeps the name column readable in every class', async () => {
    const container = await positions();
    await act(async () => {
      container.querySelector<HTMLButtonElement>('#chart-tab-chart')?.click();
      await Promise.resolve();
    });
    expect(container.querySelector('.chart-wheel text.chart-symbol-text')).toBeNull();
    await act(async () => {
      writeSymbolClass('text');
      await Promise.resolve();
    });
    expect(container.querySelector('.chart-wheel text.chart-symbol-text-text')?.textContent).toMatch(/^[A-Z]{3}$/);

    await act(async () => {
      container.querySelector<HTMLButtonElement>('#chart-tab-positions')?.click();
      await Promise.resolve();
    });
    expect(
      Array.from(container.querySelectorAll('#chart-tabpanel-positions tbody tr')).some((row) =>
        row.textContent.includes('Sun'),
      ),
    ).toBe(true);
  });
});
