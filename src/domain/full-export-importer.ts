/**
 * Validates and stages a restore of a full export (#587) — this file is `full-export.ts`'s
 * read-side counterpart.
 *
 * Two steps, deliberately kept apart and both free of side effects: `validateFullExport` only
 * decides whether a file is a readable Astraya export at all, and `stageFullExportRestore` only
 * decides what writing it would mean, as a list of not-yet-committed op-log mutations. Neither
 * one writes anything — the caller (`PreferencesView.tsx`) shows the result and only calls
 * `store.mutate` once a person has looked at it and confirmed. That final call is made exactly
 * once, with every person's mutations flattened into one array: `store.mutate`'s batch commits
 * as a single IndexedDB transaction (`store/db.ts`'s `putRecords`), so a restore is atomic for
 * free — nothing here needs its own rollback logic, but the UI must keep it to one call.
 *
 * A prior attempt at this (#600) was reverted (#605) for two reasons this file is built to rule
 * out: it was never wired into any UI, and it checked the export's version against the wrong
 * constant. `FULL_EXPORT_VERSION` is imported directly from `full-export.ts` and compared
 * nowhere else in this file, so there is no second "supported version" constant that could
 * silently drift from it again.
 *
 * Deliberately never reads or restores `natalChart`/`harmonicCharts`/`chartError`/`calculation`
 * — `full-export.ts`'s own stated position is that the birth record is the source of truth and
 * a chart is always recomputable, so restoring a stale computed chart from the file would be
 * restoring exactly the thing this project refuses to treat as truth. Validation of a person's
 * birth record/places/custom points reuses `person.ts`'s own field readers — the same functions
 * that already validate this data coming off the op-log — rather than a second, looser check.
 *
 * A restore never clears a field the export did not itself carry: an export's absence of an
 * optional field (a calendar override, a zone override) is not evidence the user meant to clear
 * it, just data this export's version doesn't speak to. Guessing which is which is exactly the
 * kind of silent default `docs/domain/EXPORT_SCHEMA.md` already refuses for `parseCalculationSnapshot`
 * (#583); this file holds the same line.
 */
/**
 * @module full-export-importer
 * @purpose Validates an untrusted FullExport document and stages a restore as op-log mutations, without writing anything.
 * @conventions Strict, fail-closed validation reusing person.ts's own field readers rather than a second parallel validator; version checked only against the imported FULL_EXPORT_VERSION constant, never a locally declared one; staging gives only a person new to this device the default calculation profile for what their file lacks (#806), and otherwise only ever emits mutations for fields that actually differ from the current Person (never a blind overwrite, and never a clear for a field the export omits), matching person-form.ts's own diffing rule that an untouched field must not get a newer timestamp than it already has.
 * @exports Result, ImportError, RestoreItem, RestorePreview, NewPersonDefaults, validateFullExport, stageFullExportRestore
 */
import { isRulershipChoice, type RulershipChoice } from '../astrology/rulership.js';
import {
  FULL_EXPORT_FORMAT,
  FULL_EXPORT_VERSION,
  SUPPORTED_IMPORT_VERSIONS,
  type ExportedPerson,
  type FullExport,
} from './full-export.js';
import {
  readCalendar,
  readCivil,
  readCoordinates,
  readCalculationSettings,
  readCustomPoints,
  readFixedStars,
  readOffsetOverride,
  serializeCalculationSettings,
  serializeRulership,
  readRelocationPlaces,
  readText,
  readTimeAccuracy,
  type Person,
} from './person.js';
import type { ExtendedSettings } from '../chart/extended-settings.js';
import type { BirthMomentInput, Calendar } from '../time/types.js';
import type { Mutation } from '../store/oplog.js';
import { RESERVED_NAMES, type JsonValue } from '../store/ops.js';

/** The project's first reusable success/failure container — scoped here, not shared, since nothing else needs one yet. */
export type Result<T, E> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

export type ImportError =
  | { readonly kind: 'wrong-format'; readonly got: unknown }
  | {
      readonly kind: 'wrong-version';
      readonly got: unknown;
      readonly expected: typeof FULL_EXPORT_VERSION;
      readonly direction: 'older' | 'newer' | 'unrecognized';
    }
  | { readonly kind: 'malformed'; readonly path: string; readonly reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function malformed(path: string, reason: string): Result<never, ImportError> {
  return { ok: false, error: { kind: 'malformed', path, reason } };
}

function validateBirth(raw: unknown, path: string): Result<BirthMomentInput, ImportError> {
  if (!isRecord(raw)) return malformed(path, 'not an object');
  const civil = readCivil(raw.civil);
  if (civil === undefined) return malformed(`${path}.civil`, 'missing or invalid');
  const coordinates = readCoordinates(raw.coordinates);
  if (coordinates === undefined) return malformed(`${path}.coordinates`, 'missing or invalid');

  let calendar: Calendar | undefined;
  if (raw.calendar !== undefined) {
    calendar = readCalendar(raw.calendar);
    if (calendar === undefined) return malformed(`${path}.calendar`, 'not a recognised calendar');
  }
  let zoneOverride: string | undefined;
  if (raw.zoneOverride !== undefined) {
    zoneOverride = readText(raw.zoneOverride);
    if (zoneOverride === undefined) return malformed(`${path}.zoneOverride`, 'not a string');
  }
  let offsetOverrideMinutes: number | undefined;
  if (raw.offsetOverrideMinutes !== undefined) {
    offsetOverrideMinutes = readOffsetOverride(raw.offsetOverrideMinutes);
    if (offsetOverrideMinutes === undefined) return malformed(`${path}.offsetOverrideMinutes`, 'out of range');
  }

  return {
    ok: true,
    value: {
      civil,
      coordinates,
      ...(calendar === undefined ? {} : { calendar }),
      ...(zoneOverride === undefined ? {} : { zoneOverride }),
      ...(offsetOverrideMinutes === undefined ? {} : { offsetOverrideMinutes }),
    },
  };
}

function validatePerson(raw: unknown, path: string): Result<ExportedPerson, ImportError> {
  if (!isRecord(raw)) return malformed(path, 'not an object');

  const id = readText(raw.id);
  if (id === undefined || id === '') return malformed(`${path}.id`, 'missing or empty');
  const displayName = readText(raw.displayName);
  if (displayName === undefined) return malformed(`${path}.displayName`, 'missing or not a string');
  const placeLabel = readText(raw.placeLabel);
  if (placeLabel === undefined) return malformed(`${path}.placeLabel`, 'missing or not a string');
  const notes = readText(raw.notes);
  if (notes === undefined) return malformed(`${path}.notes`, 'missing or not a string');
  const timeAccuracy = readTimeAccuracy(raw.timeAccuracy);
  if (timeAccuracy === undefined) return malformed(`${path}.timeAccuracy`, 'missing or not a recognised value');
  const missingRaw = raw.missing;
  if (!Array.isArray(missingRaw) || !missingRaw.every((entry): entry is string => typeof entry === 'string')) {
    return malformed(`${path}.missing`, 'not an array of strings');
  }
  const missing: readonly string[] = missingRaw;

  let birth: BirthMomentInput | undefined;
  if (raw.birth !== undefined) {
    const result = validateBirth(raw.birth, `${path}.birth`);
    if (!result.ok) return result;
    birth = result.value;
  }

  let relocationPlaces: ExportedPerson['relocationPlaces'];
  if (raw.relocationPlaces !== undefined) {
    const places = readRelocationPlaces(raw.relocationPlaces);
    if (places === undefined) return malformed(`${path}.relocationPlaces`, 'malformed');
    relocationPlaces = places;
  }

  let customPoints: ExportedPerson['customPoints'];
  if (raw.customPoints !== undefined) {
    const points = readCustomPoints(raw.customPoints);
    if (points === undefined) return malformed(`${path}.customPoints`, 'malformed');
    customPoints = points;
  }

  let fixedStars: ExportedPerson['fixedStars'];
  if (raw.fixedStars !== undefined) {
    const stars = readFixedStars(raw.fixedStars);
    if (stars === undefined) return malformed(`${path}.fixedStars`, 'malformed');
    fixedStars = stars;
  }

  let calculationSettings: ExtendedSettings | undefined;
  if (raw.calculationSettings !== undefined) {
    const read = readCalculationSettings({ settings: raw.calculationSettings });
    if (read?.kind !== 'settings') return malformed(`${path}.calculationSettings`, 'not readable by this version');
    calculationSettings = read.settings;
  }

  let rulership: ExportedPerson['rulership'];
  if (raw.rulership !== undefined) {
    if (!isRulershipChoice(raw.rulership)) {
      return malformed(`${path}.rulership`, 'not a recognised rulership choice');
    }
    rulership = raw.rulership;
  }

  return {
    ok: true,
    value: {
      id,
      displayName,
      placeLabel,
      timeAccuracy,
      notes,
      ...(birth === undefined ? {} : { birth }),
      ...(relocationPlaces === undefined ? {} : { relocationPlaces }),
      ...(customPoints === undefined ? {} : { customPoints }),
      ...(fixedStars === undefined ? {} : { fixedStars }),
      ...(calculationSettings === undefined ? {} : { calculationSettings }),
      ...(rulership === undefined ? {} : { rulership }),
      missing,
    },
  };
}

function validatePreferences(raw: unknown, path: string): Result<FullExport['preferences'], ImportError> {
  if (!isRecord(raw)) return malformed(path, 'not an object');
  const { settings, rulership, symbolClass } = raw;
  if (!isRecord(settings)) return malformed(`${path}.settings`, 'not an object');
  if (rulership !== 'modern' && rulership !== 'traditional' && rulership !== 'both') {
    return malformed(`${path}.rulership`, 'not a recognised rulership choice');
  }
  if (typeof symbolClass !== 'string') return malformed(`${path}.symbolClass`, 'not a string');
  return {
    ok: true,
    // Not deeply validated, matching this project's own JSON Schema's loose treatment of
    // ExtendedSettings — restore never reads it; it only needs to round-trip for display.
    value: { settings: settings as unknown as ExtendedSettings, rulership, symbolClass },
  };
}

/**
 * Checks `format` and `version` first, then every person's birth record, places and custom
 * points. Deliberately does not validate `natalChart`/`harmonicCharts`/`chartError`/
 * `calculation` — see the module doc for why; the returned `FullExport` simply omits them.
 */
export function validateFullExport(value: unknown): Result<FullExport, ImportError> {
  if (!isRecord(value)) return malformed('', 'not an object');
  if (value.format !== FULL_EXPORT_FORMAT) {
    return { ok: false, error: { kind: 'wrong-format', got: value.format } };
  }
  const got = value.version;
  if (typeof got !== 'number' || !SUPPORTED_IMPORT_VERSIONS.includes(got)) {
    const direction =
      typeof got === 'number' && Number.isInteger(got)
        ? got < FULL_EXPORT_VERSION
          ? 'older'
          : 'newer'
        : 'unrecognized';
    return { ok: false, error: { kind: 'wrong-version', got, expected: FULL_EXPORT_VERSION, direction } };
  }
  const exportedAt = readText(value.exportedAt);
  if (exportedAt === undefined) return malformed('exportedAt', 'missing or not a string');
  if (!isRecord(value.app) || typeof value.app.version !== 'string') {
    return malformed('app.version', 'missing or not a string');
  }
  const preferences = validatePreferences(value.preferences, 'preferences');
  if (!preferences.ok) return preferences;
  if (!Array.isArray(value.people)) return malformed('people', 'not an array');

  // A v2 person has no settings of their own: they take the file's preferences, which is what their
  // charts in that file were computed with (#806). Strictly decoded, so an unreadable bag fails the import.
  let fileSettings: ExtendedSettings | undefined;
  if (got < 3) {
    const read = readCalculationSettings({ settings: preferences.value.settings }, false);
    if (read?.kind !== 'settings') {
      return malformed(
        'preferences.settings',
        'has a value this version cannot read (invalid objectPolicies, flag or orb)',
      );
    }
    fileSettings = read.settings;
  }

  const people: ExportedPerson[] = [];
  const seenIds = new Set<string>();
  for (let index = 0; index < value.people.length; index += 1) {
    const path = `people[${String(index)}]`;
    const validated = validatePerson(value.people[index], path);
    if (!validated.ok) return validated;
    // Likewise a v2 or v3 person has no rulership of their own: their charts in that file were computed with the file's.
    const withSettings: ExportedPerson =
      fileSettings !== undefined && validated.value.calculationSettings === undefined
        ? { ...validated.value, calculationSettings: fileSettings }
        : validated.value;
    const result: { readonly ok: true; readonly value: ExportedPerson } = {
      ok: true,
      value:
        got < 4 && withSettings.rulership === undefined
          ? { ...withSettings, rulership: preferences.value.rulership }
          : withSettings,
    };
    // Two entries sharing an id are not two people — `store.mutate` would fold both sets of
    // field writes into one op-log entity by HLC, silently discarding whichever is "losing"
    // field-by-field, while this preview would have counted them as two. Rejected atomically,
    // like `person.ts`'s own list readers reject one bad entry invalidating a whole register.
    if (seenIds.has(result.value.id))
      return malformed(`${path}.id`, `duplicate id within this export: ${result.value.id}`);
    // A reserved register name can never be a legitimate person id (`domain/id.ts` never
    // generates one) — rejected by name here, with a path pointing at the exact person,
    // rather than only surfacing as a generic `store.mutate` failure for the whole batch.
    if (RESERVED_NAMES.includes(result.value.id)) {
      return malformed(`${path}.id`, `reserved name, cannot be a person id: ${result.value.id}`);
    }
    seenIds.add(result.value.id);
    people.push(result.value);
  }

  return {
    ok: true,
    value: {
      format: FULL_EXPORT_FORMAT,
      version: FULL_EXPORT_VERSION,
      exportedAt,
      app: { version: value.app.version },
      preferences: preferences.value,
      note: readText(value.note) ?? '',
      people,
    },
  };
}

export interface RestoreItem {
  readonly id: string;
  readonly displayName: string;
  /**
   * `deletedLocally` is distinct from `new`/`updated`: this device has already tombstoned this
   * person (`store.state.deleted.people`), so even though `mutations` carries real field
   * updates, applying them will not make the person visible again — `deleted` is its own
   * register, resolved last-write-wins independently of every other field (`fold.ts`), and a
   * restore never writes it. Surfaced as its own status so the preview never claims a visible
   * "new" person that will not actually appear.
   */
  readonly status: 'new' | 'updated' | 'unchanged' | 'deletedLocally';
  readonly mutations: readonly Mutation[];
}

/** The device default calculation profile a newly created person is given (#806). */
export interface NewPersonDefaults {
  readonly settings: ExtendedSettings;
  readonly rulership: RulershipChoice;
}

export interface RestorePreview {
  readonly items: readonly RestoreItem[];
  readonly newCount: number;
  readonly updatedCount: number;
  readonly unchangedCount: number;
  readonly deletedLocallyCount: number;
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function serializedPlaces(places: ExportedPerson['relocationPlaces']): JsonValue {
  return (places ?? []).map((place) => ({
    id: place.id,
    label: place.label,
    latitude: place.latitude,
    longitude: place.longitude,
  }));
}

function serializedCustomPoints(points: ExportedPerson['customPoints']): JsonValue {
  return (points ?? []).map((point) => ({
    id: point.id,
    name: point.name,
    formula: point.formula,
    ...(point.enabled === false ? { enabled: false } : {}),
  }));
}

function serializedFixedStars(stars: ExportedPerson['fixedStars']): JsonValue {
  return (stars ?? []).map((star) => ({
    id: star.id,
    name: star.name,
    designation: star.designation,
    equinox: star.equinox,
    sourceSha256: star.sourceSha256,
  }));
}

/**
 * One mutation per field that actually differs from `existing` (`undefined` for a person this
 * device has never seen). Mirrors `person-form.ts`'s `draftToMutations`: an untouched field
 * keeps whatever timestamp it already had, and the birth moment is written as whole registers
 * (civil, coordinates), never a hybrid of an old and a new one.
 */
function restoreMutations(entityId: string, exported: ExportedPerson, existing: Person | undefined): Mutation[] {
  const mutations: Mutation[] = [];
  const write = (field: string, value: JsonValue): void => {
    mutations.push({ entity: 'person', entityId, field, value });
  };

  if (existing?.displayName !== exported.displayName) write('displayName', exported.displayName);
  if (existing?.placeLabel !== exported.placeLabel) write('placeLabel', exported.placeLabel);
  if (existing?.notes !== exported.notes) write('notes', exported.notes);
  if (existing?.timeAccuracy !== exported.timeAccuracy) write('timeAccuracy', exported.timeAccuracy);

  const birth = exported.birth;
  if (birth !== undefined && !same(existing?.moment, birth)) {
    write('civil', { ...birth.civil });
    write('coordinates', { ...birth.coordinates });
    if (birth.calendar !== undefined && birth.calendar !== existing?.moment?.calendar) {
      write('calendar', birth.calendar);
    }
    if (birth.zoneOverride !== undefined && birth.zoneOverride !== existing?.moment?.zoneOverride) {
      write('zoneOverride', birth.zoneOverride);
    }
    if (
      birth.offsetOverrideMinutes !== undefined &&
      birth.offsetOverrideMinutes !== existing?.moment?.offsetOverrideMinutes
    ) {
      write('offsetOverrideMinutes', birth.offsetOverrideMinutes);
    }
  }

  if (exported.relocationPlaces !== undefined && !same(existing?.relocationPlaces, exported.relocationPlaces)) {
    write('relocationPlaces', serializedPlaces(exported.relocationPlaces));
  }
  if (exported.customPoints !== undefined && !same(existing?.customPoints, exported.customPoints)) {
    write('customPoints', serializedCustomPoints(exported.customPoints));
  }
  if (exported.fixedStars !== undefined && !same(existing?.fixedStars, exported.fixedStars)) {
    write('fixedStars', serializedFixedStars(exported.fixedStars));
  }

  if (
    exported.calculationSettings !== undefined &&
    (existing?.calculationSettingsUnreadable === true ||
      !same(existing?.calculationSettings, exported.calculationSettings))
  ) {
    write('calculationSettings', serializeCalculationSettings(exported.calculationSettings));
  }

  if (
    exported.rulership !== undefined &&
    (existing?.calculationSettingsUnreadable === true || existing?.rulership !== exported.rulership)
  ) {
    write('rulership', serializeRulership(exported.rulership));
  }

  return mutations;
}

/**
 * Classifies every exported person against this device's current people and builds the exact
 * mutations a restore would write — without writing any of them. Pure and synchronous: nothing
 * here is async, since it never touches the ephemeris or storage.
 *
 * `deletedPeople` (`store.state.deleted.people`) is checked separately from `existingPeople`
 * (`store.state.people`): a person tombstoned on this device is absent from the latter, so
 * without this a restore would misclassify them as `new` and the preview would promise a
 * person who, after `confirmRestore`'s `store.mutate`, stays invisible — `deleted` is its own
 * last-write-wins register, untouched by `restoreMutations`, so writing every other field does
 * not undo a deletion. This never un-deletes on its own; it only tells the truth about what
 * confirming will (and will not) do.
 */
export function stageFullExportRestore(
  // Only the people are staged, so only they are required: an AAF import (#591) has people and nothing else.
  archive: Pick<FullExport, 'people'>,
  existingPeople: ReadonlyMap<string, Person>,
  deletedPeople: ReadonlyMap<string, Person> = new Map(),
  newPersonDefaults?: NewPersonDefaults,
): RestorePreview {
  let newCount = 0;
  let updatedCount = 0;
  let unchangedCount = 0;
  let deletedLocallyCount = 0;
  const items = archive.people.map((exported): RestoreItem => {
    const existing = existingPeople.get(exported.id);
    const deleted = existing === undefined ? deletedPeople.get(exported.id) : undefined;
    // A person this device has never seen receives a copy of the default calculation profile for whatever their
    // file does not carry (an AAF record, or a JSON person whose settings were unreadable at export, #806). A
    // person already here, or tombstoned here, is never given defaults: a restore must not change their charts.
    const incoming: ExportedPerson =
      existing === undefined && deleted === undefined && newPersonDefaults !== undefined
        ? {
            ...exported,
            calculationSettings: exported.calculationSettings ?? newPersonDefaults.settings,
            rulership: exported.rulership ?? newPersonDefaults.rulership,
          }
        : exported;
    const mutations = restoreMutations(exported.id, incoming, existing ?? deleted);
    const status =
      deleted !== undefined
        ? 'deletedLocally'
        : existing === undefined
          ? 'new'
          : mutations.length === 0
            ? 'unchanged'
            : 'updated';
    if (status === 'new') newCount += 1;
    else if (status === 'updated') updatedCount += 1;
    else if (status === 'deletedLocally') deletedLocallyCount += 1;
    else unchangedCount += 1;
    return { id: exported.id, displayName: exported.displayName, status, mutations };
  });
  return { items, newCount, updatedCount, unchangedCount, deletedLocallyCount };
}
