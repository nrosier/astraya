/**
 * The chart screen's local navigation between its four views — Wheel, Aspects, Placements, and
 * Patterns & condition (#511) — per `docs/UI-UX_GUIDELINES.md` §2: "these are route-level views with
 * stable URLs and ordinary links, not ARIA tabs." A compact row of real links at and above the app's
 * standing 64rem nav breakpoint (`WorkspaceShell.tsx`'s own threshold); the shared `Select` primitive,
 * labelled "Chart view", below it.
 *
 * Takes a `buildHref` callback rather than a personId/type pair: the chart, composite, shared-link and
 * horary screens that all render these four views have genuinely different URL shapes (`#/chart/<id>`,
 * `#/composite/<id>`, `#/shared?<token-query>`, `#/horary` — no id at all), so each caller supplies its
 * own hash-building rather than this component assuming `chart-sections.ts`'s chart-specific `chartHref`.
 *
 * Each link also takes an `onNavigate` callback, called with `preventDefault()` already applied — the
 * same real-href-plus-programmatic-navigate shape most SPA router Link components use. A real `href`
 * means hover/copy-link/open-in-new-tab/middle-click all still work exactly as a reader expects from a
 * link; `onNavigate` means switching views updates immediately rather than waiting on a full hashchange
 * round-trip back down through the app's router, and lets `ChartDataView` stay responsive when mounted
 * standalone (outside the app's router) — e.g. in tests.
 */
/**
 * @module ChartViewNav
 * @purpose Renders the chart screen's local Wheel/Aspects/Placements/Patterns & condition navigation (#511) as ordinary links (wide) or a labelled Select (narrow), never ARIA tabs.
 * @conventions Takes a buildHref(view) callback rather than assuming one URL shape, since chart/composite/shared/horary each have a different one. Links keep a real href but also call onNavigate with preventDefault applied, so switching is instant and works even when mounted outside the app's router. Reuses the app's existing 64rem nav breakpoint rather than inventing one.
 * @exports ChartViewNav
 */
import { CHART_VIEWS, chartViewLabels, type ChartViewKind } from './chart-sections.js';
import { chartViewMessages } from './ChartView.messages.js';
import { useMessages } from './messages.js';
import { Select } from './primitives/Select.js';

export function ChartViewNav({
  activeView,
  buildHref,
  onNavigate,
  availableViews = CHART_VIEWS,
}: {
  readonly activeView: ChartViewKind;
  readonly buildHref: (view: ChartViewKind) => string;
  readonly onNavigate: (view: ChartViewKind) => void;
  /** Which views this chart currently has content for (e.g. a chart without houses has no Wheel). */
  readonly availableViews?: readonly ChartViewKind[];
}): React.JSX.Element {
  const t = useMessages(chartViewMessages);
  const labels = chartViewLabels(t);

  return (
    <>
      <nav className="chart-view-nav" aria-label={t.chartViewNavLabel}>
        {availableViews.map((view) => (
          <a
            key={view}
            href={buildHref(view)}
            className={view === activeView ? 'chart-view-link active' : 'chart-view-link'}
            aria-current={view === activeView ? 'page' : undefined}
            onClick={(event) => {
              event.preventDefault();
              onNavigate(view);
            }}
          >
            {labels[view]}
          </a>
        ))}
      </nav>
      <div className="chart-view-select">
        <Select
          label={t.chartViewSelectLabel}
          value={activeView}
          options={availableViews.map((view) => ({ value: view, label: labels[view] }))}
          onChange={(value) => {
            onNavigate(value as ChartViewKind);
          }}
        />
      </div>
    </>
  );
}
