// @vitest-environment jsdom
/**
 * #980 — the separate interpretation page (the written report) stays reachable from the sidebar. Renders the real
 * `AppNav` on a person's route with a complete birth moment (the gate `isTabEnabled` applies to the Interpretation
 * tab), then checks that the link is present with the `#/people/:id/interpretation` href, and that the href parses
 * back to the `report` route that `App.tsx` maps to `ReportScreen`. The rendering of `ReportScreen` itself is
 * covered by `test/ui-derived-chart-no-report.test.tsx`.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseRoute, routeHref } from '../src/ui/route.js';

vi.mock('../src/ui/EphemerisProviderContext.js', () => ({
  useEphemerisProvider: () => ({ provider: undefined, error: undefined }),
}));

const personId = 'p-aaaaaaaaaaaaaaaa';
const fakeState = vi.hoisted(() => ({
  people: new Map([
    [
      'p-aaaaaaaaaaaaaaaa',
      {
        id: 'p-aaaaaaaaaaaaaaaa',
        displayName: 'Test',
        timeAccuracy: 'exact',
        moment: {
          civil: { year: 1970, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
          coordinates: { latitude: 41.1833, longitude: -84.7333 },
          offsetOverrideMinutes: 0,
        },
        placeLabel: 'Fort Wayne, IN',
        notes: '',
        missing: [],
        customPoints: [],
      },
    ],
  ]),
}));
vi.mock('../src/ui/store-context.js', () => ({
  useOptionalStore: () => ({ state: fakeState }),
  useStoreState: () => fakeState,
}));

const { AppNav } = await import('../src/ui/AppNav.js');
const { appNavMessages } = await import('../src/ui/AppNav.messages.js');

let mounted: { container: HTMLElement; root: Root } | undefined;

afterEach(() => {
  if (mounted !== undefined) {
    act(() => {
      mounted?.root.unmount();
    });
    mounted.container.remove();
    mounted = undefined;
  }
});

describe('interpretation page is reachable from the sidebar (#980)', () => {
  it('the sidebar links to #/people/:id/interpretation with the Interpretation label', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    mounted = { container, root };
    act(() => {
      root.render(<AppNav route={{ kind: 'chart', personId, chartType: 'natal', view: 'wheel' }} />);
    });

    const href = routeHref({ kind: 'report', personId });
    expect(href).toBe(`#/people/${personId}/interpretation`);
    const link = Array.from(container.querySelectorAll<HTMLAnchorElement>('a.app-nav-item')).find(
      (a) => a.getAttribute('href') === href,
    );
    expect(link).toBeDefined();
    expect(link?.textContent).toBe(appNavMessages.en.tabLabels.report);
  });

  it('that href parses back to the report route App.tsx renders as ReportScreen', () => {
    expect(parseRoute(`#/people/${personId}/interpretation`)).toEqual({ kind: 'report', personId });
  });
});
