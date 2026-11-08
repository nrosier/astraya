/**
 * A reader's own corrections to interpretation text (#1338, slice 1), folded from the operation log.
 *
 * A correction replaces the text of one corpus entry for the reader who wrote it, and nobody else. It is account
 * data: a new entity kind, `corpusCorrection`, in the existing encrypted log, with no change to the envelope, the
 * spine, `OP_VERSION` or the relay. It works offline and, signed in, follows the reader to their other devices.
 *
 * **One entity per (locale, key).** The entity id is `<locale>|<key>`. A corpus key contains colons, digits and
 * lower-case names, never a pipe, so the delimiter cannot be confused with part of a key and the id round-trips.
 *
 * **Registers.** `text` is the corrected text (atomic last-write-wins), `baseHash` is a hash of the default text the
 * reader saw when correcting (so a later change to the default can be detected), and `deleted` is the tombstone: a
 * reset is a delete, and correcting again writes `deleted: false` with the text. Nothing else is stored: no person
 * ids, names, birth data or notes.
 *
 * **Never purged.** The relay treats any `purged: true` as a permanent deny-list entry and would then refuse every
 * later correction of that text, so `assertCorrectionMutation` refuses `purged` and `Store.purge` refuses the
 * entity, as for pins. A reset is a tombstone with Undo (a fresh edit), never an erase.
 *
 * **Reads are total, writes are guarded.** `foldCorrection` never throws, since records also arrive from peers. The
 * fold is lenient (a key a newer build added is kept as written); the write guard is strict (a known canonical key
 * and text that passes the corpus length bounds, with no markup and no link).
 *
 * Pure: no IndexedDB, no clock. `materialise` in fold.ts calls `foldCorrection`; `store.ts` calls the guard.
 *
 * @module store/corpus-corrections
 * @purpose Folds a reader's own interpretation-text corrections (one entity per locale and key) into live corrections, validates correction text, and builds and refuses the mutations written to the op-log.
 * @conventions Entity id is `<locale>|<key>`; `text` and `baseHash` are last-write-wins registers and `deleted` the tombstone; `purged` is refused on write, and a purge marker from a peer hides the entity on fold; the write guard reuses the corpus `lintEntry` length rule and adds only a markup and a link check; fold functions never throw; refusals carry a code rather than prose so the UI owns the wording; only `{locale, key, text, baseHash}` is ever stored.
 * @exports CORRECTION_ENTITY, CORRECTION_TEXT_FIELD, CORRECTION_BASE_HASH_FIELD, correctionId, parseCorrectionId, CorpusCorrection, foldCorrection, CorrectionRefusal, CorrectionRefusedError, checkCorrectionText, textHash, correctionWrite, correctionReset, assertCorrectionMutation
 */
import { checkPlainText, lintEntry, MAX_LENGTH } from '../interpretation/lint.js';
import { CORPUS_LOCALES, validateKey, type CorpusEntry, type Locale } from '../interpretation/schema.js';
import type { NoteFieldRegister } from './notes.js';
import type { Mutation } from './oplog.js';

/** Entity kind of a correction. Its entity id is `<locale>|<key>`. */
export const CORRECTION_ENTITY = 'corpusCorrection';
export const CORRECTION_TEXT_FIELD = 'text';
export const CORRECTION_BASE_HASH_FIELD = 'baseHash';

/** The `deleted` tombstone field, spelled here so the guard does not import the fold it is called from. */
const TOMBSTONE_FIELD = 'deleted';

/** The delimiter between locale and key. A corpus key never contains it (keys use letters, digits, `-` and `:`). */
const ID_DELIMITER = '|';

/** The longest key the lenient fold accepts; real keys are well under this. */
const KEY_MAX_CHARACTERS = 200;

/** A correction as the fold yields it: all there is to a correction. */
export interface CorpusCorrection {
  readonly locale: Locale;
  readonly key: string;
  readonly text: string;
  /** Hash of the default text the reader saw when correcting; empty when the register is missing or unreadable. */
  readonly baseHash: string;
}

function isLocale(value: string): value is Locale {
  return CORPUS_LOCALES.some((locale) => locale === value);
}

/** The entity id of the correction for one (locale, key). */
export function correctionId(locale: Locale, key: string): string {
  return `${locale}${ID_DELIMITER}${key}`;
}

/** The locale and key an entity id names, or `undefined` when it is not a well-formed correction id. */
export function parseCorrectionId(id: string): { readonly locale: Locale; readonly key: string } | undefined {
  const at = id.indexOf(ID_DELIMITER);
  if (at < 1) return undefined;
  const locale = id.slice(0, at);
  const key = id.slice(at + 1);
  if (!isLocale(locale)) return undefined;
  if (key === '' || key.length > KEY_MAX_CHARACTERS || key.includes(ID_DELIMITER)) return undefined;
  return { locale, key };
}

/**
 * Fold one correction's registers. Pure, total (never throws), deterministic.
 *
 * Returns `undefined` when the id is malformed or the entity holds no readable `text`. The caller tests for the
 * tombstone and a purge marker first.
 */
export function foldCorrection(
  id: string,
  fields: Readonly<Record<string, NoteFieldRegister>>,
): CorpusCorrection | undefined {
  const parsed = parseCorrectionId(id);
  if (parsed === undefined) return undefined;
  const text = fields[CORRECTION_TEXT_FIELD]?.value;
  if (typeof text !== 'string' || text === '') return undefined;
  const baseHash = fields[CORRECTION_BASE_HASH_FIELD]?.value;
  return { ...parsed, text, baseHash: typeof baseHash === 'string' ? baseHash : '' };
}

/** Why a correction was refused. A code, not prose, so the UI owns the wording. */
export type CorrectionRefusal = 'empty' | 'too-short' | 'too-long' | 'markup' | 'link' | 'invalid';

export class CorrectionRefusedError extends Error {
  readonly refusal: CorrectionRefusal;

  constructor(refusal: CorrectionRefusal) {
    super(`Corpus correction refused: ${refusal}`);
    this.name = 'CorrectionRefusedError';
    this.refusal = refusal;
  }
}

/**
 * Check correction text before anything is written. Empty, over-length and under-length text is refused by the corpus
 * `lintEntry` length rule (the same 40 to 1600 bounds every shipped entry meets); HTML tags and links are refused here
 * because the lint has no such rule. Returns the refusal, or `undefined` when the text may be saved.
 */
export function checkCorrectionText(locale: Locale, key: string, text: string): CorrectionRefusal | undefined {
  if (text.trim() === '') return 'empty';
  const plain = checkPlainText(text);
  if (plain !== undefined) return plain;
  const entry: CorpusEntry = {
    key,
    locale,
    text,
    tier: 'nuance',
    tags: [],
    provenance: { source: 'hand-written' },
  };
  if (lintEntry(entry).some((issue) => issue.rule === 'length')) {
    return text.length > MAX_LENGTH ? 'too-long' : 'too-short';
  }
  return undefined;
}

/** A hex SHA-256 prefix of a text, enough to tell that a default changed. Asynchronous (Web Crypto). */
export async function textHash(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return Array.from(digest.subarray(0, 8), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * The writes for saving a correction, committed in one `Store.mutate` batch. It writes `deleted: false` as well as the
 * text, so a correction made on one device wins over a reset made on another device that has not synced yet. Throws a
 * `CorrectionRefusedError` for text that fails `checkCorrectionText`, before anything is appended.
 */
export function correctionWrite(locale: Locale, key: string, text: string, baseHash: string): readonly Mutation[] {
  const refusal = checkCorrectionText(locale, key, text);
  if (refusal !== undefined) throw new CorrectionRefusedError(refusal);
  const entityId = correctionId(locale, key);
  return [
    { entity: CORRECTION_ENTITY, entityId, field: CORRECTION_TEXT_FIELD, value: text },
    { entity: CORRECTION_ENTITY, entityId, field: CORRECTION_BASE_HASH_FIELD, value: baseHash },
    { entity: CORRECTION_ENTITY, entityId, field: TOMBSTONE_FIELD, value: false },
  ];
}

/** The write for resetting a correction: the tombstone. The committed or approved text shows again. */
export function correctionReset(locale: Locale, key: string): Mutation {
  return { entity: CORRECTION_ENTITY, entityId: correctionId(locale, key), field: TOMBSTONE_FIELD, value: true };
}

/**
 * Refuse a correction mutation the store must not write. Other entities pass through untouched.
 *
 * Allows only `text` (text that passes `checkCorrectionText`), `baseHash` (a short hex string) and `deleted` (a
 * boolean), on an id naming a known locale and a canonical corpus key. Every other field, `purged` included, is
 * refused: nothing else may be stored with a correction.
 */
export function assertCorrectionMutation(mutation: Mutation): void {
  if (mutation.entity !== CORRECTION_ENTITY) return;
  const parsed = parseCorrectionId(mutation.entityId);
  if (parsed === undefined || validateKey(parsed.key).length > 0) throw new CorrectionRefusedError('invalid');
  switch (mutation.field) {
    case CORRECTION_TEXT_FIELD: {
      if (typeof mutation.value !== 'string') throw new CorrectionRefusedError('invalid');
      const refusal = checkCorrectionText(parsed.locale, parsed.key, mutation.value);
      if (refusal !== undefined) throw new CorrectionRefusedError(refusal);
      return;
    }
    case CORRECTION_BASE_HASH_FIELD:
      if (typeof mutation.value !== 'string' || !/^[0-9a-f]{0,64}$/.test(mutation.value)) {
        throw new CorrectionRefusedError('invalid');
      }
      return;
    case TOMBSTONE_FIELD:
      if (typeof mutation.value !== 'boolean') throw new CorrectionRefusedError('invalid');
      return;
    default:
      throw new CorrectionRefusedError('invalid');
  }
}
