import { describe, expect, it } from 'vitest';
import { diffWords } from '../src/domain/text-diff.js';

describe('diffWords (#1338)', () => {
  it('reports identical text as one unchanged segment', () => {
    expect(diffWords('the sun shines', 'the sun shines')).toEqual([{ kind: 'same', text: 'the sun shines' }]);
  });

  it('marks an added word', () => {
    expect(diffWords('the sun', 'the bright sun')).toEqual([
      { kind: 'same', text: 'the' },
      { kind: 'added', text: 'bright' },
      { kind: 'same', text: 'sun' },
    ]);
  });

  it('marks a removed word', () => {
    expect(diffWords('the bright sun', 'the sun')).toEqual([
      { kind: 'same', text: 'the' },
      { kind: 'removed', text: 'bright' },
      { kind: 'same', text: 'sun' },
    ]);
  });

  it('shows a replaced word as a removal followed by an addition', () => {
    expect(diffWords('a calm sea', 'a rough sea')).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'removed', text: 'calm' },
      { kind: 'added', text: 'rough' },
      { kind: 'same', text: 'sea' },
    ]);
  });

  it('merges a replaced phrase into one removal and one addition', () => {
    expect(diffWords('x one two y', 'x three four y')).toEqual([
      { kind: 'same', text: 'x' },
      { kind: 'removed', text: 'one two' },
      { kind: 'added', text: 'three four' },
      { kind: 'same', text: 'y' },
    ]);
  });

  it('treats an empty old text as all added', () => {
    expect(diffWords('', 'brand new text')).toEqual([{ kind: 'added', text: 'brand new text' }]);
  });

  it('treats an empty new text as all removed, and two empty texts as nothing', () => {
    expect(diffWords('old text', '')).toEqual([{ kind: 'removed', text: 'old text' }]);
    expect(diffWords('', '')).toEqual([]);
  });

  it('ignores differences in whitespace', () => {
    expect(diffWords('a  b\n c', 'a b c')).toEqual([{ kind: 'same', text: 'a b c' }]);
  });

  it('falls back to a whole replacement for very long texts', () => {
    const long = Array.from({ length: 2500 }, (_, n) => `w${String(n)}`).join(' ');
    expect(diffWords(long, `${long} extra`)).toEqual([
      { kind: 'removed', text: long },
      { kind: 'added', text: `${long} extra` },
    ]);
  });
});
