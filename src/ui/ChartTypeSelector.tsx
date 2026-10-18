/**
 * The chart-type control at the top of the Charts page (#511): one labelled Select for natal, draconic,
 * harmonic, solar return and lunar return. Choosing a type goes to the same page with another `?type=`,
 * keeping the open view, so switching type while reading (say) the Aspects view stays on the Aspects view.
 */
/**
 * @module ChartTypeSelector
 * @purpose Renders the one chart-type Select (natal/draconic/harmonic/solar-return/lunar-return) shown at the top of a person's Charts page.
 * @conventions A labelled shared Select, not links; choosing a type sets the page's hash with the open view preserved. `changeChartView` keeps the open view in the URL via `history.replaceState` + a synthetic `hashchange`.
 * @exports ChartTypeSelector, changeChartView
 */
import { CHART_TYPES, type ChartType, type ChartViewKind } from './chart-sections.js';
import { chartHref } from './route.js';
import { chartTypesMessages } from './ChartTypes.messages.js';
import { useMessages } from './messages.js';
import { Select } from './primitives/Select.js';
import { replaceRoute } from './nav-history.js';

export function ChartTypeSelector({
  personId,
  type,
  view,
}: {
  readonly personId: string;
  readonly type: ChartType;
  readonly view: ChartViewKind | undefined;
}): React.JSX.Element {
  const t = useMessages(chartTypesMessages);
  return (
    <div className="chart-type-select">
      <Select
        label={t.typeSelectorLabel}
        value={type}
        options={CHART_TYPES.map((candidate) => ({ value: candidate, label: t.typeLabels[candidate] }))}
        onChange={(value) => {
          const next = CHART_TYPES.find((candidate) => candidate === value);
          if (next !== undefined) window.location.hash = chartHref(personId, view, next);
        }}
      />
    </div>
  );
}

/**
 * Records the open view in the URL, so the header's menu and the type selector keep it and it can be
 * linked. Replaced, not pushed (a view switch is not a page), and announced so the app's router sees it.
 * When in comparison mode, preserves the compareType in the query param (#439).
 */
export function changeChartView(personId: string, type: ChartType, view: ChartViewKind, compareType?: ChartType): void {
  replaceRoute(chartHref(personId, view, type, compareType));
}
