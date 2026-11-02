/**
 * Birth Record and Consultation notes, folded from the operation log (#919).
 *
 * A note is not one last-write-wins register. Every save writes an immutable revision with
 * a fresh id, and the note's text is the head revision. Two devices editing one note offline
 * therefore both keep their version: neither write overwrites the other, and the loser is
 * shown as an "Other version" fork. Whole-text last-write-wins would silently drop one of two
 * concurrent edits, which a clinical note must never do.
 *
 * **Leaves, head and forks.** A revision that no other revision names as a parent is a leaf.
 * The head is the leaf with the greatest HLC; every other leaf is a fork. A save made after
 * seeing forks names all of them as parents, which resolves them.
 *
 * **Deleting is grow-only.** Once `del/<noteId>` is true the consultation note stays hidden,
 * whatever any revision's timestamp, and nothing ever writes it back. A concurrent edit
 * cannot resurrect a note someone deleted.
 *
 * **Birth Record notes migrate on read.** Before #919 the text lived in `person.notes`, an
 * ordinary register. Here that register is read as one root revision whose id carries its own
 * timestamp. No op is written, so every device derives the same id. If an older build later
 * writes `person.notes`, the timestamp moves, the old text becomes a new root beside any
 * revision already built on it, and the two surface as a fork rather than an overwrite.
 *
 * **Limit.** A saved revision's text may be at most `NOTE_MAX_CHARACTERS` characters, counted
 * as code points. `assertNoteMutation` refuses anything larger before it reaches the log.
 *
 * Pure: no IndexedDB and no clock. `materialise` in fold.ts calls the fold functions, and
 * `store.ts` calls the mutation builders and the refusal check.
 *
 * @module store/notes
 * @purpose Folds Birth Record and Consultation note revisions into heads, forks and grow-only deletes, and builds and refuses the note mutations written to the op-log.
 * @conventions Each save is an immutable revision keyed by a fresh id, so concurrent edits fork instead of overwriting; the head is the greatest-HLC leaf and every other leaf is a fork; a consultation note's delete is grow-only and cannot be undone; a legacy `person.notes` register is read as a root revision whose id embeds its HLC, so no op is written during migration; refusals carry a code rather than prose, so the UI owns the wording; a saved revision is capped at 50,000 characters.
 * @exports NOTE_MAX_CHARACTERS, isNoteTooLong, isOversizedLegacyNoteRecord, BIRTH_NOTE_ENTITY, CONSULTATION_NOTE_ENTITY, NOTE_ENTITIES, LEGACY_NOTE_FIELD, NoteFieldRegister, NoteFields, NoteRevisionView, NoteVersion, Note, FoldedNotes, foldBirthNote, foldConsultationNotes, birthNoteRevision, consultationNoteRevision, consultationNoteDelete, NoteRefusal, NoteRefusedError, assertNoteMutation, entitiesPurgedWith, revisionParents
 */
import { compareHlc, decodeHlc, isHlc, type Hlc } from './hlc.js';
import type { Mutation } from './oplog.js';

/** The longest text one saved revision may hold, in code points (owner decision, 2026-11-02). */
export const NOTE_MAX_CHARACTERS = 50_000;

/**
 * Whether `text` is longer than a note may be, counted in code points. The one rule shared by
 * the write guard, the importers and the sync push, so none of them can disagree with the app.
 */
export function isNoteTooLong(text: string): boolean {
  return Array.from(text).length > NOTE_MAX_CHARACTERS;
}

/** Entity kind for a Birth Record note. Its entity id is the person id. */
export const BIRTH_NOTE_ENTITY = 'birthNote';

/** Entity kind for a Consultation note. Its entity id is the person id; the note id is in the field. */
export const CONSULTATION_NOTE_ENTITY = 'consultationNote';

/** Both note entity kinds. Purging a person purges each of these too. */
export const NOTE_ENTITIES: readonly string[] = [BIRTH_NOTE_ENTITY, CONSULTATION_NOTE_ENTITY];

/** The pre-#919 field on the person entity that held the Birth Record notes text. */
export const LEGACY_NOTE_FIELD = 'notes';

const PERSON_ENTITY = 'person';

/**
 * Whether a log record is a pre-#919 `person.notes` write over the limit. The text stays in the
 * local log, since it is still the person's note, but it must not be pushed: the relay's request
 * limit would refuse it and hold up every op queued behind it.
 */
export function isOversizedLegacyNoteRecord(record: Readonly<Record<string, unknown>>): boolean {
  return (
    record.entity === PERSON_ENTITY &&
    record.field === LEGACY_NOTE_FIELD &&
    typeof record.value === 'string' &&
    isNoteTooLong(record.value)
  );
}

/** One field's winning value and the timestamp that won it. Structurally the fold's `Register`. */
export interface NoteFieldRegister {
  readonly value: unknown;
  readonly hlc: Hlc;
}

/** The fields of one entity id, by field name. */
export type NoteFields = Readonly<Record<string, NoteFieldRegister>>;

/** The body a revision carries: its text and the revisions it was written on top of. */
interface NoteBody {
  readonly text: string;
  readonly parents: readonly string[];
}

/** A revision as the fold sees it: its body, its own id and the timestamp of its write. */
interface NoteRevision extends NoteBody {
  readonly id: string;
  readonly hlc: Hlc;
}

/** A competing version of a note that is not the head. */
export interface NoteVersion {
  /** The revision id. Pass it back as a parent to resolve the fork. */
  readonly id: string;
  readonly content: string;
  /** Milliseconds of the revision's own timestamp. */
  readonly updatedAt: number;
}

/**
 * One revision as the fold holds it: enough to export the whole chain and to tell which
 * revisions a store already has. `hlc` is the timestamp the revision was written with, so
 * a reader can order a chain the way the fold did.
 */
export interface NoteRevisionView {
  readonly id: string;
  readonly content: string;
  /** The revision ids this one was written on top of. */
  readonly parents: readonly string[];
  readonly hlc: Hlc;
}

/** A folded note: its head text, the forks beside it, and the timestamps the UI shows. */
export interface Note {
  /** The head revision's id. */
  readonly id: string;
  /**
   * The note's key in the log: the `noteId` of its `rev/<noteId>/...` fields. Consultation notes only; a Birth
   * Record note has one per person and uses the person id. Stable even when the root revision has not arrived yet.
   */
  readonly noteId: string;
  /** The root revision's id. For a consultation note this is the note id, and it never changes. */
  readonly rootId: string;
  readonly personId: string;
  /** The head's text. */
  readonly content: string;
  /** Milliseconds of the head's timestamp: when the shown text was saved. */
  readonly updatedAt: number;
  /** Milliseconds of the root's timestamp: when the note was first made. */
  readonly timestamp: number;
  /** Every other leaf, newest first. Empty when no edits raced. */
  readonly forks: readonly NoteVersion[];
  /** Every revision of this note, oldest first (by HLC). Head and forks are among them. */
  readonly revisions: readonly NoteRevisionView[];
}

/** The folded notes of a whole store, as `store.state` holds them. */
export interface FoldedNotes {
  readonly birthNotes: ReadonlyMap<string, Note>;
  readonly consultationNotes: ReadonlyMap<string, readonly Note[]>;
}

/** Why a note mutation was refused. A code, not prose, so the UI owns the wording. */
export type NoteRefusal = 'invalid' | 'too-long';

export class NoteRefusedError extends Error {
  readonly refusal: NoteRefusal;

  constructor(refusal: NoteRefusal) {
    super(`Note mutation refused: ${refusal}`);
    this.name = 'NoteRefusedError';
    this.refusal = refusal;
  }
}

/** The revision ids a new save must name as parents: the head and every fork. */
export function revisionParents(note: Note): readonly string[] {
  return [note.id, ...note.forks.map((fork) => fork.id)];
}

/** The id a legacy `person.notes` register is read as, carrying its timestamp so an overwrite is a new root. */
function legacyRevisionId(hlc: Hlc): string {
  return `legacy-${hlc}`;
}

function nonEmpty(value: string | undefined): value is string {
  return value !== undefined && value !== '';
}

function isStringList(value: unknown): value is readonly string[] {
  return Array.isArray(value) && (value as readonly unknown[]).every((item) => typeof item === 'string' && item !== '');
}

/** Read a revision body, or undefined when the value is not one. Malformed revisions are ignored, deterministically. */
function readBody(value: unknown): NoteBody | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const { text, parents } = value as { readonly text?: unknown; readonly parents?: unknown };
  if (typeof text !== 'string' || !isStringList(parents)) return undefined;
  return { text, parents };
}

function revisionOf(id: string, register: NoteFieldRegister): NoteRevision | undefined {
  // A malformed timestamp is skipped rather than thrown on: the fold must never fail startup.
  if (!isHlc(register.hlc)) return undefined;
  const body = readBody(register.value);
  if (body === undefined) return undefined;
  return { id, text: body.text, parents: body.parents, hlc: register.hlc };
}

/**
 * The head of one note, and its forks.
 *
 * Forks are leaves, so a revision that is a parent of some other revision never appears as
 * one. If every revision is named as a parent (only possible with a malformed or cyclic log),
 * all of them count as leaves, so the note still shows something deterministic.
 */
function headOf(
  personId: string,
  revisions: ReadonlyMap<string, NoteRevision>,
  noteId: string | undefined,
): Note | undefined {
  const all = [...revisions.values()];
  if (all.length === 0) return undefined;
  const named = new Set(all.flatMap((revision) => revision.parents));
  const unnamed = all.filter((revision) => !named.has(revision.id));
  const leaves = (unnamed.length > 0 ? unnamed : all).sort((a, b) => compareHlc(b.hlc, a.hlc));
  const [head, ...forks] = leaves;
  if (head === undefined) return undefined;

  const byTime = [...all].sort((a, b) => compareHlc(a.hlc, b.hlc));
  const root =
    (noteId !== undefined ? revisions.get(noteId) : undefined) ??
    byTime.find((revision) => revision.parents.length === 0) ??
    head;

  return {
    id: head.id,
    noteId: noteId ?? root.id,
    rootId: root.id,
    personId,
    content: head.text,
    updatedAt: decodeHlc(head.hlc).millis,
    timestamp: decodeHlc(root.hlc).millis,
    forks: forks.map((fork) => ({ id: fork.id, content: fork.text, updatedAt: decodeHlc(fork.hlc).millis })),
    revisions: byTime.map((revision) => ({
      id: revision.id,
      content: revision.text,
      parents: revision.parents,
      hlc: revision.hlc,
    })),
  };
}

/**
 * The Birth Record note of one person, or undefined when it has no revisions at all.
 *
 * `fields` are the `birthNote` entity's registers for this person. `legacy` is the person's
 * pre-#919 `notes` register, read as a root revision when present.
 */
export function foldBirthNote(personId: string, fields: NoteFields, legacy?: NoteFieldRegister): Note | undefined {
  const revisions = new Map<string, NoteRevision>();
  if (legacy !== undefined && typeof legacy.value === 'string' && isHlc(legacy.hlc)) {
    const id = legacyRevisionId(legacy.hlc);
    revisions.set(id, { id, text: legacy.value, parents: [], hlc: legacy.hlc });
  }
  for (const [field, register] of Object.entries(fields)) {
    const parts = field.split('/');
    const [kind, revisionId] = parts;
    if (kind !== 'rev' || parts.length !== 2 || !nonEmpty(revisionId)) continue;
    const revision = revisionOf(revisionId, register);
    if (revision !== undefined) revisions.set(revisionId, revision);
  }
  return headOf(personId, revisions, undefined);
}

/**
 * The live Consultation notes of one person, oldest first.
 *
 * `fields` are the `consultationNote` entity's registers for this person. A note whose
 * `del/<noteId>` field is true is dropped here, and that is the only path that hides it.
 */
export function foldConsultationNotes(personId: string, fields: NoteFields): readonly Note[] {
  const deleted = new Set<string>();
  const byNote = new Map<string, Map<string, NoteRevision>>();
  for (const [field, register] of Object.entries(fields)) {
    const parts = field.split('/');
    const [kind, noteId, revisionId] = parts;
    if (!nonEmpty(noteId)) continue;
    if (kind === 'del' && parts.length === 2 && register.value === true) {
      deleted.add(noteId);
    } else if (kind === 'rev' && parts.length === 3 && nonEmpty(revisionId)) {
      const revision = revisionOf(revisionId, register);
      if (revision === undefined) continue;
      const group = byNote.get(noteId) ?? new Map<string, NoteRevision>();
      group.set(revisionId, revision);
      byNote.set(noteId, group);
    }
  }

  const notes: Note[] = [];
  for (const [noteId, revisions] of byNote) {
    if (deleted.has(noteId)) continue;
    const note = headOf(personId, revisions, noteId);
    if (note !== undefined) notes.push(note);
  }
  return notes.sort((a, b) => a.timestamp - b.timestamp || (a.rootId < b.rootId ? -1 : a.rootId > b.rootId ? 1 : 0));
}

/** A Birth Record revision. `parents` must be every current leaf, so a save resolves the forks it saw. */
export function birthNoteRevision(
  personId: string,
  revisionId: string,
  text: string,
  parents: readonly string[],
): Mutation {
  return {
    entity: BIRTH_NOTE_ENTITY,
    entityId: personId,
    field: `rev/${revisionId}`,
    value: { text, parents: [...parents] },
  };
}

/** A Consultation note revision. The first revision of a note has `revisionId === noteId` and no parents. */
export function consultationNoteRevision(
  personId: string,
  noteId: string,
  revisionId: string,
  text: string,
  parents: readonly string[],
): Mutation {
  return {
    entity: CONSULTATION_NOTE_ENTITY,
    entityId: personId,
    field: `rev/${noteId}/${revisionId}`,
    value: { text, parents: [...parents] },
  };
}

/** Grow-only delete of a Consultation note. There is no matching undo. */
export function consultationNoteDelete(personId: string, noteId: string): Mutation {
  return { entity: CONSULTATION_NOTE_ENTITY, entityId: personId, field: `del/${noteId}`, value: true };
}

/**
 * Refuse a note mutation the store must not write. Other entities pass through untouched.
 *
 * Only revisions and grow-only deletes are allowed. `deleted`, `restore`, and any other field
 * is refused, because a note has no such operation. A revision over the character limit is
 * refused, so the text never reaches the log.
 */
export function assertNoteMutation(mutation: Mutation): void {
  if (mutation.entity !== BIRTH_NOTE_ENTITY && mutation.entity !== CONSULTATION_NOTE_ENTITY) return;
  if (!nonEmpty(mutation.entityId)) throw new NoteRefusedError('invalid');

  const parts = mutation.field.split('/');
  const [kind, first, second] = parts;
  if (mutation.entity === BIRTH_NOTE_ENTITY) {
    if (kind !== 'rev' || parts.length !== 2 || !nonEmpty(first)) throw new NoteRefusedError('invalid');
  } else if (kind === 'rev') {
    if (parts.length !== 3 || !nonEmpty(first) || !nonEmpty(second)) throw new NoteRefusedError('invalid');
  } else if (kind === 'del') {
    if (parts.length !== 2 || !nonEmpty(first) || mutation.value !== true) throw new NoteRefusedError('invalid');
    return;
  } else {
    throw new NoteRefusedError('invalid');
  }

  const body = readBody(mutation.value);
  if (body === undefined) throw new NoteRefusedError('invalid');
  if (isNoteTooLong(body.text)) throw new NoteRefusedError('too-long');
}

/**
 * Every entity a purge of `entity` must erase, in one commit (#919).
 *
 * A purged person takes its Birth Record and Consultation notes with it. Otherwise a note would
 * survive the erasure of the person it belongs to.
 */
export function entitiesPurgedWith(entity: string): readonly string[] {
  return entity === PERSON_ENTITY ? [entity, ...NOTE_ENTITIES] : [entity];
}
