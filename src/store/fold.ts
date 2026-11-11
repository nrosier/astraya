/**
 * Fold the operation log into people and charts.
 *
 * This is where a list of mutations becomes something a screen can show. It is a pure
 * function of the records, with no IndexedDB and no clock, because it is the piece whose
 * determinism everything else depends on: two devices holding the same records must
 * materialise byte-identical state, or sync is a slow corruption rather than a feature.
 *
 * **Last write wins, per field, by timestamp.** Because timestamps are totally ordered
 * and include the writing device, there are no ties to break and the winner does not
 * depend on arrival order. Full CRDT machinery is deliberately not used: Actual Budget
 * needs it because budgets take concurrent numeric edits to shared cells, whereas here
 * one person creates a record once and rarely edits it. A per-field register keyed by
 * HLC converges just as deterministically and is a fraction of the code. That is a
 * considered simplification, not an unfinished one — do not "upgrade" it without a case
 * that actually needs it.
 *
 * **Deleting is a field, not a removal.** A device that was offline during a delete
 * would resurrect the record on its next sync if deleting meant dropping rows. So a
 * delete sets `deleted` to true and the fold hides it, which makes undo just another
 * operation, and makes an edit racing a delete resolve the way a reader would expect:
 * editing a name is not an undelete, because it writes a different register (#96).
 *
 * **Registers are the snapshot.** Startup must not be O(all history), so the register
 * map is serialisable and can be persisted and resumed from. The log stays the source of
 * truth and a snapshot is only a cache — `applyRecords` on a fresh register map rebuilds
 * it exactly, which is the recovery path when a snapshot is ever wrong, and is tested as
 * such rather than assumed.
 */

/**
 * @module store/fold
 * @purpose Folds the append-only operation log into materialised people, charts, notes, saved queries, account preferences and the reader's own interpretation corrections — the pure, deterministic function every rendered screen's state depends on.
 * @conventions Last-write-wins per field by HLC timestamp, deliberately not a full CRDT, since one person typically creates a record once and rarely edits it concurrently; deleting sets a `deleted` field rather than removing the record, so undo is just another write; a `purged` field (once set, never unset) hides an entity entirely regardless of any other field's timestamp; registers are serialisable so they can be persisted as a snapshot and `resume`d from, with a full rebuild as the correctness fallback whenever a snapshot cannot be trusted.
 * @exports DELETED_FIELD, PURGED_FIELD, Register, Registers, EMPTY_REGISTERS, FoldSkips, Applied, applyRecords, State, materialise, fold, Snapshot, snapshotOf, Resumed, resume
 */
import { buildChart, type Chart } from '../domain/chart.js';
import { ACCOUNT_ENTITY, ACCOUNT_ENTITY_ID, foldAccount, type AccountRegisters } from './account.js';
import { buildPerson, type Person } from '../domain/person.js';
import { compareHlc, type Hlc } from './hlc.js';
import {
  BIRTH_NOTE_ENTITY,
  CONSULTATION_NOTE_ENTITY,
  foldBirthNote,
  foldConsultationNotes,
  LEGACY_NOTE_FIELD,
  type Note,
} from './notes.js';
import { decode, type JsonValue, type OpRecord } from './ops.js';
import {
  ANNOTATION_ENTITY,
  ANNOTATION_POINTER_FIELD,
  foldAnnotation,
  readAnnotationPointer,
  readErasedRevisionField,
} from './annotations.js';
import { foldPin, PIN_ENTITY, type Pin } from './pins.js';
import { CORRECTION_ENTITY, foldCorrection, type CorpusCorrection } from './corpus-corrections.js';
import { CHART_SEARCH_ENTITY, foldChartSearch, type SavedChartSearch } from './chart-searches.js';
import { foldSavedQuery, SAVED_QUERY_ENTITY, type SavedQuery } from './saved-queries.js';

/** The field that hides a record. A register like any other, so undo needs no new machinery. */
export const DELETED_FIELD = 'deleted';

/**
 * The field that marks an entity permanently erased (#308). Unlike `DELETED_FIELD`,
 * nothing ever writes this back to `false` — there is no undo for a purge — so a plain
 * per-field LWW register is enough: once any record sets it, no later write to any
 * *other* field can un-purge the entity, because doing so would require a write to
 * this same field, which no code path performs.
 */
export const PURGED_FIELD = 'purged';

/** One field's winning value and the timestamp that won it. */
export interface Register {
  readonly value: JsonValue;
  readonly hlc: Hlc;
}

/**
 * Registers by entity kind, then id, then field.
 *
 * Nested plain objects rather than nested maps so the whole thing serialises to JSON
 * with no conversion step, which is what makes it usable as a snapshot.
 */
export type Registers = Readonly<Record<string, Readonly<Record<string, Readonly<Record<string, Register>>>>>>;

export const EMPTY_REGISTERS: Registers = {};

/** Why a record contributed nothing, counted so it can be reported rather than guessed at. */
export interface FoldSkips {
  /** Written by a newer client. Held in the log, uninterpretable here. */
  readonly future: number;
  /** Malformed. Not stored by the log either, but a stale snapshot may carry one. */
  readonly corrupt: number;
  /** Well-formed, but for an entity kind this build does not know. */
  readonly unknownEntity: number;
  /** Overwritten by a later write to the same field. The ordinary case. */
  readonly superseded: number;
}

export interface Applied {
  readonly registers: Registers;
  readonly skips: FoldSkips;
}

/** Entity kinds this build can materialise. Others are kept in the log and counted here. */
const KNOWN_ENTITIES: readonly string[] = [
  'person',
  'chart',
  BIRTH_NOTE_ENTITY,
  CONSULTATION_NOTE_ENTITY,
  SAVED_QUERY_ENTITY,
  CHART_SEARCH_ENTITY,
  PIN_ENTITY,
  ANNOTATION_ENTITY,
  ACCOUNT_ENTITY,
  CORRECTION_ENTITY,
];

/**
 * Apply records to a register map.
 *
 * `known` is the entity-kind set this fold is willing to materialise. It defaults to this build's
 * set, and exists so a snapshot written by an older build (which knew fewer kinds) can be
 * reproduced exactly in tests. Records of other kinds are skipped and counted, not folded.
 *
 * Records may arrive in any order and may repeat: the comparison is against the stored
 * timestamp, not against arrival, so applying the same batch twice changes nothing and
 * applying a batch out of order gives the same result as applying it in order. Both are
 * relied on by sync and by resuming from a snapshot.
 */
export function applyRecords(
  registers: Registers,
  records: readonly unknown[],
  known: readonly string[] = KNOWN_ENTITIES,
): Applied {
  // Mutable working copies, copied lazily per entity so untouched branches keep their
  // existing objects and an unchanged snapshot stays cheap to write back.
  const next: Record<string, Record<string, Record<string, Register>>> = {};
  for (const [entity, byId] of Object.entries(registers)) {
    next[entity] = { ...byId };
  }
  let future = 0;
  let corrupt = 0;
  let unknownEntity = 0;
  let superseded = 0;

  for (const candidate of records) {
    const decoded = decode(candidate);
    if (decoded.kind === 'future') {
      future += 1;
      continue;
    }
    if (decoded.kind === 'corrupt') {
      corrupt += 1;
      continue;
    }
    const { entity, entityId, field, value } = decoded.body;
    if (!known.includes(entity)) {
      unknownEntity += 1;
      continue;
    }

    const byId = (next[entity] ??= {});
    const fields = byId[entityId];
    const existing = fields?.[field];
    if (existing !== undefined && compareHlc(existing.hlc, decoded.spine.hlc) >= 0) {
      // Includes the equal case, which is a record already applied. Keeping the held
      // value rather than overwriting with an identical one is what makes this
      // idempotent for a snapshot that is resumed from more than once.
      superseded += 1;
      continue;
    }
    if (existing !== undefined) superseded += 1;
    byId[entityId] = { ...fields, [field]: { value, hlc: decoded.spine.hlc } };
  }

  return { registers: next, skips: { future, corrupt, unknownEntity, superseded } };
}

function valuesOf(fields: Readonly<Record<string, Register>>): ReadonlyMap<string, unknown> {
  return new Map(Object.entries(fields).map(([field, register]) => [field, register.value]));
}

function isDeleted(fields: Readonly<Record<string, Register>>): boolean {
  return fields[DELETED_FIELD]?.value === true;
}

function isPurged(fields: Readonly<Record<string, Register>>): boolean {
  return fields[PURGED_FIELD]?.value === true;
}

export interface State {
  /** Live people, by id. */
  readonly people: ReadonlyMap<string, Person>;
  /** Live charts, by id. Excludes charts whose person is deleted or not yet known. */
  readonly charts: ReadonlyMap<string, Chart>;
  /**
   * Hidden by a tombstone, so "restore deleted" can offer them without a second pass.
   *
   * Materialised exactly like the live ones rather than reduced to bare ids: a restore list
   * that cannot name what it is offering to bring back is not a usable list, and the
   * registers still hold every field, so building them costs nothing extra.
   */
  readonly deleted: {
    readonly people: ReadonlyMap<string, Person>;
    readonly charts: ReadonlyMap<string, Chart>;
    /** Saved queries hidden by a tombstone, so the list can offer Undo and Erase (#1061). */
    readonly savedQueries: ReadonlyMap<string, SavedQuery>;
    /** Saved chart searches hidden by a tombstone, so the list can offer Undo and Erase (#1405). */
    readonly chartSearches: ReadonlyMap<string, SavedChartSearch>;
    /** Pins hidden by a tombstone, so the list can offer Undo (#1061). */
    readonly pins: ReadonlyMap<string, Pin>;
  };
  /** Charts naming a person this device does not hold. Retained, not lost — usually a partial sync. */
  readonly orphanCharts: readonly string[];
  /**
   * The Birth Record note of each person that has one, by person id. Its head text is also
   * `people.get(id).notes`. Forks are here and nowhere else.
   */
  readonly birthNotes: ReadonlyMap<string, Note>;
  /** Live Consultation notes of each person, by person id, oldest first. Deleted notes are absent. */
  readonly consultationNotes: ReadonlyMap<string, readonly Note[]>;
  /**
   * Live saved event-search queries, by id (#1061). Unreadable and incomplete ones are included, with their reason,
   * because hiding them would be silent loss. Map order is not part of the contract: sort before showing.
   */
  readonly savedQueries: ReadonlyMap<string, SavedQuery>;
  /**
   * Live saved chart searches, by id (#1405). Unreadable and incomplete ones are included, with their reason, because
   * hiding them would be silent loss. Map order is not part of the contract: sort before showing.
   */
  readonly chartSearches: ReadonlyMap<string, SavedChartSearch>;
  /** Live pinned event-search results, by derived id (#1061). Unreadable ones are included, with their reason. */
  readonly pins: ReadonlyMap<string, Pin>;
  /**
   * The annotation of each pin that has one, by pin id (#1061). Present whether or not the pin is currently unpinned,
   * so pinning again brings the text back; the UI shows it for live pins only. Forks are here and nowhere else.
   */
  readonly annotations: ReadonlyMap<string, Note>;
  /**
   * The annotation entity id of each pin that an erase has pointed at a fresh id (#1195), by pin id. A pin missing here
   * is annotated at its own id. A write to a pin's annotation must use `annotationEntities.get(pinId) ?? pinId`.
   */
  readonly annotationEntities: ReadonlyMap<string, string>;
  /**
   * Ids of annotation revisions the reader erased on purpose (#1195), ids only. A restore skips them so an older file
   * cannot bring an erased version back.
   */
  readonly erasedRevisions: ReadonlySet<string>;
  /**
   * Ids a purge marker has erased (#1194). They are in no list, but a restore must know them: writing their data back
   * would put erased text on disk again, where nothing strips it.
   */
  readonly erased: {
    readonly savedQueries: ReadonlySet<string>;
    readonly chartSearches: ReadonlySet<string>;
    readonly pins: ReadonlySet<string>;
    readonly annotations: ReadonlySet<string>;
  };
  /**
   * The account preferences registers (#1066, ADR 0004): only the `preferences` entity id, only the allowlisted
   * fields. `deleted` and `purged` never apply to this entity, so they are not consulted.
   */
  readonly account: AccountRegisters;
  /**
   * The reader's own live corrections to interpretation text (#1338), by entity id (`<locale>|<key>`). A reset
   * (tombstoned) or purged correction is absent.
   */
  readonly corrections: ReadonlyMap<string, CorpusCorrection>;
}

/**
 * Materialise state from registers.
 *
 * Deleting a person hides its charts **without writing tombstones for them.** Cascading
 * by writing operations would multiply every delete by the number of charts and, worse,
 * make undo lossy: restoring the person could not tell which charts were already deleted
 * on their own. Cascading at fold time keeps a delete one operation and makes undo exact.
 *
 * **Purged is checked before deleted, and hides the entity entirely (#308).** A purge has
 * no undo, so a purged entity must not appear even on the "restore deleted" list — and
 * because nothing ever un-sets `PURGED_FIELD`, this overrides every other field's value
 * for visibility regardless of that field's own HLC.
 */
export function materialise(registers: Registers): State {
  const { birthNotes, consultationNotes } = materialiseNotes(registers);

  const people = new Map<string, Person>();
  const deletedPeople = new Map<string, Person>();
  for (const [id, fields] of Object.entries(registers.person ?? {})) {
    if (isPurged(fields)) continue;
    // `notes` is derived from the Birth Record note's head (#919), so every reader of
    // `person.notes` sees the current text whether it was written as a revision or read from
    // the legacy register.
    const person: Person = { ...buildPerson(id, valuesOf(fields)), notes: birthNotes.get(id)?.content ?? '' };
    if (isDeleted(fields)) deletedPeople.set(id, person);
    else people.set(id, person);
  }

  const charts = new Map<string, Chart>();
  const deletedCharts = new Map<string, Chart>();
  const orphanCharts: string[] = [];
  for (const [id, fields] of Object.entries(registers.chart ?? {})) {
    if (isPurged(fields)) continue;
    const chart = buildChart(id, valuesOf(fields));
    if (isDeleted(fields)) {
      deletedCharts.set(id, chart);
      continue;
    }
    // A chart of a person we do not have is held back rather than dropped. It is not an
    // error: the person's operations may simply not have arrived yet.
    if (people.has(chart.personId)) charts.set(id, chart);
    else orphanCharts.push(id);
  }

  const savedQueries = new Map<string, SavedQuery>();
  const deletedSavedQueries = new Map<string, SavedQuery>();
  const erasedQueries = new Set<string>();
  const erasedPins = new Set<string>();
  const erasedAnnotations = new Set<string>();
  for (const [id, fields] of Object.entries(registers[SAVED_QUERY_ENTITY] ?? {})) {
    // Purged first, before incomplete, deleted or unreadable: a purge leaves only its marker, which would
    // otherwise fold as an incomplete query and appear in a list (ADR 0005 rule 10).
    if (isPurged(fields)) {
      erasedQueries.add(id);
      continue;
    }
    const query = foldSavedQuery(id, fields);
    if (query === undefined) continue;
    if (isDeleted(fields)) deletedSavedQueries.set(id, query);
    else savedQueries.set(id, query);
  }

  const chartSearches = new Map<string, SavedChartSearch>();
  const deletedChartSearches = new Map<string, SavedChartSearch>();
  const erasedChartSearches = new Set<string>();
  for (const [id, fields] of Object.entries(registers[CHART_SEARCH_ENTITY] ?? {})) {
    // Purged first, as for saved queries: a purge leaves only its marker, which would otherwise fold as incomplete.
    if (isPurged(fields)) {
      erasedChartSearches.add(id);
      continue;
    }
    const search = foldChartSearch(id, fields);
    if (search === undefined) continue;
    if (isDeleted(fields)) deletedChartSearches.set(id, search);
    else chartSearches.set(id, search);
  }

  const pins = new Map<string, Pin>();
  const deletedPins = new Map<string, Pin>();
  for (const [id, fields] of Object.entries(registers[PIN_ENTITY] ?? {})) {
    // Purged first, as for saved queries: a purge leaves only its marker.
    if (isPurged(fields)) {
      erasedPins.add(id);
      continue;
    }
    const pin = foldPin(id, fields);
    if (pin === undefined) continue;
    if (isDeleted(fields)) deletedPins.set(id, pin);
    else pins.set(id, pin);
  }

  // A pin's annotation lives at its own id until an erase points it at a fresh `n-` id (#1195). The view is keyed by
  // pin id either way. Legacy `k-` annotations whose pin op has not arrived yet are still shown once it does.
  const annotationFields = registers[ANNOTATION_ENTITY] ?? {};
  for (const [entityId, fields] of Object.entries(annotationFields)) {
    if (isPurged(fields)) erasedAnnotations.add(entityId);
  }
  const pinRegisters = registers[PIN_ENTITY] ?? {};
  const annotatedPinIds = new Set([
    ...Object.keys(pinRegisters),
    ...Object.keys(annotationFields).filter((entityId) => entityId.startsWith('k-')),
  ]);
  const annotations = new Map<string, Note>();
  const annotationEntities = new Map<string, string>();
  const erasedRevisions = new Set<string>();
  for (const pinId of annotatedPinIds) {
    const pinFields = pinRegisters[pinId];
    if (pinFields !== undefined && isPurged(pinFields)) continue;
    for (const [field, register] of Object.entries(pinFields ?? {})) {
      const revisionId = readErasedRevisionField(field);
      if (revisionId !== undefined && register.value === true) erasedRevisions.add(revisionId);
    }
    const pointer = readAnnotationPointer(pinFields?.[ANNOTATION_POINTER_FIELD]?.value);
    if (pointer !== undefined) annotationEntities.set(pinId, pointer);
    const entityId = pointer ?? pinId;
    const fields = annotationFields[entityId];
    if (fields === undefined || erasedAnnotations.has(entityId)) continue;
    const annotation = foldAnnotation(pinId, fields);
    if (annotation !== undefined) annotations.set(pinId, annotation);
  }

  const corrections = new Map<string, CorpusCorrection>();
  for (const [id, fields] of Object.entries(registers[CORRECTION_ENTITY] ?? {})) {
    if (isPurged(fields) || isDeleted(fields)) continue;
    const correction = foldCorrection(id, fields);
    if (correction !== undefined) corrections.set(id, correction);
  }

  return {
    people,
    charts,
    deleted: {
      people: deletedPeople,
      charts: deletedCharts,
      savedQueries: deletedSavedQueries,
      chartSearches: deletedChartSearches,
      pins: deletedPins,
    },
    orphanCharts,
    birthNotes,
    consultationNotes,
    savedQueries,
    chartSearches,
    pins,
    annotations,
    annotationEntities,
    erasedRevisions,
    erased: {
      savedQueries: erasedQueries,
      chartSearches: erasedChartSearches,
      pins: erasedPins,
      annotations: erasedAnnotations,
    },
    // Any other entity id under `account` is ignored: every device writes the one constant id.
    account: foldAccount(registers[ACCOUNT_ENTITY]?.[ACCOUNT_ENTITY_ID]),
    corrections,
  };
}

/**
 * Fold both note entities (#919).
 *
 * A note's own purge marker or its person's purge hides it, mirroring `isPurged` for people.
 * A person's pre-#919 `notes` register is passed in as the Birth Record note's legacy root, so
 * it is read here without an op being written.
 */
function materialiseNotes(registers: Registers): {
  readonly birthNotes: ReadonlyMap<string, Note>;
  readonly consultationNotes: ReadonlyMap<string, readonly Note[]>;
} {
  const personFields = registers.person ?? {};
  const erased = (personId: string): boolean => {
    const person = personFields[personId];
    return person !== undefined && isPurged(person);
  };

  const birthNotes = new Map<string, Note>();
  const birthFields = registers[BIRTH_NOTE_ENTITY] ?? {};
  const birthIds = new Set([...Object.keys(birthFields), ...Object.keys(personFields)]);
  for (const personId of birthIds) {
    const fields = birthFields[personId] ?? {};
    if (erased(personId) || isPurged(fields)) continue;
    const legacy = personFields[personId]?.[LEGACY_NOTE_FIELD];
    const note = foldBirthNote(personId, fields, legacy);
    if (note !== undefined) birthNotes.set(personId, note);
  }

  const consultationNotes = new Map<string, readonly Note[]>();
  const consultationFields = registers[CONSULTATION_NOTE_ENTITY] ?? {};
  for (const [personId, fields] of Object.entries(consultationFields)) {
    if (erased(personId) || isPurged(fields)) continue;
    const notes = foldConsultationNotes(personId, fields);
    if (notes.length > 0) consultationNotes.set(personId, notes);
  }

  return { birthNotes, consultationNotes };
}

/** The whole path, for a caller with no snapshot: records in, state out. */
export function fold(records: readonly unknown[]): State & { readonly skips: FoldSkips } {
  const applied = applyRecords(EMPTY_REGISTERS, records);
  return { ...materialise(applied.registers), skips: applied.skips };
}

/**
 * A snapshot: registers, the newest timestamp in them, and how many records produced it.
 *
 * The count is what makes resuming sound, and it is easy to leave out. Filtering the log
 * to "records newer than `upTo`" looks correct and is not: an operation from a peer can
 * arrive *after* the snapshot was written and still be *older* than `upTo`, and a
 * timestamp filter would skip it forever. So the snapshot records how many records were
 * at or below `upTo` when it was built, and resuming checks that the log still holds
 * exactly that many. If it holds more, something older slipped in behind us and the only
 * correct move is to rebuild — which is cheap, and correct by the same idempotence that
 * makes the fast path safe.
 */
export interface Snapshot {
  readonly registers: Registers;
  /** The newest timestamp folded in. Absent for a snapshot of an empty log. */
  readonly upTo?: Hlc;
  /** How many records at or below `upTo` were folded in. */
  readonly applied: number;
  /**
   * The entity kinds the building build folded. A snapshot that skipped a kind (an older build
   * that did not know `birthNote`, say) holds no registers for it, and the count cannot reveal
   * that: the skipped records are still counted in `applied`. So resuming trusts a snapshot only
   * when this set equals the resuming build's set. Absent on snapshots written before this stamp
   * existed, which are therefore rebuilt once on upgrade.
   */
  readonly entities?: readonly string[];
}

/**
 * Build a snapshot from registers and the log they were folded from.
 *
 * `known` must be the entity kinds used to fold `registers`; it is stamped onto the snapshot so
 * that a build knowing a different set will not resume from it (see `Snapshot.entities`).
 *
 * Both numbers come from the same call on purpose. Passing the count separately invites
 * the caller to use the log's own length, which is wrong whenever the newest record is
 * one the fold could not use — a future operation, say. `upTo` would then sit below that
 * record, the counts would disagree at every startup, and the snapshot would be rebuilt
 * forever while appearing to work.
 */
export function snapshotOf(
  registers: Registers,
  records: readonly OpRecord[],
  known: readonly string[] = KNOWN_ENTITIES,
): Snapshot {
  const entities = [...known];
  let upTo: Hlc | undefined;
  for (const byId of Object.values(registers)) {
    for (const fields of Object.values(byId)) {
      for (const register of Object.values(fields)) {
        if (upTo === undefined || compareHlc(register.hlc, upTo) > 0) upTo = register.hlc;
      }
    }
  }
  if (upTo === undefined) return { registers, applied: 0, entities };
  const applied = records.filter((record) => compareHlc(String(record.hlc), upTo) <= 0).length;
  return { registers, upTo, applied, entities };
}

/** Whether a snapshot's stamp names exactly this build's entity kinds. Absent means unknown, so untrusted. */
function sameKinds(stamp: readonly string[] | undefined, current: readonly string[]): boolean {
  return stamp?.length === current.length && current.every((kind) => stamp.includes(kind));
}

export interface Resumed extends Applied {
  /** True when the snapshot could not be trusted and the log was folded from nothing. */
  readonly rebuilt: boolean;
}

/**
 * Continue from a snapshot, or rebuild if it cannot be trusted.
 *
 * `records` is the whole log, sorted by timestamp. The fast path applies only what is
 * newer than the snapshot; the slow path is a full fold, which must stay correct because
 * it is also the recovery path for a snapshot that is wrong for any other reason.
 */
export function resume(snapshot: Snapshot, records: readonly OpRecord[]): Resumed {
  const { upTo } = snapshot;
  const atOrBelow =
    upTo === undefined ? 0 : records.filter((record) => compareHlc(String(record.hlc), upTo) <= 0).length;
  // The kind check comes first and is not implied by the count. A build that did not know a kind
  // counts those records as applied, so the counts can match while the registers hold nothing
  // for that kind (#919: a birthNote skipped by an older build was hidden behind a matching count).
  if (!sameKinds(snapshot.entities, KNOWN_ENTITIES) || upTo === undefined || atOrBelow !== snapshot.applied) {
    return { ...applyRecords(EMPTY_REGISTERS, records), rebuilt: true };
  }
  const newer = records.filter((record) => compareHlc(String(record.hlc), upTo) > 0);
  return { ...applyRecords(snapshot.registers, newer), rebuilt: false };
}
