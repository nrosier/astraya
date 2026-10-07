/**
 * The short description the model writes for each Tier 2 interpretation (#423) — a few words
 * naming what was asked ("Short and warm with focus on family") that labels the entry in the
 * reader's history.
 *
 * It is model output built partly from the reader's own text, so it is untrusted: it is shown as
 * plain text, held to the same rules an allowed instruction is (`checkCustomPrompt`: no
 * redirection of the model, no date or coordinate, no fatalistic or medical/legal/financial
 * wording), kept to a few words and one line, and **fails closed** — anything that does not pass
 * is dropped (`null`), and the history then shows just the kind of interpretation, as it did
 * before descriptions existed.
 */

/**
 * @module description
 * @purpose Validates and sanitizes the short, model-written label attached to a saved Tier 2 interpretation result, for display in the reader's history.
 * @conventions Fails closed: untrusted model output that doesn't pass every check (length, word count, forbidden markup/link characters, the same `checkCustomPrompt` guardrail an allowed instruction must pass) is dropped to `null` rather than shown, falling back to naming just the kind of interpretation.
 * @exports MAX_DESCRIPTION_WORDS, MAX_DESCRIPTION_LENGTH, sanitizeDescription
 */
import { checkCustomPrompt } from '../../src/interpretation/prompt-guardrail.ts';

/** "A few words": generous enough for "Short and warm with focus on family", too short to smuggle a paragraph. */
export const MAX_DESCRIPTION_WORDS = 8;
export const MAX_DESCRIPTION_LENGTH = 60;

/** Characters that have no place in a plain-text label: markup, templating, code and link syntax. */
const FORBIDDEN_CHARACTERS = /[<>{}[\]`|\\]|https?:|www\.|@\w/i;

/** `null` when the model gave nothing usable. */
export function sanitizeDescription(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw
    // eslint-disable-next-line no-control-regex -- control characters (newlines, tabs, NULs) are exactly what is being removed
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    // The model sometimes quotes the label or ends it with a full stop.
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .replace(/[.。]+$/, '')
    .trim();
  if (cleaned === '' || cleaned.length > MAX_DESCRIPTION_LENGTH) return null;
  if (cleaned.split(' ').length > MAX_DESCRIPTION_WORDS) return null;
  if (FORBIDDEN_CHARACTERS.test(cleaned)) return null;
  if (checkCustomPrompt(cleaned).length > 0) return null;
  return cleaned;
}
