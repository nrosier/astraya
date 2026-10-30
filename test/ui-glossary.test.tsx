// @vitest-environment jsdom
/**
 * The astrology glossary (#456, #513): every term has a name and a definition in both languages, a term opens its
 * definition from the keyboard through the shared Tooltip, and every screen that explains a timing or chart
 * technique explains its terms with inline tooltips (#901 removed the top-of-view lists).
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { astroGlossaryMessages, GLOSSARY_TERM_IDS } from '../src/ui/astro-glossary.messages.js';
import { GlossaryTerm, GlossaryTerms } from '../src/ui/GlossaryTerm.js';
import { type Locale } from '../src/interpretation/schema.js';
import { setLocale } from '../src/ui/locale.js';

// Render-only mocks (as in test/ui-page-header-screens.test.tsx): the provider never resolves, so each view
// renders its header and loading state with no calculation running.
vi.mock('../src/ui/EphemerisProviderContext.js', () => {
  const provider = { julianDayFromUtc: () => new Promise<number>(() => undefined) };
  return { useEphemerisProvider: () => ({ provider, error: undefined }) };
});

vi.mock('../src/ui/store-context.js', () => {
  const state = {
    deleted: { people: new Map() },
    people: new Map([
      [
        'p1',
        {
          displayName: 'Test',
          timeAccuracy: 'exact',
          moment: {
            civil: { year: 1970, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
            coordinates: { latitude: 41.1833, longitude: -84.7333 },
            zoneOverride: 'America/New_York',
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

const { DraconicView } = await import('../src/ui/DraconicView.js');
const { HoraryView } = await import('../src/ui/HoraryView.js');
const { SolarArcView } = await import('../src/ui/SolarArcView.js');
const { HarmonicView } = await import('../src/ui/HarmonicView.js');
const { TransitView } = await import('../src/ui/TransitView.js');
const { PrimaryDirectionsView } = await import('../src/ui/PrimaryDirectionsView.js');
const { ReturnView } = await import('../src/ui/ReturnView.js');
const { ElectionalView } = await import('../src/ui/ElectionalView.js');
const { CompositeView } = await import('../src/ui/CompositeView.js');
const { RectificationView } = await import('../src/ui/RectificationView.js');
const { AstrocartographyView } = await import('../src/ui/AstrocartographyView.js');
const { PeriodicTransitView } = await import('../src/ui/PeriodicTransitView.js');
const { RelocatedChartView } = await import('../src/ui/RelocatedChartView.js');
const { ProgressionsView } = await import('../src/ui/ProgressionsView.js');
const { ProfectionsView } = await import('../src/ui/ProfectionsView.js');
const { CyclesView } = await import('../src/ui/CyclesView.js');
const { EclipsesView } = await import('../src/ui/EclipsesView.js');
const { SynastryView } = await import('../src/ui/SynastryView.js');

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

  it('has the same term ids in en and nl (parity, #902)', () => {
    expect(Object.keys(astroGlossaryMessages.nl).sort()).toEqual(Object.keys(astroGlossaryMessages.en).sort());
  });
});

interface AliasEntry {
  readonly name: string;
  readonly matches?: readonly string[];
}

/** One term's entry read as an optional-alias shape; terms without `matches` read as `[]`. */
function entryFor(locale: 'en' | 'nl', id: string): AliasEntry {
  const table: Readonly<Record<string, AliasEntry | undefined>> = astroGlossaryMessages[locale];
  const entry = table[id];
  if (entry === undefined) throw new Error(`no ${locale} glossary entry for ${id}`);
  return entry;
}

function aliasesFor(locale: 'en' | 'nl', id: string): readonly string[] {
  return entryFor(locale, id).matches ?? [];
}

describe('per-locale match aliases (#902)', () => {
  it('gives every term with matches in en also matches in nl, and the reverse', () => {
    for (const id of GLOSSARY_TERM_IDS) {
      expect(aliasesFor('nl', id).length > 0, `${id} matches in nl`).toBe(aliasesFor('en', id).length > 0);
    }
  });

  it.each(['en', 'nl'] as const)('never lists one alias under two ids in %s', (locale) => {
    const seen = new Map<string, string>();
    for (const id of GLOSSARY_TERM_IDS) {
      for (const alias of aliasesFor(locale, id)) {
        const previous = seen.get(alias);
        expect(previous, `${alias} in ${id}`).toBeUndefined();
        seen.set(alias, id);
      }
    }
  });

  it.each(['en', 'nl'] as const)('keeps every alias lower-case, trimmed and distinct from its term in %s', (locale) => {
    for (const id of GLOSSARY_TERM_IDS) {
      const entry = entryFor(locale, id);
      for (const alias of aliasesFor(locale, id)) {
        expect(alias, `${id} alias`).toBe(alias.toLowerCase());
        expect(alias, `${id} alias`).toBe(alias.trim());
        expect(alias.length, `${id} alias`).toBeGreaterThan(1);
        expect(alias, `${id} alias`).not.toBe(entry.name.toLowerCase());
      }
    }
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

/** The eighteen views whose top-of-view `ul.glossary-terms` list #901 removed. Each entry mounts the view. */
const views: readonly { name: string; node: () => React.JSX.Element }[] = [
  { name: 'DraconicView', node: () => <DraconicView personId="p1" view="wheel" compareType={undefined} /> },
  { name: 'HoraryView', node: () => <HoraryView view="wheel" /> },
  { name: 'SolarArcView', node: () => <SolarArcView personId="p1" /> },
  { name: 'HarmonicView', node: () => <HarmonicView personId="p1" view="wheel" compareType={undefined} /> },
  { name: 'TransitView', node: () => <TransitView personId="p1" /> },
  { name: 'PrimaryDirectionsView', node: () => <PrimaryDirectionsView personId="p1" /> },
  {
    name: 'ReturnView',
    node: () => <ReturnView personId="p1" kind="solar-return" view="wheel" compareType={undefined} />,
  },
  { name: 'ElectionalView', node: () => <ElectionalView /> },
  { name: 'CompositeView', node: () => <CompositeView personId="p1" view="wheel" /> },
  { name: 'RectificationView', node: () => <RectificationView /> },
  { name: 'AstrocartographyView', node: () => <AstrocartographyView personId="p1" /> },
  { name: 'PeriodicTransitView', node: () => <PeriodicTransitView personId="p1" /> },
  {
    name: 'RelocatedChartView',
    node: () => <RelocatedChartView personId="p1" view="wheel" compareType={undefined} />,
  },
  { name: 'ProgressionsView', node: () => <ProgressionsView personId="p1" /> },
  { name: 'ProfectionsView', node: () => <ProfectionsView personId="p1" /> },
  { name: 'CyclesView', node: () => <CyclesView /> },
  { name: 'EclipsesView', node: () => <EclipsesView /> },
  { name: 'SynastryView', node: () => <SynastryView personId="p1" /> },
];

describe('no top-of-view glossary lists (#901)', () => {
  const locales: readonly Locale[] = ['en', 'nl'];

  afterEach(() => {
    setLocale('en');
  });

  it.each(locales.flatMap((locale) => views.map((view) => ({ locale, ...view }))))(
    '$name renders no top-of-view glossary list in $locale',
    async ({ locale, node }) => {
      setLocale(locale);
      const container = document.createElement('div');
      document.body.append(container);
      const root = createRoot(container);
      try {
        await act(async () => {
          root.render(node());
          await Promise.resolve();
        });
        // The view must have mounted its page header, so an empty render cannot pass this check.
        expect(container.querySelector('h1')).not.toBeNull();
        expect(container.querySelector('ul.glossary-terms')).toBeNull();
      } finally {
        act(() => {
          root.unmount();
        });
        container.remove();
      }
    },
  );
});
