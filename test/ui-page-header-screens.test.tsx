// @vitest-environment jsdom
/**
 * #887 (audit UI-04) — every top-level view renders its h1 through the shared PageHeader (its
 * `.page-header` wrapper and `.page-header-row`), not a bare heading of its own. Exceptions, per
 * the owner decision recorded on the issue: SetPasswordForm, PersonNotFound, the noLocalStorage
 * screen in App.tsx, and fallback-only headings (which still go through PageHeader here).
 *
 * Grouped by the file's place in the navigation: person-scoped chart and timing views, person
 * workspace screens, admin and utility screens. One `it` per view keeps a failure pinpointed.
 */
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

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

vi.mock('../src/ui/PdfExportBuilder.js', () => ({ PdfExportBuilder: () => <div /> }));

// SetupForm only needs `setup` from the session; the full provider opens the sync engine.
vi.mock('../src/ui/session-context.js', async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return {
    ...actual,
    useSession: (): Record<string, unknown> => ({
      user: undefined,
      adoption: undefined,
      signIn: () => Promise.resolve(),
      setup: () => Promise.resolve(),
      signOut: () => Promise.resolve(),
      resolveAdoption: () => Promise.resolve(),
    }),
  };
});

const { People } = await import('../src/ui/People.js');
const { Overview } = await import('../src/ui/Overview.js');
const { DocumentsView } = await import('../src/ui/DocumentsView.js');
const { TransitView } = await import('../src/ui/TransitView.js');
const { ChartView } = await import('../src/ui/ChartView.js');
const { DraconicView } = await import('../src/ui/DraconicView.js');
const { HarmonicView } = await import('../src/ui/HarmonicView.js');
const { ReturnView } = await import('../src/ui/ReturnView.js');
const { RelocatedChartView } = await import('../src/ui/RelocatedChartView.js');
const { ConsultationView } = await import('../src/ui/ConsultationView.js');
const { AstrocartographyView } = await import('../src/ui/AstrocartographyView.js');
const { CompositeView } = await import('../src/ui/CompositeView.js');
const { SynastryView } = await import('../src/ui/SynastryView.js');
const { ProfectionsView } = await import('../src/ui/ProfectionsView.js');
const { ProgressionsView } = await import('../src/ui/ProgressionsView.js');
const { SolarArcView } = await import('../src/ui/SolarArcView.js');
const { PrimaryDirectionsView } = await import('../src/ui/PrimaryDirectionsView.js');
const { PeriodicTransitView } = await import('../src/ui/PeriodicTransitView.js');
const { TimingTimelineView } = await import('../src/ui/TimingTimelineView.js');
const { ReportScreen } = await import('../src/ui/ReportScreen.js');
const { PreferencesView } = await import('../src/ui/PreferencesView.js');
const { CyclesView } = await import('../src/ui/CyclesView.js');
const { EclipsesView } = await import('../src/ui/EclipsesView.js');
const { EventSearchView } = await import('../src/ui/EventSearchView.js');
const { HoraryView } = await import('../src/ui/HoraryView.js');
const { ElectionalView } = await import('../src/ui/ElectionalView.js');
const { RectificationView } = await import('../src/ui/RectificationView.js');
const { AdminPanel } = await import('../src/ui/AdminPanel.js');
const { CorpusOverridesPanel } = await import('../src/ui/CorpusOverridesPanel.js');
const { CorpusCandidatesPanel } = await import('../src/ui/CorpusCandidatesPanel.js');
const { About } = await import('../src/ui/About.js');
const { Changelog } = await import('../src/ui/Changelog.js');
const { SetupForm } = await import('../src/ui/SetupForm.js');

async function headingOf(node: ReactNode): Promise<HTMLHeadingElement> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(node);
      await Promise.resolve();
    });
    const h1 = container.querySelector('h1');
    if (h1 === null) throw new Error('no h1 rendered');
    expect(container.querySelectorAll('h1')).toHaveLength(1);
    return h1;
  } finally {
    act(() => {
      root.unmount();
    });
    container.remove();
  }
}

function expectPageHeader(h1: HTMLHeadingElement): void {
  expect(h1.parentElement?.className).toBe('page-header-row');
  expect(h1.parentElement?.parentElement?.className).toBe('page-header');
  expect(h1.textContent).not.toBe('');
}

describe('one PageHeader pattern (#887)', () => {
  describe('workspace screens', () => {
    it('People', async () => {
      expectPageHeader(await headingOf(<People />));
    });

    it('Overview', async () => {
      expectPageHeader(await headingOf(<Overview personId="p1" />));
    });

    it('Documents', async () => {
      expectPageHeader(await headingOf(<DocumentsView />));
    });

    it('Transit', async () => {
      expectPageHeader(await headingOf(<TransitView personId="p1" />));
    });

    it('Consultation', async () => {
      expectPageHeader(await headingOf(<ConsultationView personId="p1" />));
    });

    it('Report', async () => {
      expectPageHeader(await headingOf(<ReportScreen personId="p1" />));
    });

    it('Preferences', async () => {
      expectPageHeader(await headingOf(<PreferencesView section={undefined} />));
    });
  });

  describe('person chart views', () => {
    it('Charts (natal)', async () => {
      expectPageHeader(await headingOf(<ChartView personId="p1" view="wheel" compareType={undefined} />));
    });

    it('Draconic', async () => {
      expectPageHeader(await headingOf(<DraconicView personId="p1" view="wheel" compareType={undefined} />));
    });

    it('Harmonic', async () => {
      expectPageHeader(await headingOf(<HarmonicView personId="p1" view="wheel" compareType={undefined} />));
    });

    it('Solar return', async () => {
      expectPageHeader(
        await headingOf(<ReturnView personId="p1" kind="solar-return" view="wheel" compareType={undefined} />),
      );
    });

    it('Relocated', async () => {
      expectPageHeader(await headingOf(<RelocatedChartView personId="p1" view="wheel" compareType={undefined} />));
    });

    it('Astrocartography', async () => {
      expectPageHeader(await headingOf(<AstrocartographyView personId="p1" />));
    });

    it('Composite', async () => {
      expectPageHeader(await headingOf(<CompositeView personId="p1" view="wheel" />));
    });

    it('Synastry', async () => {
      expectPageHeader(await headingOf(<SynastryView personId="p1" />));
    });
  });

  describe('person timing views', () => {
    it('Profections', async () => {
      expectPageHeader(await headingOf(<ProfectionsView personId="p1" />));
    });

    it('Progressions', async () => {
      expectPageHeader(await headingOf(<ProgressionsView personId="p1" />));
    });

    it('Solar arc', async () => {
      expectPageHeader(await headingOf(<SolarArcView personId="p1" />));
    });

    it('Primary directions', async () => {
      expectPageHeader(await headingOf(<PrimaryDirectionsView personId="p1" />));
    });

    it('Periodic transit', async () => {
      expectPageHeader(await headingOf(<PeriodicTransitView personId="p1" />));
    });

    it('Timing timeline', async () => {
      expectPageHeader(await headingOf(<TimingTimelineView personId="p1" />));
    });
  });

  describe('global and tool screens', () => {
    it('Cycles', async () => {
      expectPageHeader(await headingOf(<CyclesView />));
    });

    it('Eclipses', async () => {
      expectPageHeader(await headingOf(<EclipsesView />));
    });

    it('Event search', async () => {
      expectPageHeader(await headingOf(<EventSearchView />));
    });

    it('Horary', async () => {
      expectPageHeader(await headingOf(<HoraryView view="wheel" />));
    });

    it('Electional', async () => {
      expectPageHeader(await headingOf(<ElectionalView />));
    });

    it('Rectification', async () => {
      expectPageHeader(await headingOf(<RectificationView />));
    });

    it('About', async () => {
      expectPageHeader(await headingOf(<About />));
    });

    it('Changelog', async () => {
      expectPageHeader(await headingOf(<Changelog />));
    });

    it('Setup', async () => {
      expectPageHeader(await headingOf(<SetupForm />));
    });
  });

  describe('admin screens', () => {
    it('Admin', async () => {
      expectPageHeader(await headingOf(<AdminPanel />));
    });

    it('Corpus overrides', async () => {
      expectPageHeader(await headingOf(<CorpusOverridesPanel />));
    });

    it('Corpus candidates', async () => {
      expectPageHeader(await headingOf(<CorpusCandidatesPanel />));
    });
  });
});
