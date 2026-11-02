/**
 * The revision mutations the note cards write (#919), built from the note as the store folds it now.
 *
 * Each save names the current head and every fork as its parents, so it resolves what the device saw.
 * A new consultation note's first revision uses the note id as its own id, which is how the fold finds the root.
 */
/**
 * @module note-mutations
 * @purpose Pure builders for the Birth Record and Consultation note revisions a card saves, from the folded note it is editing.
 * @conventions Takes the folded note (or undefined when there is none yet) so the parents are current at save time; a blank first consultation note is not written; new revision ids come from `domain/id`.
 * @exports birthNoteMutation, consultationNoteMutation
 */
import { newId } from '../domain/id.js';
import { birthNoteRevision, consultationNoteRevision, revisionParents, type Note } from '../store/notes.js';
import type { Mutation } from '../store/oplog.js';

/** The next revision of a Birth Record note. Its parents are every current leaf, so forks are resolved. */
export function birthNoteMutation(personId: string, head: Note | undefined, text: string): Mutation {
  const parents = head === undefined ? [] : revisionParents(head);
  return birthNoteRevision(personId, newId('r'), text, parents);
}

/**
 * The next revision of a Consultation note, or undefined when there is nothing to write.
 *
 * `rootId` is the note id. Until the note exists in the store its first save is the root revision; a blank
 * text does not create a note, so a cleared new-note field writes nothing.
 */
export function consultationNoteMutation(
  personId: string,
  rootId: string,
  head: Note | undefined,
  text: string,
): Mutation | undefined {
  if (head === undefined) {
    if (text.trim() === '') return undefined;
    return consultationNoteRevision(personId, rootId, rootId, text, []);
  }
  return consultationNoteRevision(personId, rootId, newId('r'), text, revisionParents(head));
}
