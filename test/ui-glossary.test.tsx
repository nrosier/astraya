// @vitest-environment jsdom
/**
 * The astrology glossary (#456, #513): every term has a name and a definition in both languages, a term opens its
 * definition from the keyboard through the shared Tooltip, and every screen that explains a timing or chart
 * technique lists the terms it relies on.
 */
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ChartData } from '../src/domain/chart-compute.js';
import { computeChartData } from '../src/domain/chart-compute.js';
import { chartViewMessages } from '../src/ui/ChartView.messages.js';
import { ChartDataView } from '../src/ui/ChartView.js';
import { ExportRegistryProvider } from '../src/ui/export-registry.js';
import { getEngine } from './engine-harness.js';
import { astroGlossaryMessages, GLOSSARY_TERM_IDS } from '../src/ui/astro-glossary.messages.js';
import { GlossaryTerm, GlossaryTerms } from '../src/ui/GlossaryTerm.js';
import { setLocale } from '../src/ui/locale.js';

describe('the glossary catalogue (#456)', () => {
  it.each(['en', 'nl'] as const)('has a name and a real definition for every term in %s', (locale) => {
    for (const id of GLOSSARY_TERM_IDS) {
      const entry = astroGlossaryMessages[locale][id];
      expect(entry.name.length, `${id} name`).toBeGreaterThan(1);
      expect(entry.definition.length, `${id} definition`).toBeGreaterThan(30);
    }
  });

  it('never repeats a definition between terms', () => {
    const definitions = GLOSSARY_TERM_IDS.map((id) => astroGlossaryMessages.en[id].definition);
    expect(new Set(definitions).size).toBe(definitions.length);
  });
});

describe('GlossaryTerm (#456)', () => {
  it('reveals the definition when its button is focused, in the current language', async () => {
    setLocale('nl');
    const container = document.createElement('div');
    document.body.append(container);
    await act(async () => {
      createRoot(container).render(
        <>
          <GlossaryTerm id="dispositor" />
          <GlossaryTerms terms={['retrograde']} />
        </>,
      );
      await Promise.resolve();
    });
    const buttons = container.querySelectorAll('button');
    expect(buttons).toHaveLength(2);
    expect(buttons[0]?.textContent).toBe('Dispositor');
    await act(async () => {
      buttons[0]?.focus();
      await Promise.resolve();
    });
    expect(container.textContent).toContain('De planeet die het teken regeert');
    expect(container.querySelector('ul[aria-label="Termen op deze pagina"]')).not.toBeNull();
    setLocale('en');
  });
});

describe('where the glossary is used (#513)', () => {
  it.each([
    'TransitView',
    'ProgressionsView',
    'SolarArcView',
    'PrimaryDirectionsView',
    'ProfectionsView',
    'SynastryView',
    'CompositeView',
    'DraconicView',
    'HarmonicView',
    'EclipsesView',
    'ReturnView',
    'AstrocartographyView',
  ])('%s lists the terms it relies on', (view) => {
    expect(readFileSync(`src/ui/${view}.tsx`, 'utf-8')).toContain('<GlossaryTerms');
  });
});

describe('the chart screen explains its terms in place (#801)', () => {
  let data: ChartData;
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

  it('offers the Ascendant and Midheaven definitions as tooltip triggers on the Placements view', async () => {
    setLocale('en');
    const container = document.createElement('div');
    document.body.append(container);
    await act(async () => {
      createRoot(container).render(
        <ExportRegistryProvider>
          <ChartDataView load={{ kind: 'ready', data }} displayName="Test" showHouses buildViewHref={() => '#'} />
        </ExportRegistryProvider>,
      );
      await Promise.resolve();
    });
    const placements = Array.from(container.querySelectorAll<HTMLAnchorElement>('.chart-view-link')).find(
      (link) => link.textContent === chartViewMessages.en.placementsViewLabel,
    );
    await act(async () => {
      placements?.click();
      await Promise.resolve();
    });
    const triggers = Array.from(container.querySelectorAll('.glossary-term button')).map((b) => b.textContent);
    expect(triggers).toContain(astroGlossaryMessages.en.ascendant.name);
    expect(triggers).toContain(astroGlossaryMessages.en.midheaven.name);
  });
});
