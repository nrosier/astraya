/**
 * Annotations on pinned events, folded from the operation log (#1061, ADR 0005 addendum for slice 3).
 *
 * An annotation is free text a reader attaches to a pin. It is account data: a new entity kind, `annotation`, in the
 * existing log, with no change to the envelope, the spine, `OP_VERSION` or the relay.
 *
 * **One annotation per pin; the pin's id is the entity id.** Pins are person-independent sky events, so nothing here
 * needs the person-purge fan-out. The annotation keeps its text when its pin is unpinned and shows it again when the
 * same event is pinned again (the pin id is derived from the event).
 *
 * **Revisions, not one text register (owner decision D7).** Two devices editing the same annotation must not silently
 * lose one edit, so each save is an immutable revision `rev/<revisionId>` that names the revisions it was written on
 * top of. The fold is the one the Birth Record note uses (`foldBirthNote`): the newest leaf is the head and the other
 * leaves are forks, all kept. Clearing the text saves an empty revision; no version is ever deleted.
 *
 * **Reads are total, writes are guarded.** Records also arrive from peers, which only the envelope validates, so the
 * fold never throws and ignores a malformed revision deterministically. `assertAnnotationMutation` refuses a bad local
 * write, and a text over `NOTE_MAX_CHARACTERS`, before the log is touched.
 *
 * Pure: no IndexedDB and no clock. `materialise` in fold.ts calls `foldAnnotation`; `store.ts` calls the guard.
 *
 * @module store/annotations
 * @purpose Folds annotations on pinned events (immutable text revisions keyed by pin id) into a head with forks, and builds and refuses the mutations written to the op-log.
 * @conventions The entity id is the pin's `k-` id and the only fields are `rev/<revisionId>`; every version is kept and a fork is resolved by naming all leaves as parents; clearing writes an empty revision; fold functions never throw; refusals carry a code rather than prose; the text shares the 50,000 code-point note limit.
 * @exports ANNOTATION_ENTITY, ANNOTATION_MAX_CHARACTERS, AnnotationRefusal, AnnotationRefusedError, foldAnnotation, annotationRevision, assertAnnotationMutation
 */
import { isId } from '../domain/id.js';
import { NOTE_MAX_CHARACTERS, foldBirthNote, isNoteTooLong, readBody, type Note, type NoteFields } from './notes.js';
import type { Mutation } from './oplog.js';

/** Entity kind of an annotation. Its entity id is the pin's own `k-` id. */
export const ANNOTATION_ENTITY = 'annotation';

/** Why an annotation mutation was refused. A code, not prose, so the UI owns the wording. */
export type AnnotationRefusal = 'invalid' | 'too-long';

export class AnnotationRefusedError extends Error {
  readonly refusal: AnnotationRefusal;

  constructor(refusal: AnnotationRefusal) {
    super(`Annotation mutation refused: ${refusal}`);
    this.name = 'AnnotationRefusedError';
    this.refusal = refusal;
  }
}

/**
 * Fold one pin's annotation, or undefined when it holds no readable revision. The note's `personId` field carries the
 * pin id here; an annotation has no person. The caller tests for a purge marker first.
 */
export function foldAnnotation(pinId: string, fields: NoteFields): Note | undefined {
  return foldBirthNote(pinId, fields);
}

/** An annotation revision. `parents` must be every current leaf, so a save resolves the forks it saw. */
export function annotationRevision(
  pinId: string,
  revisionId: string,
  text: string,
  parents: readonly string[],
): Mutation {
  return {
    entity: ANNOTATION_ENTITY,
    entityId: pinId,
    field: `rev/${revisionId}`,
    value: { text, parents: [...parents] },
  };
}

/**
 * Refuse an annotation mutation the store must not write. Other entities pass through untouched.
 *
 * Only `rev/<revisionId>` fields are allowed, on a `k-` entity id, with a readable body and a text within the limit.
 * Every other field, `deleted` and `purged` included, is refused: an annotation is never tombstoned.
 */
export function assertAnnotationMutation(mutation: Mutation): void {
  if (mutation.entity !== ANNOTATION_ENTITY) return;
  if (!isId(mutation.entityId) || !mutation.entityId.startsWith('k-')) throw new AnnotationRefusedError('invalid');
  const parts = mutation.field.split('/');
  const [kind, revisionId] = parts;
  if (kind !== 'rev' || parts.length !== 2 || !isId(revisionId) || !revisionId.startsWith('r-')) {
    throw new AnnotationRefusedError('invalid');
  }
  const body = readBody(mutation.value);
  if (body === undefined) throw new AnnotationRefusedError('invalid');
  if (isNoteTooLong(body.text)) throw new AnnotationRefusedError('too-long');
}

export { NOTE_MAX_CHARACTERS as ANNOTATION_MAX_CHARACTERS };
