/**
 * @module text-diff
 * @purpose Word-level diff of an old and a new plain text, used to show a submitted correction against the text it would replace (#1338).
 * @conventions Pure and dependency-free. Words are whitespace-separated runs, so runs of spaces and line breaks are not compared and segments are meant to be re-joined with one space. A changed stretch yields its removed words first, then its added words, so a replaced word is one removal followed by one addition. Consecutive words of the same kind are merged into one segment. Past `MAX_DIFF_CELLS` the texts are shown as one removal and one addition rather than spending quadratic time.
 * @exports DiffKind, DiffSegment, diffWords
 */

export type DiffKind = 'same' | 'added' | 'removed';

export interface DiffSegment {
  readonly kind: DiffKind;
  readonly text: string;
}

/** Longest-common-subsequence table size above which the diff falls back to a whole-text replacement. */
const MAX_DIFF_CELLS = 4_000_000;

function words(text: string): readonly string[] {
  return text.split(/\s+/u).filter((word) => word !== '');
}

function pushWord(segments: DiffSegment[], kind: DiffKind, word: string): void {
  const last = segments.at(-1);
  if (last?.kind === kind) {
    segments[segments.length - 1] = { kind, text: `${last.text} ${word}` };
  } else {
    segments.push({ kind, text: word });
  }
}

/** The word-level difference that turns `oldText` into `newText`, in reading order. */
export function diffWords(oldText: string, newText: string): readonly DiffSegment[] {
  const a = words(oldText);
  const b = words(newText);
  const segments: DiffSegment[] = [];

  if ((a.length + 1) * (b.length + 1) > MAX_DIFF_CELLS) {
    if (a.length > 0) segments.push({ kind: 'removed', text: a.join(' ') });
    if (b.length > 0) segments.push({ kind: 'added', text: b.join(' ') });
    return segments;
  }

  // lcs[i][j] = length of the longest common subsequence of a[i..] and b[j..].
  const width = b.length + 1;
  const lcs = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i * width + j] =
        a[i] === b[j]
          ? (lcs[(i + 1) * width + j + 1] ?? 0) + 1
          : Math.max(lcs[(i + 1) * width + j] ?? 0, lcs[i * width + j + 1] ?? 0);
    }
  }

  let i = 0;
  let j = 0;
  let removed: string[] = [];
  let added: string[] = [];
  const flush = (): void => {
    for (const word of removed) pushWord(segments, 'removed', word);
    for (const word of added) pushWord(segments, 'added', word);
    removed = [];
    added = [];
  };
  while (i < a.length || j < b.length) {
    const aWord = a[i];
    const bWord = b[j];
    if (aWord !== undefined && aWord === bWord) {
      flush();
      pushWord(segments, 'same', aWord);
      i++;
      j++;
    } else if (
      aWord !== undefined &&
      (bWord === undefined || (lcs[(i + 1) * width + j] ?? 0) >= (lcs[i * width + j + 1] ?? 0))
    ) {
      removed.push(aWord);
      i++;
    } else if (bWord !== undefined) {
      added.push(bWord);
      j++;
    }
  }
  flush();
  return segments;
}
