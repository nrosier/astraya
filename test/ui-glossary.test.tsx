// @vitest-environment jsdom
/**
 * The astrology glossary (#456, #513): every term has a name and a definition in both languages, a term opens its
 * definition from the keyboard through the shared Tooltip, and every screen that explains a timing or chart
 * technique explains its terms with inline tooltips (#901 removed the top-of-view lists).
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { astroGlossaryMessages, GLOSSARY_TERM_IDS, type GlossaryTermId } from '../src/ui/astro-glossary.messages.js';
import { GlossaryTerm, GlossaryTerms } from '../src/ui/GlossaryTerm.js';
import { type Locale } from '../src/interpretation/schema.js';
import { setLocale } from '../src/ui/locale.js';
import { SortableTable } from '../src/ui/SortableTable.js';
import { eclipsesViewMessages } from '../src/ui/EclipsesView.messages.js';
import { profectionsViewMessages } from '../src/ui/ProfectionsView.messages.js';
import { synastryViewMessages } from '../src/ui/SynastryView.messages.js';

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

/** Table captions the views wrap with `captionTerm` (#901): the caption text opens its term's definition on its own view. */
const wrappedCaptions: readonly { view: string; term: GlossaryTermId; caption: (locale: Locale) => string }[] = [
  { view: 'EclipsesView', term: 'eclipse', caption: (locale) => eclipsesViewMessages[locale].tableCaption },
  {
    view: 'ProfectionsView',
    term: 'profection',
    caption: (locale) => profectionsViewMessages[locale].profectionsCaption,
  },
  { view: 'SynastryView', term: 'aspect', caption: (locale) => synastryViewMessages[locale].aspectsCaption },
];

describe('inline glossary tooltips on wrapped captions (#901)', () => {
  afterEach(() => {
    setLocale('en');
  });

  it.each((['en', 'nl'] as const).flatMap((locale) => wrappedCaptions.map((wrapped) => ({ locale, ...wrapped }))))(
    '$view caption opens the $term glossary tooltip in $locale',
    async ({ locale, term, caption }) => {
      setLocale(locale);
      const container = document.createElement('div');
      document.body.append(container);
      const root = createRoot(container);
      try {
        await act(async () => {
          root.render(
            <SortableTable
              caption={caption(locale)}
              captionTerm={term}
              columns={[{ key: 'name', label: 'Name', valueOf: (row: { name: string }) => row.name }]}
              rows={[{ name: 'row' }]}
              getRowKey={(row) => row.name}
            />,
          );
          await Promise.resolve();
        });
        const triggers = [...container.querySelectorAll('.glossary-term')].map((element) => element.textContent);
        expect(triggers, `${term} tooltip in ${locale}`).toContain(caption(locale));
      } finally {
        act(() => {
          root.unmount();
        });
        container.remove();
      }
    },
  );
});

/**
 * Headings and prose that name a removed top-of-view term (#901): each view's own page header or copy opens the
 * term's definition on that view. The term is a `GlossaryTerm` trigger whose text is the heading itself.
 */
const headingTerms: readonly { view: string; term: GlossaryTermId; node: () => React.JSX.Element }[] = [
  { view: 'AstrocartographyView', term: 'astrocartography', node: () => <AstrocartographyView personId="p1" /> },
  { view: 'CyclesView', term: 'cycle', node: () => <CyclesView /> },
  { view: 'ElectionalView', term: 'electional', node: () => <ElectionalView /> },
  { view: 'EclipsesView', term: 'eclipse', node: () => <EclipsesView /> },
  { view: 'HoraryView', term: 'horary', node: () => <HoraryView view="wheel" /> },
  { view: 'RectificationView', term: 'rectification', node: () => <RectificationView /> },
  { view: 'CompositeView', term: 'composite', node: () => <CompositeView personId="p1" view="wheel" /> },
  {
    view: 'DraconicView',
    term: 'draconic',
    node: () => <DraconicView personId="p1" view="wheel" compareType={undefined} />,
  },
  {
    view: 'HarmonicView',
    term: 'harmonic',
    node: () => <HarmonicView personId="p1" view="wheel" compareType={undefined} />,
  },
  { view: 'SynastryView', term: 'synastry', node: () => <SynastryView personId="p1" /> },
  { view: 'TransitView', term: 'transit', node: () => <TransitView personId="p1" /> },
  { view: 'ProgressionsView', term: 'progression', node: () => <ProgressionsView personId="p1" /> },
  { view: 'SolarArcView', term: 'solarArc', node: () => <SolarArcView personId="p1" /> },
  { view: 'PrimaryDirectionsView', term: 'primaryDirection', node: () => <PrimaryDirectionsView personId="p1" /> },
  { view: 'ProfectionsView', term: 'profection', node: () => <ProfectionsView personId="p1" /> },
  {
    view: 'ReturnView',
    term: 'solarReturn',
    node: () => <ReturnView personId="p1" kind="solar-return" view="wheel" compareType={undefined} />,
  },
];

describe('inline glossary tooltips on view headings (#901)', () => {
  afterEach(() => {
    setLocale('en');
  });

  it.each((['en', 'nl'] as const).flatMap((locale) => headingTerms.map((row) => ({ locale, ...row }))))(
    '$view heading opens the $term glossary tooltip in $locale',
    async ({ locale, term, node }) => {
      setLocale(locale);
      const container = document.createElement('div');
      document.body.append(container);
      const root = createRoot(container);
      try {
        await act(async () => {
          root.render(node());
          await Promise.resolve();
        });
        // The whole heading is the trigger, so its text is the heading's own visible text.
        const heading = container.querySelector('h1');
        const trigger = heading?.querySelector('.glossary-term');
        expect(trigger, `${term} trigger in ${locale}`).not.toBeNull();
        expect(trigger?.textContent, `${term} trigger text in ${locale}`).toBe(heading?.textContent);
      } finally {
        act(() => {
          root.unmount();
        });
        container.remove();
      }
    },
  );
});

/**
 * Prose that names a removed term (#901): the view's own hint paragraph opens the term's definition, the visible word
 * is the trigger's text. Each row is the first mention in that paragraph, as `GlossaryText` marks it.
 */
const proseTerms: readonly {
  view: string;
  term: GlossaryTermId;
  visible: { readonly en: string; readonly nl: string };
  node: () => React.JSX.Element;
}[] = [
  {
    view: 'AstrocartographyView',
    term: 'localSpace',
    visible: { en: 'Local Space', nl: 'Local Space' },
    node: () => <AstrocartographyView personId="p1" />,
  },
  {
    view: 'ProfectionsView',
    term: 'profection',
    visible: { en: 'profections', nl: 'profecties' },
    node: () => <ProfectionsView personId="p1" />,
  },
  {
    view: 'CyclesView',
    term: 'aspect',
    visible: { en: 'aspect', nl: 'aspect' },
    node: () => <CyclesView />,
  },
  {
    view: 'SynastryView',
    term: 'aspect',
    visible: { en: 'aspects', nl: 'aspecten' },
    node: () => <SynastryView personId="p1" />,
  },
  {
    view: 'DraconicView',
    term: 'houses',
    visible: { en: 'houses', nl: 'huizen' },
    node: () => <DraconicView personId="p1" view="wheel" compareType={undefined} />,
  },
  {
    view: 'PrimaryDirectionsView',
    term: 'primaryDirection',
    visible: { en: 'Primary directions', nl: 'Primaire directies' },
    node: () => <PrimaryDirectionsView personId="p1" />,
  },
  {
    view: 'RectificationView',
    term: 'midheaven',
    visible: { en: 'Midheaven', nl: 'Midheaven' },
    node: () => <RectificationView />,
  },
  {
    view: 'RelocatedChartView',
    term: 'ascendant',
    visible: { en: 'Ascendant', nl: 'Ascendant' },
    node: () => <RelocatedChartView personId="p1" view="wheel" compareType={undefined} />,
  },
];

describe('inline glossary tooltips on view prose (#901)', () => {
  afterEach(() => {
    setLocale('en');
  });

  it.each(
    (['en', 'nl'] as const).flatMap((locale) =>
      proseTerms.map((row) => ({ locale, view: row.view, term: row.term, node: row.node, shown: row.visible[locale] })),
    ),
  )('$view prose opens the $term glossary tooltip in $locale', async ({ locale, term, shown, node }) => {
    setLocale(locale);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(node());
        await Promise.resolve();
      });
      const triggers = [...container.querySelectorAll('.glossary-term')].map((element) => element.textContent);
      expect(triggers, `${term} tooltip in ${locale}`).toContain(shown);
    } finally {
      act(() => {
        root.unmount();
      });
      container.remove();
    }
  });
});

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
