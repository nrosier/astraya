/**
 * The split of a Sabian paragraph into its image and its reading (#653). The shape it relies on (the first sentence
 * is the image) is checked against the whole committed English and Dutch corpus, not only against hand-written cases.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { splitSabianText } from '../src/interpretation/sabian-split.js';

const OWL =
  'A great owl stands perfectly still, fixed in a quiet posture of unblinking watchfulness. This image points to a disposition marked closely by envy, observing the surrounding world with a steady and measuring gaze. Rather than active motion, the stillness holds an internal fixation on what others possess, maintaining a quiet, enduring focus that measures every distinction from a fixed place.';

describe('splitSabianText', () => {
  it('splits the owl at the end of its first sentence', () => {
    const { image, insight } = splitSabianText(OWL);
    expect(image).toBe('A great owl stands perfectly still, fixed in a quiet posture of unblinking watchfulness.');
    expect(insight?.startsWith('This image points to a disposition marked closely by envy')).toBe(true);
    expect(insight?.endsWith('measures every distinction from a fixed place.')).toBe(true);
  });

  it('loses nothing: the two parts rejoin into the original text', () => {
    const { image, insight } = splitSabianText(OWL);
    expect(`${image} ${insight ?? ''}`).toBe(OWL);
  });

  it('leaves a one-sentence text as an image alone', () => {
    expect(splitSabianText('A lone figure waits.')).toEqual({ image: 'A lone figure waits.', insight: undefined });
    expect(splitSabianText('No full stop at all')).toEqual({ image: 'No full stop at all', insight: undefined });
  });

  it('does not end the sentence at a decimal point or inside a word', () => {
    const { image } = splitSabianText('A ratio of 3.5 to 1 holds. It then rests.');
    expect(image).toBe('A ratio of 3.5 to 1 holds.');
  });

  it('keeps a closing quote with the sentence it closes, and ends on ! and ?', () => {
    expect(splitSabianText('A voice says "stay." The reading follows.').image).toBe('A voice says "stay."');
    expect(splitSabianText('Who is there? An answer comes.').image).toBe('Who is there?');
    expect(splitSabianText('Behold! The reading follows.').image).toBe('Behold!');
  });

  it('trims surrounding whitespace and collapses nothing inside the reading', () => {
    expect(splitSabianText('  One. Two  three.  ')).toEqual({ image: 'One.', insight: 'Two  three.' });
  });
});

describe('the committed corpus', () => {
  for (const locale of ['en', 'nl']) {
    const entries = (
      JSON.parse(readFileSync(`src/interpretation/corpus/${locale}.json`, 'utf-8')) as { key: string; text: string }[]
    ).filter((entry) => entry.key.startsWith('degree-symbol:'));

    it(`${locale}: every one of the ${String(entries.length)} degree-symbol entries splits into an image and a reading`, () => {
      expect(entries).toHaveLength(360);
      const unsplit = entries
        .filter((entry) => splitSabianText(entry.text).insight === undefined)
        .map((entry) => entry.key);
      expect(unsplit).toEqual([]);
    });

    it(`${locale}: the image is always shorter than the reading, so the split is not landing mid-text`, () => {
      const odd = entries
        .filter((entry) => {
          const { image, insight } = splitSabianText(entry.text);
          return insight !== undefined && image.length >= insight.length;
        })
        .map((entry) => entry.key);
      expect(odd).toEqual([]);
    });
  }
});
