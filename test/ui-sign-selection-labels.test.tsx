// @vitest-environment jsdom
/**
 * Sign selection aspect rows name the body the aspect is to, not the body in the sign (#1997).
 * The label used to depend on the stored pair order: a sign has no `positionRow`, so the in-sign
 * body was named whenever it sat in the bodyA slot. Mounted through the real inspector with the
 * corpus fetch stubbed, so the rendered list is what the owner sees.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AspectRow, PositionRow } from '../src/domain/chart-tables.js';
import type { ChartData } from '../src/domain/chart-compute.js';
import type { CorpusEntry } from '../src/interpretation/schema.js';
import { setLocale } from '../src/ui/locale.js';
import { resetWheelCorpusCache } from '../src/ui/wheel-corpus.js';
import { SelectionInspector, type WheelIsolationFacts } from '../src/ui/SelectionInspector.js';

const corpus = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../src/interpretation/corpus/en.json'), 'utf8'),
) as CorpusEntry[];

// `WheelSelectionText` reads the chart only for the corpus text; the aspect labels come from the facts.
const chart = {} as ChartData;

let mounted: { container: HTMLElement; root: Root } | undefined;

beforeEach(() => {
  resetWheelCorpusCache();
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (/\/corpus\/en\.json$/.exec(url) !== null) {
        return Promise.resolve(new Response(JSON.stringify(corpus), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ entries: [] }), { status: 200 }));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (mounted !== undefined) {
    act(() => {
      mounted?.root.unmount();
    });
    mounted.container.remove();
    mounted = undefined;
  }
  setLocale('en');
});

/** A sign selection: Mercury is the one body drawn in Pisces. */
function position(bodyKey: string, bodyName: string, sign: string): PositionRow {
  return {
    bodyKey,
    bodyName,
    glyph: bodyName.slice(0, 1),
    longitude: 0,
    sign,
    degree: 5,
    minute: 14,
    second: 0,
    anaretic: false,
    speed: 1,
    retrograde: false,
    house: 1,
  };
}

function aspect(bodyAKey: string, bodyBKey: string, aspectKey: string, aspectName: string): AspectRow {
  return {
    bodyAKey,
    bodyAName: bodyAKey,
    bodyBKey,
    bodyBName: bodyBKey,
    aspect: aspectName,
    aspectKey,
    angle: 60,
    separation: 60,
    orb: 1.9,
    applying: false,
  };
}

async function mount(facts: WheelIsolationFacts): Promise<HTMLElement> {
  setLocale('en');
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <SelectionInspector
        facts={facts}
        selectionKey="sign:11"
        data={chart}
        focusContext={undefined}
        locale="en"
        onClear={() => undefined}
        derivedChartNote={undefined}
        personId={undefined}
        presetNote={undefined}
      />,
    );
    await Promise.resolve();
  });
  mounted = { container, root };
  return container;
}

/** The aspect row texts, e.g. "Sextile Venus (1.9°, Separating)". */
function aspectRowTexts(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('li')).map((item) => item.textContent ?? '');
}

const mercury = position('mercury', 'Mercury', 'Pisces');

describe('sign selection aspect rows (#1997)', () => {
  it('names the aspected body when the in-sign body is in the bodyA slot', async () => {
    const container = await mount({
      heading: 'Pisces',
      relatedAspects: [aspect('mercury', 'venus', 'sextile', 'Sextile')],
      bodiesInSign: [mercury],
    });
    const rows = aspectRowTexts(container);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain('Sextile Venus');
    expect(rows[0]).not.toContain('Mercury');
  });

  it('names the aspected body when the in-sign body is in the bodyB slot', async () => {
    const container = await mount({
      heading: 'Pisces',
      relatedAspects: [aspect('venus', 'mercury', 'trine', 'Trine')],
      bodiesInSign: [mercury],
    });
    const rows = aspectRowTexts(container);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain('Trine Venus');
    expect(rows[0]).not.toContain('Mercury');
  });

  it('names each row by the outside body when two rows share the in-sign body in different slots', async () => {
    const container = await mount({
      heading: 'Pisces',
      relatedAspects: [aspect('mercury', 'venus', 'sextile', 'Sextile'), aspect('venus', 'mercury', 'trine', 'Trine')],
      bodiesInSign: [mercury],
    });
    const rows = aspectRowTexts(container);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain('Sextile Venus');
    expect(rows[1]).toContain('Trine Venus');
  });

  it('names bodyA when both bodies of a row are in the sign', async () => {
    const sun = position('sun', 'Sun', 'Pisces');
    const container = await mount({
      heading: 'Pisces',
      relatedAspects: [aspect('mercury', 'sun', 'conjunction', 'Conjunction')],
      bodiesInSign: [mercury, sun],
    });
    const rows = aspectRowTexts(container);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain('Conjunction Mercury');
  });
});
