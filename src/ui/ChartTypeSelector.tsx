/**
 * The chart-type selector at the top of the Charts page: natal, draconic, harmonic, solar return, lunar
 * return. Plain links to the same page with another `?type=`, keeping the open view, so switching type
 * while reading (say) the Aspects view stays on the Aspects view.
 */
/**
 * @module ChartTypeSelector
 * @purpose Renders the natal/draconic/harmonic/solar-return/lunar-return chart-type selector shown at the top of a person's Charts page.
 * @conventions Plain links to the same page with another `?type=`, preserving the open view; `changeChartView` keeps the open view in the URL via `history.replaceState` + a synthetic `hashchange`.
 * @exports ChartTypeSelector, changeChartView
 */
import { CHART_TYPES, chartHref, type ChartType, type ChartViewKind } from './chart-sections.js';
import { chartTypesMessages } from './ChartTypes.messages.js';
import { useMessages } from './messages.js';

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
    <nav className="chart-type-nav" aria-label={t.typeSelectorAriaLabel}>
      {CHART_TYPES.map((candidate) => (
        <a
          key={candidate}
          href={chartHref(personId, view, candidate)}
          className={candidate === type ? 'chart-type-link active' : 'chart-type-link'}
          aria-current={candidate === type ? 'page' : undefined}
        >
          {t.typeLabels[candidate]}
        </a>
      ))}
    </nav>
  );
}

/**
 * Records the open view in the URL, so the header's menu and the type selector keep it and it can be
 * linked. Replaced, not pushed (a view switch is not a page), and announced so the app's router sees it.
 */
export function changeChartView(personId: string, type: ChartType, view: ChartViewKind): void {
  window.history.replaceState(null, '', chartHref(personId, view, type));
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}
