/**
 * Solar arc directions for one person (#398), computed as of a chosen date.
 *
 * A separate screen from `ProgressionsView.tsx` rather than a fourth technique option there:
 * `DirectedContact`'s own `exactJd` (when a contact becomes exact) has no equivalent in a plain
 * progressed chart, and `DirectedPosition` carries no speed/retrograde data the way a real
 * ephemeris position does — different enough table shapes to warrant their own screen, the same
 * reasoning that already split `TransitView.tsx` from `PeriodicTransitView.tsx`.
 *
 * Needs a known birth time, same gate every angle-dependent screen in this app already uses.
 */
/**
 * @module SolarArcView
 * @purpose Solar arc directions screen for one person, as of a chosen date, with directed positions and directed-to-natal contacts (including exact-date timing).
 * @conventions Gated for unknown birth time like other angle-dependent screens; uses SolarArcView.messages.ts for en/nl text via useMessages().
 * @exports SolarArcView; positionRows, positionColumns, contactColumns, toContactRow, formatExactDate, ContactRow (reused by pdf-export-plan.ts)
 */
import { DateAnimationBar } from './DateAnimationBar.js';
import { useAsOfDate } from './use-as-of-date.js';
import { LifeEventPicker } from './LifeEventPicker.js';
import { signDegreeColumn } from './position-column.js';
import { Tooltip } from './primitives/Tooltip.js';
import { GlossaryText } from './GlossaryText.js';
import { personHref } from './route.js';
import { useEffect, useMemo, useState } from 'react';
import { bodyById } from '../astrology/bodies.js';
import type { DirectedPosition } from '../astrology/solar-arc-directions.js';
import { aspectDisplayName, bodyDisplayName } from './astro-names.messages.js';
import { housesAreDefined } from '../domain/chart-compute.js';
import { degreeParts, type AspectRow, type DegreeParts } from '../domain/chart-tables.js';
import { deriveExportFilename } from '../domain/export-filename.js';
import { houseOf } from '../astrology/emphasis.js';
import {
  computeSolarArcDirections,
  type DirectedContact,
  type SolarArcDirectionsData,
} from '../domain/solar-arc-directions.js';
import { useEphemerisProvider } from './EphemerisProviderContext.js';
import { civilFromJulianDay } from '../time/julian.js';
import { formatFixed, formatOrb } from './format.js';
import { useLocale } from './locale.js';
import { useMessages } from './messages.js';
import { PersonNotFound } from './PersonNotFound.js';
import { SortableTable, csvExportTable, useCsvExports } from './SortableTable.js';
import { solarArcViewMessages } from './SolarArcView.messages.js';
import { useStoreState } from './store-context.js';
import type { TableColumn } from './table-sort.js';
import type { HousePositions, JulianDayUT } from '../ephemeris/types.js';
import type { Locale } from '../interpretation/schema.js';
import { StatusMessage } from './primitives/StatusMessage.js';
import { useStableMoment } from './use-stable-moment.js';
import { PageHeader } from './PageHeader.js';
import { useCalculationBasisLine, withBasisItems } from './calculation-basis.js';
import { solarArcBasisItems } from './timing-basis.js';
import { computeSolarArcDeclinations, type SolarArcDeclinationData } from '../domain/solar-arc-declination.js';
import { Select } from './primitives/Select.js';
import { timingBasisMessages } from './timing-basis.messages.js';
import { toChartCalculationOptions } from '../chart/extended-settings.js';
import { usePersonCalculationSettings } from './person-calculation-settings.js';
import { UnreadableSettingsNotice } from './UnreadableSettingsNotice.js';

type Load =
  | { readonly kind: 'loading' }
  | {
      readonly kind: 'ready';
      readonly data: SolarArcDirectionsData;
      /** The same date directed in declination (#1407). */
      readonly declination: SolarArcDeclinationData;
    }
  | { readonly kind: 'error'; readonly message: string };

interface PositionRow extends DegreeParts {
  /** Ecliptic longitude, for the merged Position column's sort. */
  readonly longitude: number;
  readonly bodyKey: string;
  readonly bodyName: string;
  readonly house?: number;
}

/** Same `includeAngles` convention as `chart-tables.ts`'s `positionRows` — Ascendant/Midheaven appended, not a separate table. */
export function positionRows(positions: readonly DirectedPosition[], houses: HousePositions): readonly PositionRow[] {
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
  t: typeof solarArcViewMessages.en,
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

export interface ContactRow extends AspectRow {
  readonly exactJd: JulianDayUT | undefined;
}

export function toContactRow(contact: DirectedContact): ContactRow {
  const bodyA = bodyById(contact.bodyA);
  const bodyB = bodyById(contact.bodyB);
  return {
    bodyAKey: bodyA?.key ?? String(contact.bodyA),
    bodyAName: bodyA?.name ?? String(contact.bodyA),
    bodyBKey: bodyB?.key ?? String(contact.bodyB),
    bodyBName: bodyB?.name ?? String(contact.bodyB),
    aspect: contact.aspect.name,
    aspectKey: contact.aspect.key,
    angle: contact.aspect.angle,
    separation: contact.separation,
    orb: contact.orb,
    applying: contact.applying,
    exactJd: contact.exactJd,
  };
}

export function formatExactDate(jd: JulianDayUT | undefined, t: typeof solarArcViewMessages.en): string {
  if (jd === undefined) return t.exactOnUnknown;
  const civil = civilFromJulianDay(jd);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${String(civil.year)}-${pad(civil.month)}-${pad(civil.day)}`;
}

export function contactColumns(t: typeof solarArcViewMessages.en, locale: Locale): readonly TableColumn<ContactRow>[] {
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
    {
      key: 'exactJd',
      label: t.exactOnLabel,
      valueOf: (row) => row.exactJd ?? '',
      render: (row) => formatExactDate(row.exactJd, t),
    },
  ];
}

/** What the screen directs (#1407; owner decision 2026-11-14): longitude, as before, or declination. */
type DirectedIn = 'longitude' | 'declination';
const DIRECTED_IN: readonly DirectedIn[] = ['longitude', 'declination'];

interface DeclinationRow {
  readonly bodyKey: string;
  readonly bodyName: string;
  readonly natal: number;
  readonly directed: number;
}

interface DeclinationContactRow {
  readonly directedKey: string;
  readonly directedName: string;
  readonly natalKey: string;
  readonly natalName: string;
  readonly kind: 'parallel' | 'contraparallel';
  readonly orb: number;
}

/** A declination as degrees and minutes north or south of the equator, e.g. 23°26′ N. */
export function formatDeclination(value: number, t: typeof solarArcViewMessages.en): string {
  return `${formatOrb(Math.abs(value))} ${value < 0 ? t.south : t.north}`;
}

export function declinationRows(data: SolarArcDeclinationData): readonly DeclinationRow[] {
  return data.declinations.map((d) => ({
    bodyKey: bodyById(d.body)?.key ?? String(d.body),
    bodyName: bodyById(d.body)?.name ?? String(d.body),
    natal: d.natal,
    directed: d.directed,
  }));
}

export function declinationContactRows(data: SolarArcDeclinationData): readonly DeclinationContactRow[] {
  return data.contacts.map((c) => ({
    directedKey: bodyById(c.directed)?.key ?? String(c.directed),
    directedName: bodyById(c.directed)?.name ?? String(c.directed),
    natalKey: bodyById(c.natal)?.key ?? String(c.natal),
    natalName: bodyById(c.natal)?.name ?? String(c.natal),
    kind: c.kind,
    orb: c.orb,
  }));
}

function declinationColumns(t: typeof solarArcViewMessages.en, locale: Locale): readonly TableColumn<DeclinationRow>[] {
  return [
    {
      key: 'bodyName',
      label: t.bodyLabel,
      valueOf: (row) => row.bodyName,
      render: (row) => bodyDisplayName(row.bodyKey, locale),
    },
    {
      key: 'natal',
      label: t.natalDeclinationLabel,
      align: 'end',
      valueOf: (row) => row.natal,
      render: (row) => formatDeclination(row.natal, t),
    },
    {
      key: 'directed',
      label: t.directedDeclinationLabel,
      align: 'end',
      valueOf: (row) => row.directed,
      render: (row) => formatDeclination(row.directed, t),
    },
  ];
}

function declinationContactColumns(
  t: typeof solarArcViewMessages.en,
  locale: Locale,
): readonly TableColumn<DeclinationContactRow>[] {
  return [
    {
      key: 'directedName',
      label: t.directedBodyLabel,
      valueOf: (row) => row.directedName,
      render: (row) => bodyDisplayName(row.directedKey, locale),
    },
    { key: 'kind', label: t.contactKindLabel, valueOf: (row) => row.kind, render: (row) => t.contactKinds[row.kind] },
    {
      key: 'natalName',
      label: t.natalBodyLabel,
      valueOf: (row) => row.natalName,
      render: (row) => bodyDisplayName(row.natalKey, locale),
    },
    { key: 'orb', label: t.orbLabel, align: 'end', valueOf: (row) => row.orb, render: (row) => formatOrb(row.orb) },
  ];
}

export function SolarArcView({ personId }: { personId: string }): React.JSX.Element {
  const state = useStoreState();
  const person = state.people.get(personId);
  const personMoment = useStableMoment(person?.moment);
  const t = useMessages(solarArcViewMessages);
  const [locale] = useLocale();
  const [asOf, setAsOf] = useAsOfDate();
  const timingT = useMessages(timingBasisMessages);
  // Solar arc is calculated with the person's own settings (#1492) and its one key, the Sun's progressed arc.
  const {
    settings: personSettings,
    unreadable: settingsUnreadable,
    rulership,
  } = usePersonCalculationSettings(personId);
  const baseBasis = useCalculationBasisLine(personSettings, rulership, undefined, { rulers: false });
  const [directedIn, setDirectedIn] = useState<DirectedIn>('longitude');
  const basisLine = withBasisItems(baseBasis, ...solarArcBasisItems(timingT, directedIn));
  const { provider } = useEphemerisProvider();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });

  const targetDate = useMemo(() => {
    const [year, month, day] = asOf.split('-').map(Number);
    return year !== undefined && month !== undefined && day !== undefined ? { year, month, day } : undefined;
  }, [asOf]);

  useEffect(() => {
    // An unreadable register means no chart-dependent content at all, never one from placeholder settings (#806).
    if (personMoment === undefined || provider === undefined || targetDate === undefined || settingsUnreadable)
      return undefined;
    const moment = personMoment;
    const effect = { cancelled: false };
    setLoad({ kind: 'loading' });

    void (async () => {
      try {
        const targetJd = await provider.julianDayFromUtc(targetDate.year, targetDate.month, targetDate.day, 12, 0, 0);
        const calculationOptions = toChartCalculationOptions(personSettings);
        const [data, declination] = await Promise.all([
          computeSolarArcDirections(moment, targetJd, provider, calculationOptions),
          computeSolarArcDeclinations(moment, targetJd, provider, calculationOptions),
        ]);
        if (!effect.cancelled) setLoad({ kind: 'ready', data, declination });
      } catch (error) {
        if (!effect.cancelled)
          setLoad({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
      }
    })();

    return () => {
      effect.cancelled = true;
    };
  }, [personMoment, provider, targetDate, personSettings, settingsUnreadable]);

  // The positions and contacts tables' CSVs, offered in the page header (#887). Positions first, as the screen lists them.
  const positions = load.kind === 'ready' ? positionRows(load.data.directedPositions, load.data.houses) : undefined;
  const contacts = load.kind === 'ready' ? load.data.contacts.map(toContactRow) : undefined;
  const declinations = load.kind === 'ready' ? declinationRows(load.declination) : undefined;
  const declinationContacts = load.kind === 'ready' ? declinationContactRows(load.declination) : undefined;
  const byDeclination = directedIn === 'declination';
  useCsvExports(
    person === undefined
      ? undefined
      : byDeclination
        ? [
            ...(declinations === undefined
              ? []
              : [
                  csvExportTable(
                    'declinations',
                    t.declinationPositionsCaption,
                    deriveExportFilename(person.displayName, 'solar-arc-declination', 'csv'),
                    declinationColumns(t, locale),
                    declinations,
                  ),
                ]),
            ...(declinationContacts === undefined || declinationContacts.length === 0
              ? []
              : [
                  csvExportTable(
                    'declination-contacts',
                    t.declinationContactsCaption,
                    deriveExportFilename(person.displayName, 'solar-arc-declination-contacts', 'csv'),
                    declinationContactColumns(t, locale),
                    declinationContacts,
                  ),
                ]),
          ]
        : [
            ...(positions === undefined
              ? []
              : [
                  csvExportTable(
                    'positions',
                    t.positionsCaption,
                    deriveExportFilename(person.displayName, 'solar-arc', 'csv'),
                    positionColumns(t, locale),
                    positions,
                  ),
                ]),
            ...(contacts === undefined || contacts.length === 0
              ? []
              : [
                  csvExportTable(
                    'contacts',
                    t.contactsCaption,
                    deriveExportFilename(person.displayName, 'solar-arc-contacts', 'csv'),
                    contactColumns(t, locale),
                    contacts,
                  ),
                ]),
          ],
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
        <PageHeader headingLevel={2} title={t.solarArcFallback} titleTerm="solarArc" />
        <p>
          <GlossaryText text={t.notCompleteSolarArc(person.displayName || t.thisPerson)} />{' '}
          <a href={personHref(personId)}>{t.personPageLink}</a>.
        </p>
      </main>
    );
  }

  if (person.timeAccuracy === 'unknown') {
    return (
      <main className="shell">
        <PageHeader headingLevel={2} title={t.solarArcFallback} titleTerm="solarArc" />
        <p>
          <GlossaryText text={t.needsKnownTime(person.displayName || t.thisPerson)} />
        </p>
      </main>
    );
  }

  return (
    <main className="shell">
      <PageHeader
        headingLevel={2}
        title={person.displayName ? t.heading(person.displayName) : t.solarArcFallback}
        titleTerm="solarArc"
        titleAside={
          <Tooltip text={t.hint} label={t.hintInfoLabel} className="primitive-tooltip-icon">
            ?
          </Tooltip>
        }
        basis={basisLine}
        basisEditHref={null}
      >
        {/* The life-event picker sits in the header; the date, stepping and Now are in the bar below (#1400); Export stays in the page header (#887). */}
        <LifeEventPicker
          events={person.lifeEvents}
          onPick={(event) => {
            setAsOf(event.date);
          }}
        />
      </PageHeader>
      {/* A date selector with its steps only, as on Progressions: solar arc does not animate (#1400, #1442). */}
      <DateAnimationBar date={asOf} onDateChange={setAsOf} mode="date" />
      <div className="progressions-controls">
        <Select
          label={t.directedInLabel}
          value={directedIn}
          options={DIRECTED_IN.map((value) => ({ value, label: t.directedIn[value] }))}
          onChange={(value) => {
            const next = DIRECTED_IN.find((candidate) => candidate === value);
            if (next !== undefined) setDirectedIn(next);
          }}
        />
      </div>

      {/* The result region: busy while the directions (re)calculate, as the Astrocartography map is. */}
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
            {byDeclination ? (
              <p className="hint">{t.declinationArcLine(formatFixed(load.declination.arc, 2))}</p>
            ) : (
              <>
                <p className="hint">{t.arcLine(formatFixed(load.data.arc, 2))}</p>
                <p className="hint">{t.declinationNote}</p>
              </>
            )}

            {byDeclination && (
              <div className="timing-layout">
                <div className="timing-layout-main">
                  {declinationContacts !== undefined && declinationContacts.length > 0 && (
                    <section className="timing-card">
                      <SortableTable
                        caption={t.declinationContactsCaption}
                        headingLevel={2}
                        columns={declinationContactColumns(t, locale)}
                        rows={declinationContacts}
                        getRowKey={(row) => `${row.directedKey}-${row.kind}-${row.natalKey}`}
                        downloadFilename={deriveExportFilename(
                          person.displayName,
                          'solar-arc-declination-contacts',
                          'csv',
                        )}
                      />
                    </section>
                  )}
                  {declinationContacts?.length === 0 && <p className="hint">{t.noDeclinationContacts}</p>}
                </div>
                <div className="timing-layout-side">
                  {declinations !== undefined && (
                    <section className="timing-card">
                      <SortableTable
                        caption={t.declinationPositionsCaption}
                        headingLevel={2}
                        columns={declinationColumns(t, locale)}
                        rows={declinations}
                        getRowKey={(row) => row.bodyKey}
                        downloadFilename={deriveExportFilename(person.displayName, 'solar-arc-declination', 'csv')}
                      />
                    </section>
                  )}
                </div>
              </div>
            )}

            {/* The shared timing layout (#1234): contacts left, positions right, one column below 52rem. */}
            {!byDeclination && (
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
                        downloadFilename={deriveExportFilename(person.displayName, 'solar-arc-contacts', 'csv')}
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
                        downloadFilename={deriveExportFilename(person.displayName, 'solar-arc', 'csv')}
                      />
                    </section>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
