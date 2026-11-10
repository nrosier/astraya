/**
 * Secondary, tertiary and minor progressions for one person (#398), computed as of a chosen
 * date — the technique and, for secondary, the MC method are picked in-screen rather than in
 * the URL, same reasoning `HarmonicView.tsx`'s divisional-chart picker already uses.
 *
 * Progressed houses need a known birth time, same gate `ProfectionsView.tsx` and `ChartView.tsx`
 * already use for anything built on the natal Ascendant.
 *
 * The MC method actually used is always shown, never implied — `progressions.ts`'s own doc
 * comment is explicit that the three methods produce visibly different Ascendants, so silently
 * picking one would misrepresent what the chart means.
 */
/**
 * @module ProgressionsView
 * @purpose Secondary, tertiary and minor progressions screen for one person, as of a chosen date, with progressed positions and progressed-to-natal contacts.
 * @conventions Gated for unknown birth time the same way ProfectionsView.tsx/ChartView.tsx are; uses ProgressionsView.messages.ts for en/nl text via useMessages().
 * @exports ProgressionsView; positionRows, positionColumns, contactColumns, mcMethodLabel (reused by pdf-export-plan.ts)
 */
import { GlossaryText } from './GlossaryText.js';
import { personHref } from './route.js';
import { DateAnimationBar } from './DateAnimationBar.js';
import { useAsOfDate } from './use-as-of-date.js';
import { LifeEventPicker } from './LifeEventPicker.js';
import { Select } from './primitives/Select.js';
import { signDegreeColumn } from './position-column.js';
import { Tooltip } from './primitives/Tooltip.js';
import { useEffect, useMemo, useState } from 'react';
import { bodyById } from '../astrology/bodies.js';
import type { ProgressedMcMethod } from '../astrology/progressions.js';
import { aspectDisplayName, bodyDisplayName } from './astro-names.messages.js';
import { housesAreDefined } from '../domain/chart-compute.js';
import { crossAspectRows, degreeParts, type AspectRow, type DegreeParts } from '../domain/chart-tables.js';
import { deriveExportFilename } from '../domain/export-filename.js';
import { houseOf } from '../astrology/emphasis.js';
import { computeMinorProgression, type MinorProgressionData } from '../domain/minor-progression.js';
import { computeSecondaryProgression, type SecondaryProgressionData } from '../domain/secondary-progression.js';
import { useEphemerisProvider } from './EphemerisProviderContext.js';
import { formatFixed, formatOrb } from './format.js';
import { useLocale } from './locale.js';
import { useMessages } from './messages.js';
import { PersonNotFound } from './PersonNotFound.js';
import { progressionsViewMessages } from './ProgressionsView.messages.js';
import { SortableTable, csvExportTable, useCsvExports } from './SortableTable.js';
import { useStoreState } from './store-context.js';
import type { TableColumn } from './table-sort.js';
import type { BodyPosition, HousePositions } from '../ephemeris/types.js';
import type { Locale } from '../interpretation/schema.js';
import { StatusMessage } from './primitives/StatusMessage.js';
import { useStableMoment } from './use-stable-moment.js';
import { PageHeader } from './PageHeader.js';
import { useCalculationBasisLine, withBasisItems } from './calculation-basis.js';
import { progressionBasisItems } from './timing-basis.js';
import { timingBasisMessages } from './timing-basis.messages.js';
import { DEFAULT_EXTENDED_SETTINGS } from '../chart/extended-settings.js';
import { DEFAULT_RULERSHIP_CHOICE } from '../astrology/rulership.js';

type Technique = 'secondary' | 'tertiary' | 'minor';

type ProgressionData = SecondaryProgressionData | MinorProgressionData;

type Load =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly data: ProgressionData }
  | { readonly kind: 'error'; readonly message: string };

interface PositionRow extends DegreeParts {
  /** Ecliptic longitude, for the merged Position column's sort. */
  readonly longitude: number;
  readonly bodyKey: string;
  readonly bodyName: string;
  readonly house?: number;
}

/** Positions plus, matching `chart-tables.ts`'s `positionRows`'s own `includeAngles` convention, the Ascendant and Midheaven. */
export function positionRows(positions: readonly BodyPosition[], houses: HousePositions): readonly PositionRow[] {
  const housesUsable = housesAreDefined(houses);
  const bodyRows = positions.map((position) => {
    const body = bodyById(position.body);
    return {
      bodyKey: body?.key ?? String(position.body),
      bodyName: body?.name ?? String(position.body),
      longitude: position.longitude,
      ...degreeParts(position.longitude),
      ...(housesUsable ? { house: houseOf(position.longitude, houses.cusps) } : {}),
    };
  });
  if (!housesUsable) return bodyRows;
  return [
    ...bodyRows,
    { bodyKey: 'asc', bodyName: 'Ascendant', longitude: houses.ascendant, ...degreeParts(houses.ascendant) },
    { bodyKey: 'mc', bodyName: 'Midheaven', longitude: houses.midheaven, ...degreeParts(houses.midheaven) },
  ];
}

export function positionColumns(
  t: typeof progressionsViewMessages.en,
  locale: Locale,
): readonly TableColumn<PositionRow>[] {
  return [
    {
      key: 'bodyName',
      label: t.bodyLabel,
      valueOf: (row) => row.bodyName,
      render: (row) => bodyDisplayName(row.bodyKey, locale),
    },
    signDegreeColumn<PositionRow>(t.positionLabel, locale),
    {
      key: 'house',
      label: t.houseLabel,
      align: 'end',
      valueOf: (row) => row.house ?? '',
      render: (row) => (row.house === undefined ? '—' : String(row.house)),
    },
  ];
}

export function contactColumns(
  t: typeof progressionsViewMessages.en,
  locale: Locale,
): readonly TableColumn<AspectRow>[] {
  return [
    {
      key: 'bodyAName',
      label: t.bodyALabel,
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
      label: t.bodyBLabel,
      valueOf: (row) => row.bodyBName,
      render: (row) => bodyDisplayName(row.bodyBKey, locale),
    },
    { key: 'orb', label: t.orbLabel, valueOf: (row) => row.orb, render: (row) => formatOrb(row.orb) },
    {
      key: 'applying',
      label: t.applyingLabel,
      valueOf: (row) => row.applying,
      render: (row) => (row.applying ? t.applying : t.separating),
    },
  ];
}

export function mcMethodLabel(t: typeof progressionsViewMessages.en, method: ProgressedMcMethod): string {
  switch (method) {
    case 'quotidian':
      return t.quotidianMethod;
    case 'naibod':
      return t.naibodMethod;
    case 'solarArc':
      return t.solarArcMethod;
  }
}

export function ProgressionsView({ personId }: { personId: string }): React.JSX.Element {
  const state = useStoreState();
  const person = state.people.get(personId);
  const personMoment = useStableMoment(person?.moment);
  const t = useMessages(progressionsViewMessages);
  const [locale] = useLocale();
  const [technique, setTechnique] = useState<Technique>('secondary');
  const [mcMethod, setMcMethod] = useState<ProgressedMcMethod>('naibod');
  const [asOf, setAsOf] = useAsOfDate();
  const timingT = useMessages(timingBasisMessages);
  // Progressions are calculated with the engine defaults plus the technique and MC method chosen below.
  const baseBasis = useCalculationBasisLine(DEFAULT_EXTENDED_SETTINGS, DEFAULT_RULERSHIP_CHOICE, undefined, {
    rulers: false,
  });
  const basisLine = withBasisItems(baseBasis, ...progressionBasisItems(technique, mcMethod, timingT));
  const { provider } = useEphemerisProvider();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });

  const targetDate = useMemo(() => {
    const [year, month, day] = asOf.split('-').map(Number);
    return year !== undefined && month !== undefined && day !== undefined ? { year, month, day } : undefined;
  }, [asOf]);

  useEffect(() => {
    if (personMoment === undefined || provider === undefined || targetDate === undefined) return undefined;
    const moment = personMoment;
    const effect = { cancelled: false };
    setLoad({ kind: 'loading' });

    void (async () => {
      try {
        // Noon, not midnight — same reasoning `ProfectionsView.tsx`'s own "As of" input gives.
        const targetJd = await provider.julianDayFromUtc(targetDate.year, targetDate.month, targetDate.day, 12, 0, 0);
        const data: ProgressionData =
          technique === 'secondary'
            ? await computeSecondaryProgression(moment, targetJd, provider, { mcMethod })
            : await computeMinorProgression(technique, moment, targetJd, provider);
        if (!effect.cancelled) setLoad({ kind: 'ready', data });
      } catch (error) {
        if (!effect.cancelled)
          setLoad({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
      }
    })();

    return () => {
      effect.cancelled = true;
    };
  }, [personMoment, provider, targetDate, technique, mcMethod]);

  const positions = load.kind === 'ready' ? positionRows(load.data.positions, load.data.houses) : undefined;
  const contacts = load.kind === 'ready' ? crossAspectRows(load.data.contacts) : undefined;
  // The positions table's CSV, then the contacts table's (only when it has rows, as the screen renders it), in
  // source order, offered in the page header (#887).
  useCsvExports(
    person?.moment !== undefined && person.timeAccuracy !== 'unknown' && positions !== undefined
      ? [
          csvExportTable(
            'progressions',
            t.positionsCaption,
            deriveExportFilename(person.displayName, 'progressions', 'csv'),
            positionColumns(t, locale),
            positions,
          ),
          ...(contacts !== undefined && contacts.length > 0
            ? [
                csvExportTable(
                  'progression-contacts',
                  t.contactsCaption,
                  deriveExportFilename(person.displayName, 'progression-contacts', 'csv'),
                  contactColumns(t, locale),
                  contacts,
                ),
              ]
            : []),
        ]
      : undefined,
  );

  if (person === undefined) {
    return <PersonNotFound />;
  }

  if (person.moment === undefined) {
    return (
      <main className="shell">
        <PageHeader headingLevel={2} title={t.progressionsFallback} titleTerm="progression" />
        <p>
          <GlossaryText text={t.notCompleteProgressions(person.displayName || t.thisPerson)} />{' '}
          <a href={personHref(personId)}>{t.personPageLink}</a>.
        </p>
      </main>
    );
  }

  if (person.timeAccuracy === 'unknown') {
    return (
      <main className="shell">
        <PageHeader headingLevel={2} title={t.progressionsFallback} titleTerm="progression" />
        <p>
          <GlossaryText text={t.needsKnownTime(person.displayName || t.thisPerson)} />
        </p>
      </main>
    );
  }

  const usedMcMethod = load.kind === 'ready' && 'mcMethod' in load.data ? load.data.mcMethod : undefined;

  return (
    <main className="shell">
      <PageHeader
        headingLevel={2}
        title={person.displayName ? t.heading(person.displayName) : t.progressionsFallback}
        titleTerm="progression"
        titleAside={
          <Tooltip text={t.hint} label={t.hintInfoLabel} className="primitive-tooltip-icon">
            ?
          </Tooltip>
        }
        basis={basisLine}
        basisEditHref={null}
      >
        {/* The life-event picker and Export sit in the heading row, to the right (#1235, owner review 2026-11-07); the date, stepping and Now are in the bar below (#1400). */}
        <LifeEventPicker
          events={person.lifeEvents}
          onPick={(event) => {
            setAsOf(event.date);
          }}
        />
      </PageHeader>
      <DateAnimationBar date={asOf} onDateChange={setAsOf} />
      <div className="timing-toolbar">
        <Select
          label={t.techniqueLabel}
          value={technique}
          options={[
            { value: 'secondary', label: t.secondaryTechnique },
            { value: 'tertiary', label: t.tertiaryTechnique },
            { value: 'minor', label: t.minorTechnique },
          ]}
          onChange={(value) => {
            setTechnique(value as Technique);
          }}
        />
        {technique === 'secondary' && (
          <Select
            label={t.mcMethodLabel}
            value={mcMethod}
            options={[
              { value: 'quotidian', label: t.quotidianMethod },
              { value: 'naibod', label: t.naibodMethod },
              { value: 'solarArc', label: t.solarArcMethod },
            ]}
            onChange={(value) => {
              setMcMethod(value as ProgressedMcMethod);
            }}
          />
        )}
      </div>

      {/* The result region: busy while the progressions (re)calculate, as the Astrocartography map is. */}
      <div aria-busy={load.kind === 'loading'}>
        {load.kind === 'loading' && <StatusMessage kind="loading">{t.calculating}</StatusMessage>}

        {load.kind === 'error' && <StatusMessage kind="error">{t.error(load.message)}</StatusMessage>}

        {load.kind === 'ready' && (
          <>
            <p className="hint">
              {t.ageLine(
                `${formatFixed(load.data.ageInYears, 2)}${load.data.ageInYears < 0 ? ` ${t.beforeBirth}` : ''}`,
              )}
            </p>
            {usedMcMethod !== undefined && <p className="hint">{t.mcMethodLine(mcMethodLabel(t, usedMcMethod))}</p>}

            {/* The shared timing layout (#1234): contacts left, positions right, one column below 52rem. */}
            <div className="timing-layout">
              <div className="timing-layout-main">
                {contacts !== undefined && contacts.length > 0 && (
                  <section className="timing-card">
                    <SortableTable
                      caption={t.contactsCaption}
                      headingLevel={2}
                      columns={contactColumns(t, locale)}
                      rows={contacts}
                      getRowKey={(row) => `${row.bodyAKey}-${row.aspect}-${row.bodyBKey}`}
                      downloadFilename={deriveExportFilename(person.displayName, 'progression-contacts', 'csv')}
                    />
                  </section>
                )}
                {contacts?.length === 0 && <p className="hint">{t.noContacts}</p>}
              </div>
              <div className="timing-layout-side">
                {positions !== undefined && (
                  <section className="timing-card">
                    <SortableTable
                      caption={t.positionsCaption}
                      headingLevel={2}
                      columns={positionColumns(t, locale)}
                      rows={positions}
                      getRowKey={(row) => row.bodyKey}
                      downloadFilename={deriveExportFilename(person.displayName, 'progressions', 'csv')}
                    />
                  </section>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
