/**
 * Transit bi-wheel for one saved person against a chosen moment (#172), using #51's
 * cross-chart aspect engine and #52's multi-ring renderer.
 *
 * Structured the same way as `ProfectionsView.tsx`: same "as of" date input (defaulting to
 * today), same worker-ephemeris lifecycle, same person-not-found / incomplete-moment /
 * unknown-time-accuracy gating — a transit's houses are cast for both rings, so an unknown
 * birth time makes the whole screen as meaningless as it makes `ChartView.tsx`'s houses tab
 * or `ProfectionsView.tsx` itself.
 *
 * The wheel bypasses `AstroChartWheel.tsx` (the third-party `@astrodraw/astrochart` wrapper,
 * single-chart only) entirely and calls `renderMultiWheelSvg` directly with two rings built
 * by `transitWheelInput` — natal innermost, transiting outer, matching how most astrology
 * software draws a transit wheel and matching `computeTransit`'s own contacts ordering
 * (moving/transiting first). The result is a complete standalone `<svg>` (default, non-`bare`
 * options), injected the same trust-boundary way `ChartView.tsx` injects its sheet markup:
 * entirely app-generated from just-computed data, never user-supplied.
 */
/**
 * @module TransitView
 * @purpose Transit bi-wheel screen for one saved person against a chosen date: natal chart on the inner ring, transiting positions on the outer ring, with filtered cross-chart contacts and void-of-course Moon.
 * @conventions Calls renderMultiWheelSvg directly, bypassing the single-chart AstroChartWheel wrapper, same as SynastryView.tsx; uses TransitView.messages.ts for en/nl text via useMessages(). Carries its own PrintProvenance footer (#564) labelled with engine defaults, since computeTransit doesn't yet take a user-configurable calculation snapshot. A recalculation keeps the earlier result on screen (aria-busy) so playback never unmounts the wheel or table (#1440). The how-to text (date-bar keys, bi-wheel, live filter count and the Important rule, click-to-select) lives in one collapsed Disclosure under the date bar, from the owner's review text (#1400, #1440).
 * @exports TransitView, contactColumns
 */

import { DateAnimationBar } from './DateAnimationBar.js';
import { dateAnimationBarMessages } from './DateAnimationBar.messages.js';
import { transitFilterPanelMessages } from './TransitFilterPanel.messages.js';
import { Disclosure } from './primitives/Disclosure.js';
import { useAsOfDate } from './use-as-of-date.js';
import { GlossaryText } from './GlossaryText.js';
import { personHref } from './route.js';
import { houseSystemLabel, rulershipLabel, zodiacLabel } from './ChartView.js';
import { PrintProvenance } from './PrintProvenance.js';
import { DEFAULT_EXTENDED_SETTINGS, settingsForContext, withOrbsOf } from '../chart/extended-settings.js';
import { DEFAULT_RULERSHIP_CHOICE } from '../astrology/rulership.js';
import { DEFAULT_ORB_CONFIG, type Aspect } from '../astrology/aspects.js';
import { buildCalculationSnapshot, snapshotCalculationOptions } from '../domain/calculation-snapshot.js';
import type { CalculationArtifact } from '../domain/calculation-artifact.js';
import { artifactProvenanceIdentity, buildTechniqueChartArtifact } from './chart-artifact.js';

import { useSymbolClass } from './symbol-setting.js';
import { useGlyphVariants } from './glyph-variant-setting.js';
import { useEffect, useMemo, useState } from 'react';
import { useEphemerisProvider } from './EphemerisProviderContext.js';
import { crossContactRows, type AspectRow } from '../domain/chart-tables.js';
import { deriveExportFilename } from '../domain/export-filename.js';
import { computeTransit, type TransitAngleContact, type TransitData } from '../domain/transit.js';
import { transitWheelInput } from '../domain/transit-wheel.js';
import { usePersonCalculationSettings } from './person-calculation-settings.js';
import { UnreadableSettingsNotice } from './UnreadableSettingsNotice.js';
import { useOrbContextSource, useOrbLibrary } from './orb-library-store.js';
import { renderMultiWheelSvg, type CrossRingAspects } from '../chart/multi-wheel.js';
import { findVoidOfCourseMoon, type VoidOfCourseMoon } from '../astrology/void-of-course.js';
import { voidOfCourseSentence } from './void-of-course-text.js';
import { aspectDisplayName, bodyDisplayName } from './astro-names.messages.js';
import { formatOrb, formatTimestamp } from './format.js';
import { buildFocusObjectContext } from '../interpretation/focus-context.js';
import { FocusInterpretation } from './FocusInterpretation.js';
import { BiWheelSelectionPanel } from './BiWheelSelectionPanel.js';
import { biWheelSelectionPanelMessages } from './BiWheelSelectionPanel.messages.js';
import { resolveBiWheelSelection } from './bi-wheel-selection.js';
import { useWheelIsolation } from './wheel-interaction.js';
import { PatchedWheel } from './wheel-morph.js';
import {
  chartRulerKeysOf,
  filterAngleTransits,
  filterTransits,
  presetOf,
  rankTransitsWithAngles,
  type TransitRuleContext,
} from '../astrology/transit-importance.js';
import { housesAreDefined } from '../domain/chart-compute.js';
import { EVERY_BODY_KEY, TransitFilterButton, TransitFilterStatus, useTransitFilter } from './TransitFilterPanel.js';
import { useLocale } from './locale.js';
import { useMessages } from './messages.js';
import { PersonNotFound } from './PersonNotFound.js';
import { SortableTable, csvExportTable, useCsvExports } from './SortableTable.js';
import { AspectState } from './ChartViewAspects.js';
import { useStoreState } from './store-context.js';
import { transitViewMessages } from './TransitView.messages.js';
import type { TableColumn } from './table-sort.js';
import type { Locale } from '../interpretation/schema.js';
import { StatusMessage } from './primitives/StatusMessage.js';
import { useStableMoment } from './use-stable-moment.js';
import { PageHeader } from './PageHeader.js';
import { orbSourceName, useCalculationBasisLine } from './calculation-basis.js';

type Load =
  | { readonly kind: 'loading' }
  | {
      readonly kind: 'ready';
      readonly data: TransitData;
      readonly voidOfCourse: VoidOfCourseMoon | undefined;
      /** The calculation's artifact (#582), when one could be built. */
      readonly artifact?: CalculationArtifact | undefined;
    }
  | { readonly kind: 'error'; readonly message: string };

/** Exported for `pdf-export-plan.ts` (#441): the same contacts table this screen shows, reused as-is for the PDF export's Transits section. */
export function contactColumns(t: typeof transitViewMessages.en, locale: Locale): readonly TableColumn<AspectRow>[] {
  return [
    {
      key: 'bodyAName',
      label: t.transitingLabel,
      valueOf: (row) => row.bodyAName,
      render: (row) => bodyDisplayName(row.bodyAKey, locale),
    },
    {
      key: 'aspect',
      label: t.aspectLabel,
      labelHelp: 'aspect',
      valueOf: (row) => row.aspect,
      render: (row) => aspectDisplayName(row.aspectKey, locale),
    },
    {
      key: 'bodyBName',
      label: t.natalLabel,
      valueOf: (row) => row.bodyBName,
      render: (row) => bodyDisplayName(row.bodyBKey, locale),
    },
    { key: 'orb', label: t.orbLabel, valueOf: (row) => row.orb, render: (row) => formatOrb(row.orb) },
    {
      key: 'applying',
      label: t.applyingLabel,
      valueOf: (row) => row.applying,
      // Plain text for the PDF and copy; the state dot plus label is the screen cell only (#918, as in the Aspects table).
      render: (row) => (row.applying ? t.applying : t.separating),
      renderCell: (row) => <AspectState applying={row.applying} label={row.applying ? t.applying : t.separating} />,
    },
  ];
}

export function TransitView({ personId }: { personId: string }): React.JSX.Element {
  const state = useStoreState();
  const person = state.people.get(personId);
  const personMoment = useStableMoment(person?.moment);
  const t = useMessages(transitViewMessages);
  const [locale] = useLocale();
  const [asOf, setAsOf, setPlayback] = useAsOfDate();
  const { provider } = useEphemerisProvider();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  // True while the next date calculates and the earlier result stays on screen (#1440): swapping the result for a loading message would unmount the wheel and tables on every playback step.
  const [refreshing, setRefreshing] = useState(false);
  // The orbs are the device's Extended settings (#590): transits use the same orbs as the natal chart.
  // Everything else stays at the engine defaults, as this screen's footer says.
  const {
    settings: extendedSettings,
    unreadable: settingsUnreadable,
    rulership,
  } = usePersonCalculationSettings(personId);
  const orbLibrary = useOrbLibrary();
  const orbSources = useOrbContextSource();
  const snapshot = useMemo(
    () =>
      buildCalculationSnapshot(
        withOrbsOf(DEFAULT_EXTENDED_SETTINGS, settingsForContext(extendedSettings, 'transit', orbLibrary, orbSources)),
        DEFAULT_RULERSHIP_CHOICE,
      ),
    [extendedSettings, orbLibrary, orbSources],
  );

  // What the transits are calculated with: the engine defaults, the transit orbs (`snapshot` above) and the person's rulers,
  // which pick the chart rulers the view highlights.
  const basisLine = useCalculationBasisLine(
    snapshot.settings,
    rulership,
    orbSourceName(orbLibrary, orbSources, 'transit'),
  );

  const targetDate = useMemo(() => {
    const [year, month, day] = asOf.split('-').map(Number);
    return year !== undefined && month !== undefined && day !== undefined ? { year, month, day } : undefined;
  }, [asOf]);

  useEffect(() => {
    if (personMoment === undefined || provider === undefined || settingsUnreadable || targetDate === undefined)
      return undefined;
    const moment = personMoment;
    const effect = { cancelled: false };
    setRefreshing(true);

    void (async () => {
      try {
        // Noon, not midnight — same reasoning as ProfectionsView.tsx: a date picker names a
        // day, not a moment, and noon keeps the civil day intact under any offset the target's
        // own calculation might apply.
        const targetJd = await provider.julianDayFromUtc(targetDate.year, targetDate.month, targetDate.day, 12, 0, 0);
        const options = snapshotCalculationOptions(snapshot);
        const data = await computeTransit(moment, targetJd, provider, options);
        const artifact = await buildTechniqueChartArtifact(
          snapshot,
          moment,
          { kind: 'transit', targetJd, orbConfig: options.orbConfig ?? DEFAULT_ORB_CONFIG },
          data.natal,
          data,
          provider,
        );
        // Secondary to the wheel: if the Moon search fails, the screen still shows the transit.
        const voidOfCourse = await findVoidOfCourseMoon(provider, targetJd).catch(() => undefined);
        if (!effect.cancelled) {
          setLoad({ kind: 'ready', data, voidOfCourse, artifact });
          setRefreshing(false);
        }
      } catch (error) {
        if (!effect.cancelled) {
          setLoad({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
          setRefreshing(false);
        }
      }
    })();

    return () => {
      effect.cancelled = true;
    };
  }, [settingsUnreadable, personMoment, provider, targetDate, snapshot]);

  const [symbolClass] = useSymbolClass();
  // The wheel's markup is cached on these, so a change of symbol form redraws it.
  const [variants] = useGlyphVariants();
  const natal = load.kind === 'ready' ? load.data.natal : undefined;
  const rules = useMemo<TransitRuleContext>(
    () => ({
      everyBodyKey: EVERY_BODY_KEY,
      context: 'daily',
      chartRulerKeys:
        natal !== undefined && housesAreDefined(natal.houses)
          ? chartRulerKeysOf(natal.houses.ascendant, rulership)
          : undefined,
    }),
    [natal, rulership],
  );
  const [filter, setFilter, applyFilterForThisViewOnly] = useTransitFilter(rules);
  // The table, the wheel's cross-ring lines and the panel all read the same filtered, ranked list.
  // Body and angle (ASC, MC) contacts are ranked together (#1508), so the wheel and the table list the same contacts.
  const rankedContacts = useMemo(
    () =>
      load.kind === 'ready'
        ? rankTransitsWithAngles(
            filterTransits(load.data.contacts, filter),
            filterAngleTransits(load.data.angleContacts, filter),
            filter,
            rules.chartRulerKeys,
          )
        : [],
    [load, filter, rules],
  );
  // "Of N": every body contact, plus the angle contacts to an angle the filter has chosen as a natal target
  // (no preset chooses ASC or MC, so All still reads "N of N"; shown can never exceed this).
  const totalContacts = useMemo(
    () =>
      load.kind === 'ready'
        ? load.data.contacts.length + load.data.angleContacts.filter((c) => filter.natal.includes(c.angle)).length
        : 0,
    [load, filter],
  );
  const shownContacts = useMemo(
    () => rankedContacts.filter((contact): contact is Aspect => !('angle' in contact)),
    [rankedContacts],
  );
  const shownAngleContacts = useMemo(
    () => rankedContacts.filter((contact): contact is TransitAngleContact => 'angle' in contact),
    [rankedContacts],
  );

  // Rebuilt only when the contacts change, so an unrelated render (a playback step's state) hands the table the same rows.
  const contactRows = useMemo(() => crossContactRows(rankedContacts), [rankedContacts]);

  const contactTableColumns = useMemo(() => contactColumns(t, locale), [t, locale]);

  const wheelMarkup = useMemo(() => {
    if (load.kind !== 'ready') return undefined;
    const { natalRing, transitRing } = transitWheelInput(load.data, filter, {
      natal: t.natalLabel,
      transit: t.transitRingLabel,
    });
    const crossAspects: readonly CrossRingAspects[] = [
      // Natal is ring 0 (innermost), transit ring 1 (outer). `computeTransit`'s contacts are
      // already ordered transiting-first (bodyA), natal-second (bodyB) — the same order
      // `outerRingIndex`/`innerRingIndex` expect.
      { innerRingIndex: 0, outerRingIndex: 1, aspects: shownContacts, angleAspects: shownAngleContacts },
    ];
    return renderMultiWheelSvg([natalRing, transitRing], crossAspects);
    // oxlint-disable-next-line react/exhaustive-deps -- the wheel renderers read the glyph settings from module state, so these are cache keys, not inputs the callback reads.
  }, [load, t, filter, shownContacts, shownAngleContacts, symbolClass, variants]);

  const wheelT = useMessages(biWheelSelectionPanelMessages);
  const dateBarT = useMessages(dateAnimationBarMessages);
  const filterT = useMessages(transitFilterPanelMessages);
  const {
    wheelRef,
    selectionKey,
    clear: clearIsolation,
    onClick: handleWheelClick,
    onKeyDown: handleWheelKeyDown,
  } = useWheelIsolation(wheelMarkup);
  const biWheelFacts = useMemo(() => {
    if (load.kind !== 'ready' || selectionKey === undefined) return undefined;
    return resolveBiWheelSelection(selectionKey, {
      rings: [
        { label: t.natalLabel, data: load.data.natal },
        { label: t.transitRingLabel, data: load.data.transit },
      ],
      cross: contactRows,
      // Each contact's first end is the transiting body (ring 1), its second the natal point (ring 0).
      crossRingOfA: 1,
      crossRingOfB: 0,
    });
  }, [load, selectionKey, t, contactRows]);

  // What the "interpret the tensions of this placement" button would send (#424): for a transiting
  // planet, its contacts as they are on screen (after the filter); for a natal one, the natal chart's own.
  const focusContext = useMemo(() => {
    if (load.kind !== 'ready' || biWheelFacts?.kind !== 'body') return undefined;
    const { bodyKey, ring } = biWheelFacts.body;
    return buildFocusObjectContext(
      load.data.natal,
      bodyKey,
      ring === 1 ? { chart: load.data.transit, contacts: shownContacts } : undefined,
      rulership,
    );
  }, [load, biWheelFacts, shownContacts, rulership]);

  // The contacts table's CSV, in source order (the contacts as computed), offered in the page header (#887).
  useCsvExports(
    load.kind === 'ready' && wheelMarkup !== undefined && person !== undefined
      ? [
          csvExportTable(
            'contacts',
            t.contactsCaption,
            deriveExportFilename(person.displayName, 'transit-contacts', 'csv'),
            contactColumns(t, locale),
            crossContactRows([
              ...filterTransits(load.data.contacts, filter),
              ...filterAngleTransits(load.data.angleContacts, filter),
            ]),
          ),
        ]
      : undefined,
  );

  if (person === undefined) {
    return <PersonNotFound />;
  }

  if (settingsUnreadable) {
    return <UnreadableSettingsNotice name={person.displayName || ''} />;
  }

  if (person.moment === undefined) {
    return (
      <main className="shell">
        <PageHeader headingLevel={2} title={t.transitsFallback} titleTerm="transit" />
        <p>
          <GlossaryText text={t.notCompleteTransits(person.displayName || t.thisPerson)} />{' '}
          <a href={personHref(personId)}>{t.personPageLink}</a>.
        </p>
      </main>
    );
  }

  if (person.timeAccuracy === 'unknown') {
    return (
      <main className="shell">
        <PageHeader headingLevel={2} title={t.transitsFallback} titleTerm="transit" />
        <p>
          <GlossaryText text={t.needsKnownTime(person.displayName || t.thisPerson)} />
        </p>
      </main>
    );
  }

  return (
    <main className="shell shell--wide-text">
      {/* Invisible outside @media print (#564) — see app.css's own `.print-provenance` rule.
          This screen doesn't yet thread a user-configurable calculation snapshot through
          `computeTransit` (see PrintProvenance.tsx's doc comment) — `rulership` above only
          ranks contacts, it isn't passed into the chart calculation itself — so the footer
          truthfully names the engine defaults both rings are actually computed with. */}
      <PrintProvenance
        houseSystem={houseSystemLabel(DEFAULT_EXTENDED_SETTINGS.houseSystem)}
        zodiac={zodiacLabel(DEFAULT_EXTENDED_SETTINGS.zodiac)}
        rulership={rulershipLabel(DEFAULT_RULERSHIP_CHOICE)}
        snapshotIdentity={artifactProvenanceIdentity(load.kind === 'ready' ? load.artifact : undefined, snapshot)}
        generatedAt={formatTimestamp(new Date())}
      />
      <PageHeader
        headingLevel={2}
        title={person.displayName ? t.heading(person.displayName) : t.transitsFallback}
        titleTerm="transit"
        basis={basisLine}
      >
        {/* The transit filter button and Export sit in the heading row, to the right (#1227, owner review 2026-11-07); the date has its own bar below (#1400). */}
        {load.kind === 'ready' && wheelMarkup !== undefined && (
          <TransitFilterButton
            filter={filter}
            rules={rules}
            onApply={applyFilterForThisViewOnly}
            onApplyAsDefault={setFilter}
            locale={locale}
          />
        )}
      </PageHeader>
      <DateAnimationBar date={asOf} onDateChange={setAsOf} onPlayingChange={setPlayback} showHint={false} />
      {/* The owner's explainer text (review 2026-11-12), closed until opened; the live count is computed from the filter. */}
      <Disclosure
        title={t.explainerTitle}
        summary={t.explainerSummary}
        showLabel={t.explainerShow}
        hideLabel={t.explainerHide}
      >
        <p className="hint">{dateBarT.hint}</p>
        <p className="hint">
          <GlossaryText text={t.hint(person.displayName || t.thisPerson)} />
        </p>
        {load.kind === 'ready' && (
          <p className="hint">
            {filterT.count(
              rankedContacts.length,
              totalContacts,
              filterT.presetsShort[presetOf(filter, rules) ?? 'custom'],
            )}
          </p>
        )}
        <p className="hint">{rules.context === 'daily' ? filterT.dailyNote : filterT.yearlyNote}</p>
        <p className="hint">{wheelT.hint}</p>
      </Disclosure>

      {/* The result region: busy while the transit (re)calculates, as the Astrocartography map is. */}
      <div aria-busy={load.kind === 'loading' || refreshing}>
        {load.kind === 'loading' && <StatusMessage kind="loading">{t.calculating}</StatusMessage>}

        {load.kind === 'error' && <StatusMessage kind="error">{t.error(load.message)}</StatusMessage>}

        {load.kind === 'ready' && wheelMarkup !== undefined && (
          <>
            {/* App-generated SVG from just-computed chart data, never user-supplied markup —
              the same trust boundary ChartView.tsx's sheet markup is injected under. */}
            <TransitFilterStatus
              filter={filter}
              rules={rules}
              onChange={setFilter}
              shown={rankedContacts.length}
              total={totalContacts}
              ruleNote={false}
            />

            <PatchedWheel
              ref={wheelRef}
              className="chart-wheel chart-wheel-interactive"
              markup={wheelMarkup}
              onClick={handleWheelClick}
              onKeyDown={handleWheelKeyDown}
            />
            {biWheelFacts !== undefined && (
              <BiWheelSelectionPanel
                facts={biWheelFacts}
                ringLabels={[t.natalLabel, t.transitRingLabel]}
                locale={locale}
                onClear={clearIsolation}
              />
            )}
            {selectionKey !== undefined && focusContext !== undefined && (
              <FocusInterpretation context={focusContext} locale={locale} resetKey={selectionKey} personId={personId} />
            )}

            {load.voidOfCourse !== undefined && (
              <p className="void-of-course-summary">
                <GlossaryText text={voidOfCourseSentence(load.voidOfCourse, t, locale)} />{' '}
                <span className="hint">
                  <GlossaryText text={t.vocBasis} />
                </span>
              </p>
            )}

            <SortableTable
              caption={t.contactsCaption}
              headingLevel={2}
              columns={contactTableColumns}
              rows={contactRows}
              memoizeRows
              getRowKey={(row) => `${row.bodyAKey}-${row.aspect}-${row.bodyBKey}`}
              downloadFilename={deriveExportFilename(person.displayName, 'transit-contacts', 'csv')}
            />
          </>
        )}
      </div>
    </main>
  );
}
