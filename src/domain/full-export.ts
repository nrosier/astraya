/**
 * Everything a user can export, in one file (#export): every person on this device with the birth
 * record exactly as stored, and for each person who has a complete birth moment the natal chart's
 * data tables, so the file is useful on its own and not only as a backup.
 *
 * Deliberately a plain JSON document rather than a database dump: it states its `format` and
 * `version`, holds nothing the app cannot show on screen, and is the same whether the person is on
 * this device only or synced. People restorable from "Deleted" are not included — they are the
 * user's own decision to remove — and nothing from another user is, since a store holds only its
 * owner's data. Charts are computed here with the app's default calculation settings, and the file
 * says so, because a chart is derived and the person's birth record is what a restore would need.
 *
 * Pure apart from the ephemeris calls: the caller supplies the people, the provider and the moment
 * (`now`), so the document is reproducible and testable against the real engine.
 */
/**
 * @module full-export
 * @purpose Builds the whole-device export: every person's birth record plus (where possible) their computed natal chart tables, as one JSON document or a people CSV.
 * @conventions Plain JSON with its own `format`/`version` fields rather than a database dump; charts are computed with app default settings (Placidus, tropical, standard orbs) and the document states so; one person's chart failure is caught and reported per-person rather than failing the whole export; deleted people are excluded.
 * @exports buildFullExport, peopleToCsv, fullExportFilename, peopleCsvFilename, FullExport, ExportedPerson, ExportedChart, FULL_EXPORT_FORMAT, FULL_EXPORT_VERSION
 */
import type { RulershipChoice } from '../astrology/rulership.js';
import { housesAreDefined, computeChartData, type ChartData } from './chart-compute.js';
import {
  aspectRows,
  angleRows,
  derivedPointRows,
  dignityRows,
  dispositorRows,
  houseCuspRows,
  positionRows,
} from './chart-tables.js';
import type { Person } from './person.js';
import type { EphemerisProvider } from '../ephemeris/types.js';

export const FULL_EXPORT_FORMAT = 'astraya-export';
export const FULL_EXPORT_VERSION = 1;

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
  readonly natalChart?: ExportedChart;
  /** Why no chart is included for a person who has a birth moment, if its calculation failed. */
  readonly chartError?: string;
}

export interface FullExport {
  readonly format: typeof FULL_EXPORT_FORMAT;
  readonly version: typeof FULL_EXPORT_VERSION;
  readonly exportedAt: string;
  readonly app: { readonly version: string };
  /** Per-device choices that change how charts are shown, so a reader of the file knows what was in force. */
  readonly preferences: { readonly rulership: RulershipChoice; readonly symbolClass: string };
  readonly note: string;
  readonly people: readonly ExportedPerson[];
}

const NOTE =
  'Charts are calculated with the application defaults (Placidus houses, tropical zodiac, standard orbs). ' +
  'The birth record is the source of truth; a chart can always be recalculated from it.';

function chartExport(data: ChartData, rulership: RulershipChoice, withHouses: boolean): ExportedChart {
  return {
    sect: data.sect,
    positions: positionRows(data, {}, withHouses),
    ...(withHouses
      ? {
          houses: {
            cusps: houseCuspRows(data),
            angles: angleRows(data, {}),
            derivedPoints: derivedPointRows(data, {}),
          },
        }
      : {}),
    aspects: aspectRows(data),
    dignities: dignityRows(data, {}, rulership),
    dispositors: dispositorRows(data, {}, rulership),
  };
}

export async function buildFullExport(params: {
  readonly people: readonly Person[];
  readonly provider: EphemerisProvider;
  readonly appVersion: string;
  readonly rulership: RulershipChoice;
  readonly symbolClass: string;
  readonly now: Date;
}): Promise<FullExport> {
  const people: ExportedPerson[] = [];
  for (const person of params.people) {
    const base = {
      id: person.id,
      displayName: person.displayName,
      placeLabel: person.placeLabel,
      timeAccuracy: person.timeAccuracy,
      notes: person.notes,
      ...(person.moment === undefined ? {} : { birth: person.moment }),
      missing: person.missing,
    };
    if (person.moment === undefined) {
      people.push(base);
      continue;
    }
    try {
      const data = await computeChartData(person.moment, params.provider, { rulership: params.rulership });
      const withHouses = person.timeAccuracy !== 'unknown' && housesAreDefined(data.houses);
      people.push({ ...base, natalChart: chartExport(data, params.rulership, withHouses) });
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
    preferences: { rulership: params.rulership, symbolClass: params.symbolClass },
    note: NOTE,
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
