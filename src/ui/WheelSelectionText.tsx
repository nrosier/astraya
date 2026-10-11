/**
 * The written interpretation for whatever is selected on the chart wheel (#415): the same corpus
 * text the Interpretation tab shows for those placements, under the facts the selection panel
 * already gives. It resolves each entry through `resolvePlacementText`, so a placement the corpus
 * has no entry for still gets the mechanical sentence rather than nothing, so the two screens read
 * alike.
 *
 * The corpus is fetched on the first selection (it is not loaded with the wheel) and kept per
 * language, so later clicks show their text at once.
 */
/**
 * @module WheelSelectionText
 * @purpose Renders the interpretation corpus text for whatever body/sign/house/aspect is currently selected on a chart wheel.
 * @conventions Resolves each entry through interpretation/compose.ts's resolvePlacementText so an uncovered placement still gets a mechanical fallback sentence; fetches the corpus lazily on first selection via wheel-corpus.js; uses ChartView.messages.ts for en/nl text via useMessages().
 * @exports WheelSelectionText
 */
import { useEffect, useMemo, useState } from 'react';
import { Disclosure } from './primitives/Disclosure.js';
import type { ChartData } from '../domain/chart-compute.js';
import { resolvePlacementText } from '../interpretation/compose.js';
import type { CorpusEntry, Locale } from '../interpretation/schema.js';
import { parseSelectionKey, selectionPlacements } from '../interpretation/selection.js';
import { chartViewMessages } from './ChartView.messages.js';
import { useMessages } from './messages.js';
import { wheelCorpus } from './wheel-corpus.js';
import { placementHeading, SELECTION_TEXT_LIMIT } from './wheel-selection.js';

export function WheelSelectionText({
  chart,
  selectionKey,
  locale,
}: {
  readonly chart: ChartData;
  readonly selectionKey: string;
  readonly locale: Locale;
}): React.JSX.Element | null {
  const t = useMessages(chartViewMessages);
  const [corpus, setCorpus] = useState<readonly CorpusEntry[] | undefined>(undefined);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setCorpus(undefined);
    setFailed(false);
    wheelCorpus(locale).then(
      (loaded) => {
        if (!cancelled) setCorpus(loaded);
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [locale]);

  const items = useMemo(() => {
    const selection = parseSelectionKey(selectionKey);
    return selection === undefined ? [] : selectionPlacements(chart, selection);
  }, [chart, selectionKey]);

  if (items.length === 0) return null;

  const labels = {
    house: t.houseLabel,
    dignityStates: t.dignityStateLabels,
    cuspOf: t.cuspHeading,
  };
  const shown = items.slice(0, SELECTION_TEXT_LIMIT);
  const rest = items.slice(SELECTION_TEXT_LIMIT);
  const renderItems = (list: typeof items): React.JSX.Element => (
    <ul className="chart-isolation-texts">
      {list.map((item) => (
        <li key={item.key}>
          <strong>{placementHeading(item.placement, locale, labels)}</strong>
          <p>{resolvePlacementText(item.placement, locale, corpus ?? [])}</p>
        </li>
      ))}
    </ul>
  );

  return (
    <section className="chart-isolation-interpretation" aria-label={t.selectionInterpretationHeading}>
      <h4>{t.selectionInterpretationHeading}</h4>
      {failed && <p className="hint">{t.selectionUnavailable}</p>}
      {!failed && corpus === undefined && <p className="hint">{t.selectionLoading}</p>}
      {corpus !== undefined && (
        <>
          {renderItems(shown)}
          {rest.length > 0 && (
            // Keyed on the selection, so a new one starts collapsed again.
            <Disclosure
              key={selectionKey}
              title={t.selectionMoreTitle}
              summary={t.selectionMoreSummary(rest.length)}
              showLabel={t.selectionShowAll}
              hideLabel={t.selectionHideAll}
            >
              {renderItems(rest)}
            </Disclosure>
          )}
        </>
      )}
    </section>
  );
}
