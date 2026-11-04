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
 * @conventions Facts and corpus text come first; the optional AI block (`FocusInterpretation`) is only ever appended after them. Always rendered (an empty prompt when nothing is selected) so its space is reserved; a polite live region so a selection made from a table row button is announced. A selected body also gets the keyboard next/previous contact control (#1063, order in `wheel-contacts.ts`).
 * @exports SelectionInspector, WheelIsolationFacts
 */
import { formatOrb } from './format.js';
import type { ChartData } from '../domain/chart-compute.js';
import type { AspectRow, PositionRow } from '../domain/chart-tables.js';
import type { FocusContext } from '../interpretation/focus-context-schema.js';
import type { Locale } from '../interpretation/schema.js';
import { aspectDisplayName, bodyDisplayName, signDisplayName } from './astro-names.messages.js';
import { chartViewMessages } from './ChartView.messages.js';
import { FocusInterpretation } from './FocusInterpretation.js';
import { useMessages } from './messages.js';
import { Badge } from './primitives/Badge.js';
import { Button } from './primitives/Button.js';
import { WheelSelectionText } from './WheelSelectionText.js';
import type { InterpretationExclusions } from '../interpretation/rules.js';
import { useId } from 'react';
import { contactDirectionForKey, type ContactStepper } from './wheel-contacts.js';

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

/**
 * Keyboard next/previous contact for a selected body (#1063). The dial has no tab stops, so the control lives
 * here: two buttons, and the arrow keys anywhere in the group (Right/Down next, Left/Up previous; the order is
 * documented in `wheel-contacts.ts` and in the hint below). The current contact is said in a polite live region
 * and marked on the wheel.
 */
function ContactStepperControl({
  stepper,
  locale,
}: {
  readonly stepper: ContactStepper;
  readonly locale: Locale;
}): React.JSX.Element {
  const t = useMessages(chartViewMessages);
  const hintId = useId();
  const { contacts, index, step } = stepper;
  if (contacts.length === 0) return <p className="hint selection-contacts">{t.contactsNone}</p>;
  const current = index === undefined ? undefined : contacts[index];
  const status =
    current === undefined || index === undefined
      ? t.contactsIdle(contacts.length)
      : t.contactCurrent(
          index + 1,
          contacts.length,
          aspectDisplayName(current.aspectKey, locale),
          bodyDisplayName(current.partnerKey, locale),
        );
  return (
    <div
      className="selection-contacts"
      role="group"
      aria-label={t.contactsLabel}
      aria-describedby={hintId}
      onKeyDown={(event) => {
        const direction = contactDirectionForKey(event.key);
        if (direction === undefined) return;
        event.preventDefault();
        step(direction);
      }}
    >
      <div className="selection-contacts-controls">
        <Button
          variant="quiet"
          size="compact"
          onClick={() => {
            step('previous');
          }}
        >
          {t.contactPrevious}
        </Button>
        <Button
          variant="quiet"
          size="compact"
          onClick={() => {
            step('next');
          }}
        >
          {t.contactNext}
        </Button>
      </div>
      <p className="selection-contacts-status" role="status" aria-live="polite" aria-atomic="true">
        {status}
      </p>
      <p id={hintId} className="hint">
        {t.contactsKeyHint}
      </p>
    </div>
  );
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
  exclude,
  onClear,
  lineIsolation,
  contactStepper,
  derivedChartNote,
  personId,
}: {
  readonly facts: WheelIsolationFacts | undefined;
  readonly selectionKey: string | undefined;
  readonly data: ChartData;
  readonly focusContext: FocusContext | undefined;
  readonly locale: Locale;
  /** Objects left out of the written reading (#721): the "What it means" text leaves them out too. */
  readonly exclude?: InterpretationExclusions;
  readonly onClear: () => void;
  /** The "only this body's aspects" switch (#1063), shown for a selected body only. */
  readonly lineIsolation?: { readonly isolated: boolean; readonly onChange: (isolated: boolean) => void } | undefined;
  /** Keyboard next/previous contact (#1063), shown for a selected body only. */
  readonly contactStepper?: ContactStepper | undefined;
  /** Said when the chart is not a natal chart, since the prose below is written for natal placements (#725). */
  readonly derivedChartNote?: string | undefined;
  /** The person the chart belongs to (#768): the AI reading lists and saves under them. */
  readonly personId?: string | undefined;
}): React.JSX.Element {
  const t = useMessages(chartViewMessages);
  // Where the selection stands, as the badges under the heading: sign and degree, then house.
  const spot = facts?.positionRow ?? facts?.pointPosition;
  const placement =
    spot === undefined
      ? undefined
      : {
          place: `${signDisplayName(spot.sign, locale)} ${String(spot.degree)}°${String(spot.minute).padStart(2, '0')}'`,
          house: spot.house,
        };
  return (
    <section className="selection-inspector" aria-labelledby="selection-inspector-heading" aria-live="polite">
      <h3 id="selection-inspector-heading" className="selection-inspector-title">
        {t.inspectorHeading}
      </h3>
      {derivedChartNote !== undefined && <p className="hint selection-inspector-derived-note">{derivedChartNote}</p>}
      {facts === undefined || selectionKey === undefined ? (
        <p className="hint">{t.inspectorEmpty}</p>
      ) : (
        <>
          <div className="selection-inspector-facts">
            <div className="chart-isolation-head">
              <strong>{facts.heading}</strong>
              <Button variant="quiet" size="compact" onClick={onClear}>
                {t.isolationClear}
              </Button>
            </div>
            {lineIsolation !== undefined && selectionKey.startsWith('body:') && (
              <Button
                variant="quiet"
                size="compact"
                aria-pressed={lineIsolation.isolated}
                onClick={() => {
                  lineIsolation.onChange(!lineIsolation.isolated);
                }}
              >
                {lineIsolation.isolated ? t.isolationShowAll : t.isolationOnlyThis}
              </Button>
            )}
            {contactStepper !== undefined && selectionKey.startsWith('body:') && (
              <ContactStepperControl stepper={contactStepper} locale={locale} />
            )}
            {placement !== undefined && (
              <p className="selection-inspector-badges">
                <Badge>{placement.place}</Badge>
                {placement.house !== undefined && (
                  <Badge>
                    {t.houseLabel} {placement.house}
                  </Badge>
                )}
                {facts.positionRow?.retrograde !== undefined && (
                  <Badge tone={facts.positionRow.retrograde ? 'accent' : undefined}>
                    {facts.positionRow.retrograde ? t.rxLabel : t.directLabel}
                  </Badge>
                )}
              </p>
            )}
            {facts.bodiesInSign !== undefined && (
              <BodyList rows={facts.bodiesInSign} emptyText={t.isolationSignEmpty} locale={locale} />
            )}
            {facts.bodiesInHouse !== undefined && (
              <BodyList rows={facts.bodiesInHouse} emptyText={t.isolationHouseEmpty} locale={locale} />
            )}
            {facts.relatedAspects.length > 0 && (
              <ul>
                {facts.relatedAspects.map((row) => {
                  const otherKey = row.bodyAKey === facts.positionRow?.bodyKey ? row.bodyBKey : row.bodyAKey;
                  return (
                    <li key={`${row.bodyAKey}-${row.aspectKey}-${row.bodyBKey}`}>
                      {aspectDisplayName(row.aspectKey, locale)} {bodyDisplayName(otherKey, locale)} (
                      {formatOrb(row.orb)}, {row.applying ? t.applying : t.separating})
                    </li>
                  );
                })}
              </ul>
            )}
            {facts.aspectRow !== undefined && (
              <p>
                {aspectDisplayName(facts.aspectRow.aspectKey, locale)} — {t.orbLabel} {formatOrb(facts.aspectRow.orb)},{' '}
                {facts.aspectRow.applying ? t.applying : t.separating}
              </p>
            )}
            <WheelSelectionText chart={data} selectionKey={selectionKey} locale={locale} exclude={exclude} />
          </div>
          {focusContext !== undefined && (
            <FocusInterpretation context={focusContext} locale={locale} resetKey={selectionKey} personId={personId} />
          )}
        </>
      )}
    </section>
  );
}
