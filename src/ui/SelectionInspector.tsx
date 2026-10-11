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
  /** For a derived point (#511): where it falls. Not a body, so there is no position row. */
  readonly pointPosition?:
    | { readonly sign: string; readonly degree: number; readonly minute: number; readonly house: number | undefined }
    | undefined;
  /** For a selected house cusp: the bodies standing in that house. */
  readonly bodiesInHouse?: readonly PositionRow[] | undefined;
}

/** The bodies in a sign or house with their degrees, or the empty-state sentence. */
function BodyList({
  rows,
  emptyText,
  locale,
}: {
  readonly rows: readonly PositionRow[];
  readonly emptyText: string;
  readonly locale: Locale;
}): React.JSX.Element {
  if (rows.length === 0) return <p className="hint">{emptyText}</p>;
  return (
    <p>
      {rows
        .map(
          (row) =>
            `${bodyDisplayName(row.bodyKey, locale)} ${String(row.degree)}°${String(row.minute).padStart(2, '0')}'`,
        )
        .join(', ')}
    </p>
  );
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
            {facts.bodiesInSign !== undefined && (
              <BodyList rows={facts.bodiesInSign} emptyText={t.isolationSignEmpty} locale={locale} />
            )}
            {facts.bodiesInHouse !== undefined && (
              <BodyList rows={facts.bodiesInHouse} emptyText={t.isolationHouseEmpty} locale={locale} />
            )}
            {facts.positionRow !== undefined && (
              <p>
                {signDisplayName(facts.positionRow.sign, locale)} {facts.positionRow.degree}°
                {String(facts.positionRow.minute).padStart(2, '0')}'
                {facts.positionRow.house !== undefined && ` — ${t.houseLabel} ${facts.positionRow.house}`}
              </p>
            )}
            {facts.pointPosition !== undefined && (
              <p>
                {signDisplayName(facts.pointPosition.sign, locale)} {facts.pointPosition.degree}°
                {String(facts.pointPosition.minute).padStart(2, '0')}'
                {facts.pointPosition.house !== undefined && ` — ${t.houseLabel} ${facts.pointPosition.house}`}
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
