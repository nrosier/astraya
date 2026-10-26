/**
 * The chart screen's local navigation between its views — Wheel, Aspects, Placements, and Patterns &
 * condition (#511) — per `docs/ui/UI-UX_GUIDELINES.md` §2: "these are route-level views with
 * stable URLs and ordinary links, not ARIA tabs." At and above the app's standing 64rem nav breakpoint
 * (`WorkspaceShell.tsx`'s own threshold) they are a row of real links in the shared `ScrollingTabRow` (#818),
 * which scrolls sideways with edge fades and pins the chart's Overlays and Extended settings triggers at the far
 * right; the shared `Select` primitive, labelled "Chart view", replaces the links below it.
 *
 * Takes a `buildHref` callback rather than a personId/type pair: the chart, composite, shared-link and
 * horary screens that all render these views have genuinely different URL shapes (`#/people/<id>/charts/<type>/<view>`,
 * `#/people/<id>/relationships/composite`, `#/shared?<token-query>`, `#/explore/horary` — no id at all), so each caller supplies its
 * own hash-building rather than this component assuming `route.ts`'s chart-specific `chartHref`.
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
 * @purpose Renders the chart screen's local view navigation (#511) under the title row as ordinary links in a horizontally scrolling tab row (wide, #818) or a labelled Select (narrow), never ARIA tabs, with the chart's pinned actions at the far right.
 * @conventions Takes a buildHref(view) callback rather than assuming one URL shape, since chart/composite/shared/horary each have a different one. Links keep a real href but also call onNavigate with preventDefault applied, so switching is instant and works even when mounted outside the app's router. Reuses the app's existing 64rem nav breakpoint rather than inventing one. With no available views (loading, error) only the leading control and the actions are drawn. The links keep the `chart-view-link` class and `active` marker the tests and e2e specs find them by.
 * @exports ChartViewNav
 */
import { CHART_VIEWS, chartViewLabels, type ChartViewKind } from './chart-sections.js';
import { chartViewMessages } from './ChartView.messages.js';
import { useMessages } from './messages.js';
import { Select } from './primitives/Select.js';
import { ScrollingTabRow } from './ScrollingTabRow.js';

export function ChartViewNav({
  activeView,
  buildHref,
  onNavigate,
  availableViews = CHART_VIEWS,
  leading,
  actions,
}: {
  readonly activeView: ChartViewKind;
  readonly buildHref: (view: ChartViewKind) => string;
  readonly onNavigate: (view: ChartViewKind) => void;
  /** Which views this chart currently has content for (e.g. a chart without houses has no Wheel); none: no links or select are drawn. */
  readonly availableViews?: readonly ChartViewKind[];
  /** Optional control placed first on the same row (the chart type select, #801). */
  readonly leading?: React.ReactNode;
  /** The triggers pinned at the far right (#818): Overlays and Extended settings. Behind one "⚙️ ▾" toggle below 450px. */
  readonly actions?: React.ReactNode;
}): React.JSX.Element {
  const t = useMessages(chartViewMessages);
  const labels = chartViewLabels(t);

  return (
    <ScrollingTabRow
      label={t.chartViewNavLabel}
      navClassName="chart-view-nav"
      activeKey={activeView}
      leading={leading}
      prefix={<span className="chart-view-prefix">{t.extendedSettingsPrefix}</span>}
      fallback={
        availableViews.length === 0 ? undefined : (
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
        )
      }
      actions={actions}
      actionsLabel={t.chartActionsLabel}
    >
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
    </ScrollingTabRow>
  );
}
