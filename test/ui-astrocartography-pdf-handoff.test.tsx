// @vitest-environment jsdom
/**
 * #2018 — the PDF handoff of the Fixed Stars toggle. Renders the real Astrocartography view on the real Swiss
 * Ephemeris (only the store and calculation-settings hooks are stubbed, as the equivalent-table test does) and checks:
 *   - the Build PDF link carries `fixedStars=1` exactly while the real Fixed Stars toggle button is pressed;
 *   - the route that link names parses to the astrocartography section with `fixedStars: true`, and the PDF plan built
 *     from that route draws the star lines, while the route without the flag draws none.
 * The builder itself renders no star output: it turns the route's flag into the astrocartography section option
 * (`withRequestedSection`), which the plan reads, so the plan's output is what is asserted for the builder.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { EphemerisProvider } from '../src/ephemeris/types.js';
import type { PdfPlanContext } from '../src/ui/pdf-export-plan.js';
import type { PdfSelection } from '../src/domain/pdf-export-sections.js';
import { getEngine } from './engine-harness.js';

let engine: EphemerisProvider;

beforeAll(async () => {
  engine = await getEngine();
}, 60_000);

vi.mock('../src/ui/EphemerisProviderContext.js', () => ({
  useEphemerisProvider: () => ({ provider: engine, error: undefined }),
}));

vi.mock('../src/ui/store-context.js', () => {
  const state = {
    deleted: { people: new Map() },
    people: new Map([
      [
        'p1',
        {
          id: 'p1',
          displayName: 'Test',
          timeAccuracy: 'exact',
          moment: {
            civil: { year: 1970, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
            coordinates: { latitude: 41.1833, longitude: -84.7333 },
            offsetOverrideMinutes: 0,
          },
        },
      ],
    ]),
  };
  return { useStoreState: () => state, useStore: () => ({}), useOptionalStore: () => undefined };
});

vi.mock('../src/ui/person-calculation-settings.js', async () => {
  const { DEFAULT_EXTENDED_SETTINGS } = await import('../src/chart/extended-settings.js');
  const { DEFAULT_RULERSHIP_CHOICE } = await import('../src/astrology/rulership.js');
  return {
    usePersonCalculationSettings: () => ({
      settings: DEFAULT_EXTENDED_SETTINGS,
      rulership: DEFAULT_RULERSHIP_CHOICE,
      unreadable: false,
    }),
  };
});

const { AstrocartographyView } = await import('../src/ui/AstrocartographyView.js');
const { parseRoute, pdfBuilderKey } = await import('../src/ui/route.js');
const { starTooltipLeft } = await import('../src/ui/acg-star-tooltip.js');
const { buildPdfPlan } = await import('../src/ui/pdf-export-plan.js');
const { DEFAULT_EXTENDED_SETTINGS: EXTENDED } = await import('../src/chart/extended-settings.js');
const { DEFAULT_RULERSHIP_CHOICE: RULERSHIP } = await import('../src/astrology/rulership.js');
const { EMPTY_SELECTION } = await import('../src/domain/pdf-export-sections.js');
const { TRADITIONAL_ACG_BODY_IDS } = await import('../src/domain/astrocartography.js');
const { chartViewMessages } = await import('../src/ui/ChartView.messages.js');
const { pdfExportMessages } = await import('../src/ui/pdf-export.messages.js');
const { readFileSync } = await import('node:fs');
const { resolve } = await import('node:path');

let mounted: { container: HTMLElement; root: Root } | undefined;

afterEach(() => {
  if (mounted === undefined) return;
  const { container, root } = mounted;
  act(() => {
    root.unmount();
  });
  container.remove();
  mounted = undefined;
});

async function mount(): Promise<HTMLElement> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  mounted = { container, root };
  await act(async () => {
    root.render(<AstrocartographyView personId="p1" />);
    await Promise.resolve();
  });
  return container;
}

/** The Build PDF link's href, read from the real header. */
function buildPdfHref(container: HTMLElement): string {
  const link = container.querySelector('.page-header-row a.primitive-button-primary');
  const href = link?.getAttribute('href');
  if (href === null || href === undefined) throw new Error('the Build PDF link has no href');
  return href;
}

/** The real Fixed Stars toggle, found by its visible label. */
function fixedStarsToggle(container: HTMLElement): HTMLButtonElement {
  const button = [...container.querySelectorAll('button')].find((candidate) => candidate.textContent === 'Fixed Stars');
  if (button === undefined) throw new Error('no Fixed Stars toggle');
  return button;
}

async function click(button: HTMLButtonElement): Promise<void> {
  await act(async () => {
    button.click();
    await Promise.resolve();
  });
}

const corpusFetch: typeof fetch = async (input) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url.includes('/api/corpus-overrides/')) return new Response(JSON.stringify({ entries: [] }));
  const locale = url.endsWith('/nl.json') ? 'nl' : 'en';
  const body = readFileSync(resolve(import.meta.dirname, '..', 'public/corpus', `${locale}.json`), 'utf8');
  return new Response(body, { status: 200 });
};

describe('Fixed Stars PDF handoff (#2018)', () => {
  it('puts fixedStars=1 in the Build PDF href while the real toggle is on, and removes it when it is off again', async () => {
    const container = await mount();
    const toggle = fixedStarsToggle(container);
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(buildPdfHref(container)).not.toContain('fixedStars');

    await click(toggle);
    expect(fixedStarsToggle(container).getAttribute('aria-pressed')).toBe('true');
    expect(buildPdfHref(container)).toBe('#/documents/pdf?person=p1&section=astrocartography&fixedStars=1');

    await click(fixedStarsToggle(container));
    expect(fixedStarsToggle(container).getAttribute('aria-pressed')).toBe('false');
    expect(buildPdfHref(container)).toBe('#/documents/pdf?person=p1&section=astrocartography');
  }, 60_000);

  it('turns the route flag into star lines in the PDF astrocartography map, and none without it', async () => {
    const selectionFor = (hash: string): PdfSelection => {
      const route = parseRoute(hash);
      if (route.kind !== 'export-builder') throw new Error('expected the PDF creator route');
      // The builder's own mapping of the route: the astrocartography section starts with the flag as its option.
      return {
        personId: 'p1',
        ...EMPTY_SELECTION,
        astrocartography: {
          map: true,
          lineTypes: ['MC', 'AC'],
          bodies: TRADITIONAL_ACG_BODY_IDS.slice(0, 2),
          localSpace: false,
          meanings: false,
          ...(route.fixedStars === true ? { fixedStars: true } : {}),
        },
      };
    };
    const context: PdfPlanContext = {
      person: {
        id: 'p1',
        displayName: 'Test',
        timeAccuracy: 'recorded',
        placeLabel: 'Test',
        notes: '',
        missing: [],
        moment: {
          civil: { year: 1970, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
          coordinates: { latitude: 41.1833, longitude: -84.7333 },
          offsetOverrideMinutes: 0,
        },
      },
      provider: engine,
      settings: EXTENDED,
      rulership: RULERSHIP,
      locale: 'en',
      corpusFetch,
    };
    const svgOf = async (hash: string): Promise<string> => {
      const plan = await buildPdfPlan(selectionFor(hash), context, chartViewMessages.en, pdfExportMessages.en);
      expect(plan.errors).toHaveLength(0);
      const chart = plan.sections[0];
      if (chart?.kind !== 'chart') throw new Error('expected a chart section');
      return chart.svg?.markup ?? '';
    };
    const drawnStarLines = (markup: string): number => markup.split('class="acg-star-line"').length - 1;

    const onHref = '#/documents/pdf?person=p1&section=astrocartography&fixedStars=1';
    const offHref = '#/documents/pdf?person=p1&section=astrocartography';
    expect(drawnStarLines(await svgOf(onHref))).toBeGreaterThan(0);
    expect(drawnStarLines(await svgOf(offHref))).toBe(0);
  }, 90_000);
});

describe('Fixed Stars handoff in one route session (#2018)', () => {
  it('remounts the PDF creator when the flag changes, so an ON build followed by an OFF build has no star lines', async () => {
    const onRoute = parseRoute('#/documents/pdf?person=p1&section=astrocartography&fixedStars=1');
    const offRoute = parseRoute('#/documents/pdf?person=p1&section=astrocartography');
    if (onRoute.kind !== 'export-builder' || offRoute.kind !== 'export-builder')
      throw new Error('expected creator routes');
    // The key the App mounts the creator with: a flag change must change it, or the creator keeps the ON selection.
    expect(pdfBuilderKey(onRoute)).not.toBe(pdfBuilderKey(offRoute));

    const context: PdfPlanContext = {
      person: {
        id: 'p1',
        displayName: 'Test',
        timeAccuracy: 'recorded',
        placeLabel: 'Test',
        notes: '',
        missing: [],
        moment: {
          civil: { year: 1970, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
          coordinates: { latitude: 41.1833, longitude: -84.7333 },
          offsetOverrideMinutes: 0,
        },
      },
      provider: engine,
      settings: EXTENDED,
      rulership: RULERSHIP,
      locale: 'en',
      corpusFetch,
    };
    // The second build starts from the OFF route's own selection, as a remounted creator does.
    const selectionOf = (route: typeof offRoute): PdfSelection => ({
      personId: 'p1',
      ...EMPTY_SELECTION,
      astrocartography: {
        map: true,
        lineTypes: ['MC', 'AC'],
        bodies: TRADITIONAL_ACG_BODY_IDS.slice(0, 2),
        localSpace: false,
        meanings: false,
        ...(route.fixedStars === true ? { fixedStars: true } : {}),
      },
    });
    const onPlan = await buildPdfPlan(selectionOf(onRoute), context, chartViewMessages.en, pdfExportMessages.en);
    const offPlan = await buildPdfPlan(selectionOf(offRoute), context, chartViewMessages.en, pdfExportMessages.en);
    const markupOf = (plan: typeof onPlan): string => {
      const chart = plan.sections[0];
      if (chart?.kind !== 'chart') throw new Error('expected a chart section');
      return chart.svg?.markup ?? '';
    };
    const drawnStarLines = (markup: string): number => markup.split('class="acg-star-line"').length - 1;
    expect(drawnStarLines(markupOf(onPlan))).toBeGreaterThan(0);
    expect(drawnStarLines(markupOf(offPlan))).toBe(0);
  }, 90_000);
});

describe('star tooltip placement (#2018)', () => {
  it('keeps the tooltip inside the card at 390 and 1280 widths, flipping left near the right edge', () => {
    const width = 67; // the tooltip's measured width (box width in the captures)
    for (const cardWidth of [390, 1280]) {
      // Near the right edge the tooltip would overflow on the right, so it must flip left and stay inside.
      const pointerX = cardWidth - 20;
      const left = starTooltipLeft(pointerX, width, cardWidth);
      expect(left).toBeGreaterThanOrEqual(0);
      expect(left + width).toBeLessThanOrEqual(cardWidth);
      expect(left).toBeLessThan(pointerX);
    }
    // Away from the edge it stays to the right of the pointer, as before.
    expect(starTooltipLeft(100, width, 1280)).toBe(112);
  });
});
