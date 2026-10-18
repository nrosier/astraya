/**
 * @module interpretation/sabian-split
 * @purpose Splits a degree-symbol (Sabian) paragraph into the traditional image and the reading of it (#653), so the two can be set apart on screen and in the PDF.
 * @conventions Pure, no locale or ephemeris. The corpus stores each entry as one flat string whose first sentence is the image and whose remaining sentences are the reading; every committed English and Dutch entry has that shape, so the split is at the first sentence end and the corpus itself is untouched. A text with a single sentence has no reading to set apart and comes back as an image alone, so nothing is ever dropped or invented.
 * @exports splitSabianText, SabianParts
 */

export interface SabianParts {
  /** The first sentence: what the symbol shows. */
  readonly image: string;
  /** Everything after it, or `undefined` when the text is a single sentence. */
  readonly insight: string | undefined;
}

/**
 * The first sentence ends at the first `.`, `!` or `?` (with any closing quote or bracket after it) that is followed
 * by whitespace. A full stop inside a word or number ("3.5") has no whitespace after it and does not end it.
 */
const FIRST_SENTENCE = /^([\s\S]*?[.!?]["”’)\]]*)\s+([\s\S]+)$/;

export function splitSabianText(text: string): SabianParts {
  const trimmed = text.trim();
  const match = FIRST_SENTENCE.exec(trimmed);
  if (match === null) return { image: trimmed, insight: undefined };
  const [, image, insight] = match;
  if (image === undefined || insight === undefined || insight.trim() === '')
    return { image: trimmed, insight: undefined };
  return { image, insight: insight.trim() };
}
