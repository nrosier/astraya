// @vitest-environment jsdom
/**
 * The specialist limits are said next to the feature (#725): the fixed-star table covers seven stars only, a
 * derived chart's reading applies natal interpretations, and the D10 caveat reaches a Dutch reader in Dutch.
 * Real engine, real chart screen; the PDF side is covered in `ui-pdf-export-plan.test.ts`.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { NATAL_FIXED_STARS, computeChartData, type ChartData } from '../src/domain/chart-compute.js';
import { fixedStarRows } from '../src/domain/chart-tables.js';
import { CHART_TYPES, isDerivedChartType, type ChartType } from '../src/ui/chart-sections.js';
import { ChartDataView, fixedStarsScopeNoteOf } from '../src/ui/ChartView.js';
import { chartViewMessages } from '../src/ui/ChartView.messages.js';
import { harmonicViewMessages } from '../src/ui/HarmonicView.messages.js';
import { setLocale } from '../src/ui/locale.js';
import { getEngine } from './engine-harness.js';

const COORDINATES = { latitude: 51.5072, longitude: -0.1276 };
let natal: ChartData;
let withStar: ChartData;
let mounted: { container: HTMLElement; root: Root } | undefined;

beforeAll(async () => {
  const engine = await getEngine();
  natal = await computeChartData(
    {
      civil: { year: 1970, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
      coordinates: COORDINATES,
      offsetOverrideMinutes: 0,
    },
    engine,
  );
  // The Sun is within a degree of Regulus for a few days in late August.
  let found: ChartData | undefined;
  for (let day = 18; day <= 28 && found === undefined; day += 1) {
    const candidate = await computeChartData(
      {
        civil: { year: 2000, month: 8, day, hour: 12, minute: 0, second: 0 },
        coordinates: COORDINATES,
        offsetOverrideMinutes: 0,
      },
      engine,
    );
    if (fixedStarRows(candidate).length > 0) found = candidate;
  }
  if (found === undefined) throw new Error('fixture bug: no day in late August 2000 puts a body near a listed star');
  withStar = found;
}, 60_000);

afterEach(() => {
  if (mounted !== undefined) {
    act(() => {
      mounted?.root.unmount();
    });
    mounted.container.remove();
    mounted = undefined;
  }
  setLocale('en');
});

async function mount(
  data: ChartData,
  options: { readonly chartType?: ChartType; readonly view?: 'wheel' | 'aspects'; readonly locale?: 'en' | 'nl' },
): Promise<HTMLElement> {
  setLocale(options.locale ?? 'en');
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <ChartDataView
        load={{ kind: 'ready', data }}
        displayName="Test"
        showHouses
        view={options.view ?? 'wheel'}
        buildViewHref={() => '#'}
        {...(options.chartType === undefined ? {} : { chartType: options.chartType })}
      />,
    );
    await Promise.resolve();
  });
  mounted = { container, root };
  return container;
}

const inspectorNote = (container: HTMLElement): string | undefined =>
  container.querySelector('.selection-inspector-derived-note')?.textContent ?? undefined;

describe('the fixed-star scope note (#725)', () => {
  it('names every star of the constant and its count, in both languages', () => {
    for (const locale of ['en', 'nl'] as const) {
      const note = fixedStarsScopeNoteOf(chartViewMessages[locale]);
      expect(note).toContain(String(NATAL_FIXED_STARS.length));
      for (const star of NATAL_FIXED_STARS) expect(note).toContain(star);
    }
    expect(fixedStarsScopeNoteOf(chartViewMessages.en)).not.toBe(fixedStarsScopeNoteOf(chartViewMessages.nl));
  });

  it('is shown under the fixed-stars table', async () => {
    const container = await mount(withStar, { view: 'aspects' });
    expect(container.textContent).toContain(chartViewMessages.en.fixedStarsCaption);
    expect(container.textContent).toContain(fixedStarsScopeNoteOf(chartViewMessages.en));
  });

  it('is shown in Dutch for a Dutch reader', async () => {
    const container = await mount(withStar, { view: 'aspects', locale: 'nl' });
    expect(container.textContent).toContain(fixedStarsScopeNoteOf(chartViewMessages.nl));
  });
});

describe('the derived-chart interpretation note (#725)', () => {
  it('decides on the chart type: natal and unnamed screens are not derived', () => {
    expect(isDerivedChartType(undefined)).toBe(false);
    expect(CHART_TYPES.filter((type) => isDerivedChartType(type))).toEqual([
      'draconic',
      'harmonic',
      'solar-return',
      'lunar-return',
      'relocated',
    ]);
  });

  it('is shown above the inspector for a harmonic and a return chart', async () => {
    for (const chartType of ['harmonic', 'solar-return'] as const) {
      const container = await mount(natal, { chartType });
      const text = inspectorNote(container);
      expect(text).toContain('applies natal-chart interpretations to a derived chart');
      act(() => {
        mounted?.root.unmount();
      });
      container.remove();
      mounted = undefined;
    }
  });

  it('is shown in Dutch for a Dutch reader', async () => {
    const container = await mount(natal, { chartType: 'draconic', locale: 'nl' });
    expect(inspectorNote(container)).toContain('geboortehoroscoop-interpretaties toe op een afgeleide horoscoop');
  });

  it('is absent for a natal chart and for a screen that names no type', async () => {
    expect(inspectorNote(await mount(natal, { chartType: 'natal' }))).toBeUndefined();
    act(() => {
      mounted?.root.unmount();
    });
    mounted?.container.remove();
    mounted = undefined;
    expect(inspectorNote(await mount(natal, {}))).toBeUndefined();
  });
});

describe('the D10 caveat is a catalogue string (#725)', () => {
  it('is present, non-empty and different in English and Dutch, and part of the D10 preset text', () => {
    expect(harmonicViewMessages.en.d10Note.length).toBeGreaterThan(40);
    expect(harmonicViewMessages.nl.d10Note.length).toBeGreaterThan(40);
    expect(harmonicViewMessages.nl.d10Note).not.toBe(harmonicViewMessages.en.d10Note);
    expect(harmonicViewMessages.en.presetDescriptions.D10).toContain(harmonicViewMessages.en.d10Note);
    expect(harmonicViewMessages.nl.presetDescriptions.D10).toContain(harmonicViewMessages.nl.d10Note);
  });
});
