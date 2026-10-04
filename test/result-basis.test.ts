import { describe, expect, it } from 'vitest';
import {
  isResultKind,
  kindForMode,
  parseBasis,
  RESULT_KINDS,
  type ResultBasis,
} from '../src/interpretation/result-basis.js';
import { basisLabel, kindLabel, savedKindLabel } from '../src/ui/result-basis-label.js';

const SAMPLES: Readonly<Record<(typeof RESULT_KINDS)[number], ResultBasis>> = {
  placements: { kind: 'placements', keys: ['planet-in-sign:sun:2', 'planet-in-house:moon:3'] },
  'whole-chart': { kind: 'whole-chart' },
  focus: { kind: 'focus', body: 'mars', perspective: 'natal' },
};

describe('the kinds of AI interpretation (#423)', () => {
  it('has wording for every kind in both languages, so a new kind cannot ship showing a raw id', () => {
    for (const kind of RESULT_KINDS) {
      for (const locale of ['en', 'nl'] as const) {
        const label = savedKindLabel({ mode: 'x', kind, basis: SAMPLES[kind] }, locale);
        expect(label).not.toContain(kind === 'focus' ? 'focus' : kind);
        expect(label.length).toBeGreaterThan(kindLabel(kind, locale).length);
      }
    }
  });

  it('tells the kinds apart', () => {
    const labels = RESULT_KINDS.map((kind) => savedKindLabel({ mode: 'x', kind, basis: SAMPLES[kind] }, 'en'));
    expect(new Set(labels).size).toBe(RESULT_KINDS.length);
  });

  it('says what each was based on', () => {
    expect(savedKindLabel({ mode: 'freeform', kind: 'whole-chart', basis: { kind: 'whole-chart' } }, 'en')).toBe(
      'AI interpretation of the entire chart',
    );
    expect(savedKindLabel({ mode: 'focus', kind: 'focus', basis: SAMPLES.focus }, 'en')).toBe(
      'AI interpretation of Mars (natal)',
    );
    expect(
      savedKindLabel(
        { mode: 'focus', kind: 'focus', basis: { kind: 'focus', body: 'mars', perspective: 'transit' } },
        'nl',
      ),
    ).toBe('AI-interpretatie van Mars (transit)');
    expect(savedKindLabel({ mode: 'grounded', kind: 'placements', basis: SAMPLES.placements }, 'en')).toBe(
      'Local interpretation of Sun in Gemini, Moon in the 3rd house',
    );
  });

  it('names a few placements and counts the rest', () => {
    const keys = [
      'planet-in-sign:sun:2',
      'planet-in-sign:moon:2',
      'planet-in-sign:mars:2',
      'planet-in-sign:venus:2',
      'planet-in-sign:saturn:2',
    ];
    expect(basisLabel({ kind: 'placements', keys }, 'en')).toBe(
      'Sun in Gemini, Moon in Gemini, Mars in Gemini and 2 more',
    );
  });

  it('says so for an entry saved before the basis was recorded, using its mode for the kind', () => {
    expect(savedKindLabel({ mode: 'focus', kind: null, basis: null }, 'en')).toBe(
      'AI interpretation, basis not recorded',
    );
    expect(savedKindLabel({ mode: 'synthesis' }, 'en')).toBe('AI interpretation, basis not recorded');
    expect(savedKindLabel({ mode: 'something-new' }, 'en')).toBe('something-new');
  });
});

describe('kindForMode and parseBasis', () => {
  it('maps every mode to a kind', () => {
    expect(kindForMode('grounded')).toBe('placements');
    expect(kindForMode('freeform')).toBe('whole-chart');
    expect(kindForMode('synthesis')).toBe('whole-chart');
    expect(kindForMode('focus')).toBe('focus');
    expect(kindForMode('nope')).toBeUndefined();
    expect(isResultKind('focus')).toBe(true);
    expect(isResultKind('nope')).toBe(false);
  });

  it('round-trips every kind and rejects anything else', () => {
    for (const kind of RESULT_KINDS) expect(parseBasis(JSON.stringify(SAMPLES[kind]))).toEqual(SAMPLES[kind]);
    for (const bad of [
      null,
      'not json',
      '[]',
      '{"kind":"focus","body":3}',
      '{"kind":"focus","body":"mars","perspective":"x"}',
      '{"kind":"placements","keys":[1]}',
      '{"kind":"?"}',
    ]) {
      expect(parseBasis(bad)).toBeUndefined();
    }
  });
});
