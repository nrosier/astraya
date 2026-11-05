/**
 * Saved event-search queries, pins and annotations in the full export, and their restore (#1194, decisions R1-R3).
 *
 * The three are account data in the op-log (ADR 0005). They travel in one optional top-level `research` block of the
 * full export, so the version stays 4 (decision D5): an older reader ignores the block, and a file without it reads
 * exactly as it always did.
 *
 * **Export (R1).** Live items only. A deleted query, an unpinned pin and an annotation whose pin is not live are left
 * out, as deleted people are. An item this build cannot read exactly (a newer version, an unknown tool) is left out and
 * counted in `omittedUnreadable`, never rewritten into something it was not. An annotation travels inside its pin with
 * every revision, so its forks survive the round trip.
 *
 * **Restore (R2, R3).** Only what is missing is added and nothing is overwritten: a query or pin whose id is already
 * here is skipped, and only the annotation revisions this device lacks are written, oldest first. An item the reader
 * deleted on this device is skipped and counted, never brought back. Every write is a `mutate` the store's own guards
 * check, so a malformed or over-limit entry fails the whole restore before the log is touched.
 *
 * A pin id must be the one its target derives to. The derivation is asynchronous (Web Crypto) and staging is
 * synchronous, so `findMismatchedPin` checks it once when the file is read. A restored pin writes its target only, never a
 * fresh `deleted: false`, so a backup cannot undo an unpin made on another device; and an id erased on this device is
 * never written back. The one thing a restore can change is which annotation text is shown as the head, as for notes.
 *
 * @module domain/research-export
 * @purpose Builds, validates and stages the optional `research` block of the full export: live saved queries, pins and their annotations, and the mutations that restore what a device is missing.
 * @conventions Pure and synchronous. Live items only on export; unreadable items are counted, not rewritten. Restore never overwrites, never un-deletes, and writes annotation revisions oldest first through the store's own mutation builders so the store guards apply. Validation is strict and fail-closed, reusing the stores' guards rather than a second parallel validator.
 * @exports ExportedSavedQuery, ExportedPin, ExportedResearch, ExistingResearch, ResearchPreview, buildResearchExport, validateResearch, findMismatchedPin, stageResearchRestore
 */
import { AnnotationRefusedError, annotationRevision, assertAnnotationMutation } from '../store/annotations.js';
import { derivedPinId } from './id.js';
import { compareHlc, isHlc } from '../store/hlc.js';
import type { Note } from '../store/notes.js';
import {
  PIN_ENTITY,
  PIN_TARGET_FIELD,
  PinRefusedError,
  assertPinMutation,
  pinIdentity,
  pinRestore,
  readPinTarget,
  type Pin,
  type PinTarget,
} from '../store/pins.js';
import {
  SAVED_QUERY_DEFINITION_FIELD,
  SAVED_QUERY_ENTITY,
  SAVED_QUERY_NAME_FIELD,
  SavedQueryRefusedError,
  assertSavedQueryMutation,
  readSavedQueryDefinition,
  savedQueryCreate,
  type SavedQuery,
  type SavedQueryDefinition,
} from '../store/saved-queries.js';
import type { Mutation } from '../store/oplog.js';
import type { ExportedNoteRevision } from './full-export.js';

export interface ExportedSavedQuery {
  readonly id: string;
  readonly name: string;
  readonly definition: SavedQueryDefinition;
}

export interface ExportedPin {
  readonly id: string;
  readonly target: PinTarget;
  /** Every revision of the pin's annotation, forks included; absent when the pin has none. */
  readonly annotation?: { readonly revisions: readonly ExportedNoteRevision[] };
}

export interface ExportedResearch {
  readonly savedQueries: readonly ExportedSavedQuery[];
  readonly pins: readonly ExportedPin[];
  /** Live items this build could not read exactly, left out of this file; present only when above zero. */
  readonly omittedUnreadable?: number;
}

/** The slice of the store's folded state a research export or restore needs. */
export interface ExistingResearch {
  readonly savedQueries: ReadonlyMap<string, SavedQuery>;
  readonly pins: ReadonlyMap<string, Pin>;
  readonly annotations: ReadonlyMap<string, Note>;
  readonly deleted: {
    readonly savedQueries: ReadonlyMap<string, SavedQuery>;
    readonly pins: ReadonlyMap<string, Pin>;
  };
  /** Ids erased by a purge marker on this device. A restore never writes them back (finding 3, #1196). */
  readonly erased: {
    readonly savedQueries: ReadonlySet<string>;
    readonly pins: ReadonlySet<string>;
    readonly annotations: ReadonlySet<string>;
  };
}

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * The research block for an export, or undefined when there is nothing to carry (so the key is absent and the file
 * reads as it always did). Items are ordered by id, so the same state always gives the same bytes.
 */
export function buildResearchExport(state: ExistingResearch): ExportedResearch | undefined {
  let omitted = 0;
  const savedQueries: ExportedSavedQuery[] = [];
  for (const query of state.savedQueries.values()) {
    if (query.status === 'ready') savedQueries.push({ id: query.id, name: query.name, definition: query.definition });
    else omitted += 1;
  }
  const pins: ExportedPin[] = [];
  for (const pin of state.pins.values()) {
    if (pin.status !== 'ready') {
      omitted += 1;
      continue;
    }
    const note = state.annotations.get(pin.id);
    pins.push({
      id: pin.id,
      target: pin.target,
      ...(note === undefined
        ? {}
        : {
            annotation: {
              revisions: note.revisions.map((revision) => ({
                id: revision.id,
                text: revision.content,
                parents: [...revision.parents],
                hlc: revision.hlc,
              })),
            },
          }),
    });
  }
  if (savedQueries.length === 0 && pins.length === 0 && omitted === 0) return undefined;
  savedQueries.sort((a, b) => compareCodeUnits(a.id, b.id));
  pins.sort((a, b) => compareCodeUnits(a.id, b.id));
  return { savedQueries, pins, ...(omitted > 0 ? { omittedUnreadable: omitted } : {}) };
}

type Verdict<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly path: string; readonly reason: string };

function fail(path: string, reason: string): Verdict<never> {
  return { ok: false, path, reason };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Run a store guard on a mutation and turn its refusal into a path and a reason. */
function guarded(path: string, mutation: Mutation, guard: (mutation: Mutation) => void): Verdict<Mutation> {
  try {
    guard(mutation);
    return { ok: true, value: mutation };
  } catch (cause) {
    if (
      cause instanceof SavedQueryRefusedError ||
      cause instanceof PinRefusedError ||
      cause instanceof AnnotationRefusedError
    ) {
      return fail(path, `refused by the store (${cause.refusal})`);
    }
    throw cause;
  }
}

function validateRevisions(raw: unknown, path: string): Verdict<readonly ExportedNoteRevision[]> {
  if (!isRecord(raw) || !Array.isArray(raw.revisions)) return fail(path, 'not an object with a revisions array');
  const revisions: ExportedNoteRevision[] = [];
  const ids = new Set<string>();
  for (let index = 0; index < raw.revisions.length; index += 1) {
    const at = `${path}.revisions[${String(index)}]`;
    const entry: unknown = raw.revisions[index];
    if (!isRecord(entry)) return fail(at, 'not an object');
    const { id, text, parents, hlc } = entry;
    if (typeof id !== 'string' || ids.has(id)) return fail(`${at}.id`, 'missing, not a string, or repeated');
    if (typeof text !== 'string') return fail(`${at}.text`, 'not a string');
    if (!Array.isArray(parents) || !(parents as readonly unknown[]).every((p) => typeof p === 'string' && p !== '')) {
      return fail(`${at}.parents`, 'not a list of revision ids');
    }
    if (!isHlc(hlc)) return fail(`${at}.hlc`, 'not a timestamp');
    ids.add(id);
    revisions.push({ id, text, parents: parents as readonly string[], hlc });
  }
  return { ok: true, value: revisions };
}

/**
 * Validate a raw `research` block, strictly. The store's own guards decide whether each item could be written, so the
 * file is refused as a whole, with a path, rather than half-restored. Returns the typed block.
 */
export function validateResearch(raw: unknown, path: string): Verdict<ExportedResearch> {
  if (!isRecord(raw)) return fail(path, 'not an object');
  if (!Array.isArray(raw.savedQueries)) return fail(`${path}.savedQueries`, 'not an array');
  if (!Array.isArray(raw.pins)) return fail(`${path}.pins`, 'not an array');
  const omitted = raw.omittedUnreadable;
  if (omitted !== undefined && (typeof omitted !== 'number' || !Number.isInteger(omitted) || omitted < 1)) {
    return fail(`${path}.omittedUnreadable`, 'not a whole number of at least 1');
  }

  const savedQueries: ExportedSavedQuery[] = [];
  const seenQueries = new Set<string>();
  for (let index = 0; index < raw.savedQueries.length; index += 1) {
    const at = `${path}.savedQueries[${String(index)}]`;
    const entry: unknown = raw.savedQueries[index];
    if (!isRecord(entry)) return fail(at, 'not an object');
    const { id, name, definition } = entry;
    if (typeof id !== 'string' || seenQueries.has(id)) return fail(`${at}.id`, 'missing, not a string, or repeated');
    if (typeof name !== 'string') return fail(`${at}.name`, 'not a string');
    seenQueries.add(id);
    // The definition is judged by the same guard a local save passes, via the mutation that would write it.
    const probe: readonly Mutation[] = [
      { entity: SAVED_QUERY_ENTITY, entityId: id, field: SAVED_QUERY_NAME_FIELD, value: name },
      {
        entity: SAVED_QUERY_ENTITY,
        entityId: id,
        field: SAVED_QUERY_DEFINITION_FIELD,
        value: definition as Mutation['value'],
      },
    ];
    for (const mutation of probe) {
      const verdict = guarded(at, mutation, assertSavedQueryMutation);
      if (!verdict.ok) return verdict;
    }
    // Rebuilt from only the keys this build reads, so an unknown key in a file never reaches the log.
    const read = readSavedQueryDefinition(definition);
    if (read === undefined) return fail(`${at}.definition`, 'not a definition this version can read');
    savedQueries.push({ id, name, definition: read });
  }

  const pins: ExportedPin[] = [];
  const seenPins = new Set<string>();
  for (let index = 0; index < raw.pins.length; index += 1) {
    const at = `${path}.pins[${String(index)}]`;
    const entry: unknown = raw.pins[index];
    if (!isRecord(entry)) return fail(at, 'not an object');
    const { id, target, annotation } = entry;
    if (typeof id !== 'string' || seenPins.has(id)) return fail(`${at}.id`, 'missing, not a string, or repeated');
    seenPins.add(id);
    const pinProbe: readonly Mutation[] = [
      { entity: PIN_ENTITY, entityId: id, field: PIN_TARGET_FIELD, value: target as Mutation['value'] },
    ];
    for (const mutation of pinProbe) {
      const verdict = guarded(at, mutation, assertPinMutation);
      if (!verdict.ok) return verdict;
    }
    // Re-read so the typed target is the one this build would hold, not the raw object.
    const readTarget = readPinTarget(target);
    if (readTarget === undefined) return fail(`${at}.target`, 'not a target this version can read');
    if (annotation === undefined) {
      pins.push({ id, target: readTarget });
      continue;
    }
    const revisions = validateRevisions(annotation, `${at}.annotation`);
    if (!revisions.ok) return revisions;
    for (let r = 0; r < revisions.value.length; r += 1) {
      const revision = revisions.value[r];
      if (revision === undefined) continue;
      const verdict = guarded(
        `${at}.annotation.revisions[${String(r)}]`,
        annotationRevision(id, revision.id, revision.text, revision.parents),
        assertAnnotationMutation,
      );
      if (!verdict.ok) return verdict;
    }
    pins.push({ id, target: readTarget, annotation: { revisions: revisions.value } });
  }

  return {
    ok: true,
    value: {
      savedQueries,
      pins,
      ...(typeof omitted === 'number' && omitted > 0 ? { omittedUnreadable: omitted } : {}),
    },
  };
}

/**
 * The path of the first pin whose id is not the one its own target derives to, or undefined when every id is right.
 * Asynchronous (Web Crypto), so it runs once when the file is read, before staging. A mismatched id could attach a
 * note to the wrong event, or be overwritten later when the reader pins the event that id really belongs to.
 */
export async function findMismatchedPin(research: ExportedResearch): Promise<string | undefined> {
  for (let index = 0; index < research.pins.length; index += 1) {
    const pin = research.pins[index];
    if (pin !== undefined && pin.id !== (await derivedPinId(pinIdentity(pin.target)))) {
      return `research.pins[${String(index)}].id`;
    }
  }
  return undefined;
}

/** What a research restore would write, and what it leaves alone, for the preview. */
export interface ResearchPreview {
  readonly mutations: readonly Mutation[];
  readonly newSavedQueries: number;
  readonly newPins: number;
  readonly newAnnotationRevisions: number;
  /** Items already on this device that the file also holds; nothing about them is overwritten. */
  readonly alreadyHere: number;
  /** Items the reader deleted on this device; a restore never brings them back. */
  readonly deletedHere: number;
}

/** Revisions oldest first by timestamp, so a revision is written after the ones it names as parents. */
function oldestFirst(revisions: readonly ExportedNoteRevision[]): readonly ExportedNoteRevision[] {
  return [...revisions].sort((a, b) => compareHlc(a.hlc, b.hlc) || compareCodeUnits(a.id, b.id));
}

/**
 * The exact mutations a research restore would write, without writing any. Pure. Nothing here mints an id: query,
 * pin and revision ids all come from the file.
 */
export function stageResearchRestore(research: ExportedResearch, existing: ExistingResearch): ResearchPreview {
  const mutations: Mutation[] = [];
  let newSavedQueries = 0;
  let newPins = 0;
  let newAnnotationRevisions = 0;
  let alreadyHere = 0;
  let deletedHere = 0;

  for (const query of research.savedQueries) {
    if (existing.deleted.savedQueries.has(query.id) || existing.erased.savedQueries.has(query.id)) {
      deletedHere += 1;
    } else if (existing.savedQueries.has(query.id)) {
      alreadyHere += 1;
    } else {
      mutations.push(...savedQueryCreate(query.id, query.name, query.definition));
      newSavedQueries += 1;
    }
  }

  for (const pin of research.pins) {
    if (existing.deleted.pins.has(pin.id) || existing.erased.pins.has(pin.id)) {
      // The pin is hidden here by the reader's choice, so its annotation is left alone too.
      deletedHere += 1;
      continue;
    }
    const here = existing.pins.get(pin.id);
    if (here !== undefined) {
      alreadyHere += 1;
      // The same id must be the same event. Ids are checked against their targets when the file is read, so this only
      // guards a local pin that does not match its own id; its annotation is not touched.
      if (here.status === 'ready' && pinIdentity(here.target) !== pinIdentity(pin.target)) continue;
    } else {
      mutations.push(pinRestore(pin.id, pin.target));
      newPins += 1;
    }
    if (existing.erased.annotations.has(pin.id)) continue;
    const held = new Set((existing.annotations.get(pin.id)?.revisions ?? []).map((revision) => revision.id));
    for (const revision of oldestFirst(pin.annotation?.revisions ?? [])) {
      if (held.has(revision.id)) continue;
      mutations.push(annotationRevision(pin.id, revision.id, revision.text, revision.parents));
      newAnnotationRevisions += 1;
    }
  }

  return { mutations, newSavedQueries, newPins, newAnnotationRevisions, alreadyHere, deletedHere };
}
