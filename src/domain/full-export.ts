/**
 * Everything a user can export, in one file (#export): every person on this device with the birth
 * record exactly as stored, and for each person who has a complete birth moment the natal chart's
 * data tables, so the file is useful on its own and not only as a backup.
 *
 * Deliberately a plain JSON document rather than a database dump: it states its `format` and
 * `version`, holds nothing the app cannot show on screen, and is the same whether the person is on
 * this device only or synced. People restorable from "Deleted" are not included — they are the
 * user's own decision to remove — and nothing from another user is, since a store holds only its
 * owner's data. Charts are computed here with this device's own effective calculation settings
 * (#541) — not a fixed "application defaults" claim, which would silently go stale the moment a
 * user customizes anything — and the file states exactly which settings those were.
 *
 * Pure apart from the ephemeris calls: the caller supplies the people, the provider, the settings
 * and the moment (`now`), so the document is reproducible and testable against the real engine.
 *
 * `FULL_EXPORT_VERSION` and the compatibility policy that governs it are documented in
 * `docs/domain/EXPORT_SCHEMA.md` (#561) — the published, versioned schema an external tool can rely on,
 * alongside a hand-authored `docs/schema/astraya-export.schema.json` reference. Bumped from 1 to
 * 2 here to catch up with two shape changes earlier this session (antiscia/declinations, then
 * midpointTree/allMidpoints) that landed without a version bump — a lapse against the very
 * policy this issue adds, corrected rather than carried forward silently. Birth records can also be
 * exchanged as AAF (#591, `aaf.ts` and `aaf-people.ts`), implemented from the AAF'97 specification;
 * see `docs/domain/AAF_INTERCHANGE.md` for the field mapping and what is not claimed.
 *
 * `ExportedPerson.relocationPlaces`/`customPoints` (#587) were added so a restore
 * (`full-export-importer.ts`) is not lossy: both are read internally for chart computation
 * already, but were never carried back out, so a round trip through this file used to silently
 * drop a person's saved places and formula points. Both additive — no version bump.
 *
 * #585 collapsed `ExtendedSettings`' eleven scattered point-visibility/`aspectsTo*` fields into
 * one `objectPolicies` field — no version bump here, deliberately: `full-export-importer.ts`'s
 * `validatePreferences` only checks `preferences.settings` is a record and never reads a
 * specific field from it (restore only needs it to round-trip for display, same as the
 * `relocationPlaces`/`customPoints` note above), so a restore of an old-shaped export is
 * unaffected either way. `calculation-snapshot.ts`'s own `CURRENT_SNAPSHOT_VERSION` is the one
 * that actually deep-parses `ExtendedSettings` and is the one that bumped for this.
 */
/**
 * @module full-export
 * @purpose Builds the whole-device export: every person's birth record plus (where possible) their computed natal and named Varga chart tables, as one JSON document or a people CSV.
 * @conventions Plain JSON with its own `format`/`version` fields rather than a database dump; charts are computed with the caller-supplied `ExtendedSettings`/`rulership` (#541), carried verbatim into `preferences` so the document states exactly what was in force; each named Varga chart includes its radix-to-result longitude provenance; one person's chart failure is caught and reported per-person rather than failing the whole export; deleted people are excluded; `FULL_EXPORT_VERSION`'s own compatibility policy lives in docs/domain/EXPORT_SCHEMA.md, not in this file; `full-export-importer.ts` is this file's restore counterpart.
 * @exports buildFullExport, peopleToCsv, fullExportFilename, peopleCsvFilename, peopleAafFilename, FullExport, ExportedPerson, ExportedChart, ExportedHarmonicChart, FULL_EXPORT_FORMAT, FULL_EXPORT_VERSION
 */
import { VARGA_PRESETS } from '../astrology/harmonics.js';
import type { RulershipChoice } from '../astrology/rulership.js';
import {
  DEFAULT_EXTENDED_SETTINGS,
  toChartCalculationOptions,
  toPointVisibilityOptions,
  type ExtendedSettings,
} from '../chart/extended-settings.js';
import { housesAreDefined, computeChartData, type ChartData } from './chart-compute.js';
import { buildCalculationArtifact, type CalculationArtifact } from './calculation-artifact.js';
import { buildCalculationSnapshot, type CalculationSnapshot } from './calculation-snapshot.js';
import { computeHarmonic, harmonicPositionProvenance } from './harmonic.js';
import {
  allMidpointsRows,
  antisciaRows,
  aspectRows,
  angleRows,
  declinationContactRows,
  derivedPointRows,
  dignityRows,
  dispositorRows,
  houseCuspRows,
  midpointTreeRows,
  positionRows,
  type PointVisibilityOptions,
} from './chart-tables.js';
import type { CustomPointDefinition, Person, RelocationPlace } from './person.js';
import type { EphemerisProvider } from '../ephemeris/types.js';

export const FULL_EXPORT_FORMAT = 'astraya-export';
export const FULL_EXPORT_VERSION = 2;

export interface ExportedChart {
  readonly sect: ChartData['sect'];
  readonly positions: ReturnType<typeof positionRows>;
  /** Absent when the birth time is unknown or the house system has no solution at this latitude. */
  readonly houses?: {
    readonly cusps: ReturnType<typeof houseCuspRows>;
    readonly angles: ReturnType<typeof angleRows>;
    readonly derivedPoints: ReturnType<typeof derivedPointRows>;
  };
  readonly aspects: ReturnType<typeof aspectRows>;
  readonly dignities: ReturnType<typeof dignityRows>;
  readonly dispositors: ReturnType<typeof dispositorRows>;
  /** Antiscion/contra-antiscion contacts (#556) — empty when none fall within the default orb. */
  readonly antiscia: ReturnType<typeof antisciaRows>;
  /** Parallel/contraparallel declination contacts (#556) — empty when `ChartData.declinations` is unavailable or none fall within the default orb. */
  readonly declinations: ReturnType<typeof declinationContactRows>;
  /** 90°-dial midpoint-tree hits (#556) — only computed when `dial90Visible` is set, otherwise empty, matching the on-screen table's own gate. */
  readonly midpointTree: ReturnType<typeof midpointTreeRows>;
  /** Every body-pair midpoint, direct and indirect (#555) — only computed when `midpointsVisible` is set, otherwise empty, matching the on-screen table's own gate. */
  readonly allMidpoints: ReturnType<typeof allMidpointsRows>;
}

/** A named, reproducible harmonic/Varga derivation from this person’s radix chart (#557). */
export interface ExportedHarmonicChart {
  readonly key: string;
  readonly label: string;
  readonly harmonic: number;
  /** The preset's own convention note (#725), English like `label`: for D10 it says the odd/even sign restart is not applied. */
  readonly convention: string;
  readonly source: {
    readonly kind: 'radix';
    readonly transform: 'longitude-times-n-mod-360';
    readonly houses: 'whole-sign-from-harmonic-ascendant';
  };
  /** Per-body source and result longitudes, so a reader can verify the derivation. */
  readonly radixPositions: ReturnType<typeof harmonicPositionProvenance>;
  readonly chart: ExportedChart;
}

export interface ExportedPerson {
  readonly id: string;
  readonly displayName: string;
  readonly placeLabel: string;
  readonly timeAccuracy: Person['timeAccuracy'];
  readonly notes: string;
  /** The birth record as stored: what a restore needs, and what a chart is computed from. */
  readonly birth?: NonNullable<Person['moment']>;
  /** Required fields the stored record lacks. */
  readonly missing: readonly string[];
  /** Named alternate places for a relocated chart (#559); absent if none are saved. Needed for a restore to be complete — see #587. */
  readonly relocationPlaces?: readonly RelocationPlace[];
  /** Custom formula points (#566); absent if none are saved. Needed for a restore to be complete — see #587. */
  readonly customPoints?: readonly CustomPointDefinition[];
  readonly natalChart?: ExportedChart;
  /** Named Varga charts derived from the radix, absent when no usable houses are available. */
  readonly harmonicCharts?: readonly ExportedHarmonicChart[];
  /** Why no chart is included for a person who has a birth moment, if its calculation failed. */
  readonly chartError?: string;
  /**
   * The natal calculation's artifact (#582): its complete inputs, execution provenance and
   * SHA-256 fingerprints — what a later reader recomputes against to verify `natalChart` still
   * comes out the same. Absent where Web Crypto is unavailable (a non-secure context).
   */
  readonly calculation?: CalculationArtifact;
}

export interface FullExport {
  readonly format: typeof FULL_EXPORT_FORMAT;
  readonly version: typeof FULL_EXPORT_VERSION;
  readonly exportedAt: string;
  readonly app: { readonly version: string };
  /**
   * The device's own effective calculation settings at export time, so a reader of the file
   * knows exactly what was in force (#541) — `settings`/`rulership` are what charts below were
   * actually computed with, not a fixed claim about "application defaults" that may no longer
   * be true once a user has customized anything.
   */
  readonly preferences: {
    readonly settings: ExtendedSettings;
    readonly rulership: RulershipChoice;
    readonly symbolClass: string;
  };
  readonly note: string;
  readonly people: readonly ExportedPerson[];
}

/**
 * The disclosure for the station window and the motion score (#724), present only while either is on, so an export made
 * with both off reads exactly as it always did. The station window is an Astraya convention, not cited, and the mean
 * speeds and the scoring come from Avelar & Ribeiro (2010).
 */
function stationDisclosureOf(settings: ExtendedSettings): string {
  const parts: string[] = [];
  if (settings.stationWindow !== undefined) {
    parts.push(
      `the station window is an Astraya convention, not a cited rule: a planet is stationary when its speed, ignoring sign, is at most k × its mean daily speed, with k = ${String(settings.stationWindow.k)} (mean speeds: Avelar & Ribeiro, On the Heavenly Spheres (2010), pp. 59–60; a station: p. 61)`,
    );
  }
  if (settings.motionScore === true) {
    parts.push(
      'the motion score uses the direct, retrograde, fast and slow points of Avelar & Ribeiro (2010), p. 197, with the Sun and Moon scored for speed only',
    );
  }
  return parts.length === 0 ? '' : ` Also in force: ${parts.join('; ')}.`;
}

function noteFor(settings: ExtendedSettings, rulership: RulershipChoice): string {
  const customized = JSON.stringify(settings) !== JSON.stringify(DEFAULT_EXTENDED_SETTINGS);
  const basis = customized
    ? "this device's own current calculation settings (see preferences, below)"
    : 'the application defaults (Placidus houses, tropical zodiac, standard orbs)';
  return (
    `Charts are calculated with ${basis}, and the planetary rulers set to ${rulership}. ` +
    'The birth record is the source of truth; a chart can always be recalculated from it.' +
    stationDisclosureOf(settings)
  );
}

function chartExport(
  data: ChartData,
  rulership: RulershipChoice,
  visibility: PointVisibilityOptions,
  withHouses: boolean,
): ExportedChart {
  return {
    sect: data.sect,
    positions: positionRows(data, visibility, withHouses),
    ...(withHouses
      ? {
          houses: {
            cusps: houseCuspRows(data),
            angles: angleRows(data, visibility),
            derivedPoints: derivedPointRows(data, visibility),
          },
        }
      : {}),
    aspects: aspectRows(data, visibility),
    // Always traditional (#545) — dignityRows no longer takes a rulership/display-choice parameter.
    dignities: dignityRows(data, visibility),
    dispositors: dispositorRows(data, visibility, rulership),
    antiscia: antisciaRows(data),
    declinations: declinationContactRows(data),
    midpointTree: visibility.dial90Visible === true ? midpointTreeRows(data, visibility.midpointTreeOrb) : [],
    allMidpoints: visibility.midpointsVisible === true ? allMidpointsRows(data) : [],
  };
}

async function harmonicExports(
  moment: Person['moment'],
  provider: EphemerisProvider,
  options: ReturnType<typeof toChartCalculationOptions>,
  rulership: RulershipChoice,
  visibility: PointVisibilityOptions,
  customPoints: Person['customPoints'],
): Promise<readonly ExportedHarmonicChart[]> {
  if (moment === undefined) return [];
  return Promise.all(
    VARGA_PRESETS.map(async (preset) => {
      const data = await computeHarmonic(moment, preset.n, provider, {
        ...options,
        rulership,
        ...(customPoints === undefined ? {} : { customPoints }),
      });
      return {
        key: preset.key,
        label: preset.label,
        harmonic: preset.n,
        convention: preset.description,
        source: {
          kind: 'radix',
          transform: 'longitude-times-n-mod-360',
          houses: 'whole-sign-from-harmonic-ascendant',
        },
        radixPositions: harmonicPositionProvenance(data),
        chart: chartExport(data.harmonic, rulership, visibility, housesAreDefined(data.harmonic.houses)),
      };
    }),
  );
}

/** The natal artifact, or `undefined` where it cannot be built (no Web Crypto) — never a reason to fail the export. */
async function natalArtifact(
  snapshot: CalculationSnapshot,
  moment: NonNullable<Person['moment']>,
  data: ChartData,
  params: { readonly provider: EphemerisProvider; readonly appVersion: string },
): Promise<CalculationArtifact | undefined> {
  try {
    return await buildCalculationArtifact(snapshot, moment, data, {
      astrayaVersion: params.appVersion,
      swephVersion: await params.provider.version(),
    });
  } catch {
    return undefined;
  }
}

export async function buildFullExport(params: {
  readonly people: readonly Person[];
  readonly provider: EphemerisProvider;
  readonly appVersion: string;
  readonly settings: ExtendedSettings;
  readonly rulership: RulershipChoice;
  readonly symbolClass: string;
  readonly now: Date;
}): Promise<FullExport> {
  const calcOptions = { ...toChartCalculationOptions(params.settings), rulership: params.rulership };
  const visibility = toPointVisibilityOptions(params.settings);
  const people: ExportedPerson[] = [];
  for (const person of params.people) {
    const base = {
      id: person.id,
      displayName: person.displayName,
      placeLabel: person.placeLabel,
      timeAccuracy: person.timeAccuracy,
      notes: person.notes,
      ...(person.moment === undefined ? {} : { birth: person.moment }),
      ...(person.relocationPlaces === undefined ? {} : { relocationPlaces: person.relocationPlaces }),
      ...(person.customPoints === undefined ? {} : { customPoints: person.customPoints }),
      missing: person.missing,
    };
    if (person.moment === undefined) {
      people.push(base);
      continue;
    }
    try {
      const data = await computeChartData(person.moment, params.provider, {
        ...calcOptions,
        ...(person.customPoints === undefined ? {} : { customPoints: person.customPoints }),
      });
      const withHouses = person.timeAccuracy !== 'unknown' && housesAreDefined(data.houses);
      const harmonicCharts = withHouses
        ? await harmonicExports(
            person.moment,
            params.provider,
            calcOptions,
            params.rulership,
            visibility,
            person.customPoints,
          )
        : undefined;
      const calculation = await natalArtifact(
        buildCalculationSnapshot(params.settings, params.rulership, person.customPoints ?? []),
        person.moment,
        data,
        params,
      );
      people.push({
        ...base,
        natalChart: chartExport(data, params.rulership, visibility, withHouses),
        ...(harmonicCharts === undefined ? {} : { harmonicCharts }),
        ...(calculation === undefined ? {} : { calculation }),
      });
    } catch (error) {
      // One person's chart failing must not cost the user everyone else's data.
      people.push({ ...base, chartError: error instanceof Error ? error.message : String(error) });
    }
  }
  return {
    format: FULL_EXPORT_FORMAT,
    version: FULL_EXPORT_VERSION,
    exportedAt: params.now.toISOString(),
    app: { version: params.appVersion },
    preferences: { settings: params.settings, rulership: params.rulership, symbolClass: params.symbolClass },
    note: noteFor(params.settings, params.rulership),
    people,
  };
}

function csvField(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** The people on this device as a spreadsheet: one row each, the birth record in plain columns. */
export function peopleToCsv(people: readonly Person[]): string {
  const header = [
    'name',
    'date',
    'time',
    'time accuracy',
    'place',
    'latitude',
    'longitude',
    'utc offset override (minutes)',
    'timezone override',
    'calendar',
    'notes',
  ];
  const pad = (n: number): string => String(n).padStart(2, '0');
  const rows = people.map((person) => {
    const moment = person.moment;
    const civil = moment?.civil;
    return [
      person.displayName,
      civil === undefined ? '' : `${String(civil.year).padStart(4, '0')}-${pad(civil.month)}-${pad(civil.day)}`,
      civil === undefined || person.timeAccuracy === 'unknown'
        ? ''
        : `${pad(civil.hour)}:${pad(civil.minute)}:${pad(civil.second)}`,
      person.timeAccuracy,
      person.placeLabel,
      moment === undefined ? '' : String(moment.coordinates.latitude),
      moment === undefined ? '' : String(moment.coordinates.longitude),
      moment?.offsetOverrideMinutes === undefined ? '' : String(moment.offsetOverrideMinutes),
      moment?.zoneOverride ?? '',
      moment?.calendar ?? '',
      person.notes,
    ].map(csvField);
  });
  return [header.map(csvField), ...rows].map((row) => row.join(',')).join('\n') + '\n';
}

const dateStamp = (now: Date): string => now.toISOString().slice(0, 10);

export function fullExportFilename(now: Date): string {
  return `astraya-export-${dateStamp(now)}.json`;
}

export function peopleCsvFilename(now: Date): string {
  return `astraya-people-${dateStamp(now)}.csv`;
}

/** The people list as AAF'97 birth records (#591). */
export function peopleAafFilename(now: Date): string {
  return `astraya-people-${dateStamp(now)}.aaf`;
}
