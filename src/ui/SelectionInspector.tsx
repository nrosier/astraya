/**
 * The one place a chart selection is explained (#511): what was picked on the wheel or through a
 * table's row button, its facts, the written meaning, its connections, and Clear. It sits straight
 * after the dial in the workbench, so the meaning is always in the first adjacent region. With
 * nothing selected it holds a short prompt in the same space, so the first selection does not move
 * the page.
 */
/**
 * @module SelectionInspector
 * @purpose Shared inspector for the selected chart item: heading, facts, deterministic corpus meaning, related aspects, Clear, then any optional AI interpretation.
 * @conventions Facts and corpus text come first; the optional AI block (`FocusInterpretation`) is only ever appended after them. Always rendered (an empty prompt when nothing is selected) so its space is reserved; a polite live region so a selection made from a table row button is announced.
 * @exports SelectionInspector, WheelIsolationFacts
 */
import type { ChartData } from '../domain/chart-compute.js';
import type { AspectRow, PositionRow } from '../domain/chart-tables.js';
import type { FocusContext } from '../interpretation/focus-context-schema.js';
import type { Locale } from '../interpretation/schema.js';
import { aspectDisplayName, bodyDisplayName, signDisplayName } from './astro-names.messages.js';
import { chartViewMessages } from './ChartView.messages.js';
import { FocusInterpretation } from './FocusInterpretation.js';
import { useMessages } from './messages.js';
import { WheelSelectionText } from './WheelSelectionText.js';

/**
 * Click-to-isolate (#400, #412): what's currently selected, from the chart's own tables. A mouse/touch
 * enhancement on an `aria-hidden` wheel — the data tables stay the accessible path to every value.
 */
export interface WheelIsolationFacts {
  readonly heading: string;
  readonly positionRow?: PositionRow | undefined;
  readonly relatedAspects: readonly AspectRow[];
  readonly aspectRow?: AspectRow | undefined;
  /** For a clicked sign: the bodies drawn in it. */
  readonly bodiesInSign?: readonly PositionRow[] | undefined;
}

export function SelectionInspector({
  facts,
  selectionKey,
  data,
  focusContext,
  locale,
  onClear,
}: {
  readonly facts: WheelIsolationFacts | undefined;
  readonly selectionKey: string | undefined;
  readonly data: ChartData;
  readonly focusContext: FocusContext | undefined;
  readonly locale: Locale;
  readonly onClear: () => void;
}): React.JSX.Element {
  const t = useMessages(chartViewMessages);
  return (
    <section className="selection-inspector" aria-labelledby="selection-inspector-heading" aria-live="polite">
      <h3 id="selection-inspector-heading" className="selection-inspector-title">
        {t.inspectorHeading}
      </h3>
      {facts === undefined || selectionKey === undefined ? (
        <p className="hint">{t.inspectorEmpty}</p>
      ) : (
        <>
          <div className="selection-inspector-facts">
            <div className="chart-isolation-head">
              <strong>{facts.heading}</strong>
              <button type="button" className="quiet" onClick={onClear}>
                {t.isolationClear}
              </button>
            </div>
            {facts.bodiesInSign !== undefined &&
              (facts.bodiesInSign.length === 0 ? (
                <p className="hint">{t.isolationSignEmpty}</p>
              ) : (
                <p>
                  {facts.bodiesInSign
                    .map(
                      (row) =>
                        `${bodyDisplayName(row.bodyKey, locale)} ${String(row.degree)}°${String(row.minute).padStart(2, '0')}'`,
                    )
                    .join(', ')}
                </p>
              ))}
            {facts.positionRow !== undefined && (
              <p>
                {signDisplayName(facts.positionRow.sign, locale)} {facts.positionRow.degree}°
                {String(facts.positionRow.minute).padStart(2, '0')}'
                {facts.positionRow.house !== undefined && ` — ${t.houseLabel} ${facts.positionRow.house}`}
              </p>
            )}
            {facts.relatedAspects.length > 0 && (
              <ul>
                {facts.relatedAspects.map((row) => {
                  const otherKey = row.bodyAKey === facts.positionRow?.bodyKey ? row.bodyBKey : row.bodyAKey;
                  return (
                    <li key={`${row.bodyAKey}-${row.aspectKey}-${row.bodyBKey}`}>
                      {aspectDisplayName(row.aspectKey, locale)} {bodyDisplayName(otherKey, locale)} (
                      {row.orb.toFixed(2)}
                      °, {row.applying ? t.applying : t.separating})
                    </li>
                  );
                })}
              </ul>
            )}
            {facts.aspectRow !== undefined && (
              <p>
                {aspectDisplayName(facts.aspectRow.aspectKey, locale)} — {t.orbLabel} {facts.aspectRow.orb.toFixed(2)}°,{' '}
                {facts.aspectRow.applying ? t.applying : t.separating}
              </p>
            )}
            <WheelSelectionText chart={data} selectionKey={selectionKey} locale={locale} />
          </div>
          {focusContext !== undefined && (
            <FocusInterpretation context={focusContext} locale={locale} resetKey={selectionKey} />
          )}
        </>
      )}
    </section>
  );
}
