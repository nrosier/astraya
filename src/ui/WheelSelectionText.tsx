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
 * @conventions The degree-symbol (Sabian) entry shows only while the device setting is on (#817), in a compact bordered container. Resolves each entry through interpretation/compose.ts's resolvePlacementText so an uncovered placement still gets a mechanical fallback sentence; fetches the corpus lazily on first selection via wheel-corpus.js; uses ChartView.messages.ts for en/nl text via useMessages().
 * @exports WheelSelectionText
 */
import { useEffect, useMemo, useState } from 'react';
import { Disclosure } from './primitives/Disclosure.js';
import type { ChartData } from '../domain/chart-compute.js';
import { resolvePlacementText } from '../interpretation/compose.js';
import type { CorpusEntry, Locale } from '../interpretation/schema.js';
import type { InterpretationExclusions } from '../interpretation/rules.js';
import { parseSelectionKey, selectionPlacements } from '../interpretation/selection.js';
import { chartViewMessages } from './ChartView.messages.js';
import { useShowDegreeSymbol } from './degree-symbol-setting.js';
import { useMessages } from './messages.js';
import { wheelCorpus } from './wheel-corpus.js';
import { placementHeading, SELECTION_TEXT_LIMIT } from './wheel-selection.js';

export function WheelSelectionText({
  chart,
  selectionKey,
  locale,
  exclude,
}: {
  readonly chart: ChartData;
  readonly selectionKey: string;
  readonly locale: Locale;
  /** Objects left out of the written reading (#721); absent means every object is read. */
  readonly exclude?: InterpretationExclusions | undefined;
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

  // The Sabian (degree-symbol) entry follows the device setting (#817): off leaves it out of the selection altogether.
  const [showDegreeSymbol] = useShowDegreeSymbol();
  const items = useMemo(() => {
    const selection = parseSelectionKey(selectionKey);
    if (selection === undefined) return [];
    const placements = selectionPlacements(chart, selection, exclude);
    return showDegreeSymbol ? placements : placements.filter((item) => item.placement.category !== 'degree-symbol');
  }, [chart, selectionKey, exclude, showDegreeSymbol]);

  if (items.length === 0) return null;

  const labels = {
    house: t.houseLabel,
    dignityStates: t.dignityStateLabels,
    cuspOf: t.cuspHeading,
  };
  // Sections in reading order (#801): the sign's meaning, the house's, then the degree symbol. Entries
  // that are none of these (dignity, aspects) get no heading, which the owner's three-section decision
  // leaves unnamed; they close the list as a group of their own.
  const sections: readonly { readonly heading: string | undefined; readonly categories: readonly string[] }[] = [
    { heading: t.signSectionHeading, categories: ['planet-in-sign', 'sign-on-cusp', 'derived-point-in-sign'] },
    { heading: t.houseSectionHeading, categories: ['planet-in-house', 'derived-point-in-house'] },
    { heading: t.degreeSectionHeading, categories: ['degree-symbol'] },
  ];
  const known = sections.flatMap((entry) => entry.categories);
  // Grouped before the limit applies, so each heading is named once however the list is split.
  const groups = [
    ...sections.map((entry) => ({
      heading: entry.heading,
      rows: items.filter((item) => entry.categories.includes(item.placement.category)),
    })),
    {
      heading: undefined as string | undefined,
      rows: items.filter((item) => !known.includes(item.placement.category)),
    },
  ].filter((group) => group.rows.length > 0);
  const ordered = groups.flatMap((group) => group.rows.map((item) => ({ item, heading: group.heading })));
  const shownEntries = ordered.slice(0, SELECTION_TEXT_LIMIT);
  const restEntries = ordered.slice(SELECTION_TEXT_LIMIT);
  const renderItems = (list: typeof ordered, named: ReadonlySet<string | undefined>): React.JSX.Element => {
    const parts: { heading: string | undefined; showHeading: boolean; rows: (typeof items)[number][] }[] = [];
    for (const entry of list) {
      const last = parts[parts.length - 1];
      if (last !== undefined && last.heading === entry.heading) last.rows.push(entry.item);
      else parts.push({ heading: entry.heading, showHeading: !named.has(entry.heading), rows: [entry.item] });
    }
    return (
      <>
        {parts.map((group) => (
          <section
            key={group.heading ?? 'other'}
            className={
              group.heading === t.degreeSectionHeading
                ? 'chart-isolation-group selection-sabian'
                : 'chart-isolation-group'
            }
          >
            {group.heading !== undefined && group.showHeading && <h5>{group.heading}</h5>}
            <ul className="chart-isolation-texts">
              {group.rows.map((item) => (
                <li key={item.key}>
                  <strong>{placementHeading(item.placement, locale, labels)}</strong>
                  <p>{resolvePlacementText(item.placement, locale, corpus ?? [])}</p>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </>
    );
  };
  const namedAbove = new Set(shownEntries.map((entry) => entry.heading));

  return (
    <section className="chart-isolation-interpretation" aria-label={t.selectionInterpretationHeading}>
      <h4>{t.selectionInterpretationHeading}</h4>
      {failed && <p className="hint">{t.selectionUnavailable}</p>}
      {!failed && corpus === undefined && <p className="hint">{t.selectionLoading}</p>}
      {corpus !== undefined && (
        <>
          {renderItems(shownEntries, new Set())}
          {restEntries.length > 0 && (
            // Keyed on the selection, so a new one starts collapsed again.
            <Disclosure
              key={selectionKey}
              title={t.selectionMoreTitle}
              summary={t.selectionMoreSummary(restEntries.length)}
              showLabel={t.selectionShowAll}
              hideLabel={t.selectionHideAll}
            >
              {renderItems(restEntries, namedAbove)}
            </Disclosure>
          )}
        </>
      )}
    </section>
  );
}
