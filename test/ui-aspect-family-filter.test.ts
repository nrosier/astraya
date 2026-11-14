/**
 * Aspect-family filters and consultation presets (#1063): family membership, the orb cap and the preset contents.
 */
import { describe, expect, it } from 'vitest';
import { aspectTone } from '../src/astrology/aspects.js';
import {
  ASPECT_FAMILIES,
  CATALOGUE_KEYS,
  CONSULTATION_PRESETS,
  FILTERABLE_FAMILIES,
  isContactShown,
  isMajorAspect,
  orbCapFor,
  presetTones,
  toggleFamily,
  type AspectFamilyKey,
} from '../src/ui/aspect-family-filter.js';

const none = new Set<AspectFamilyKey>();
const trine = { aKey: 'sun', bKey: 'moon', aspectKey: 'trine', orb: 4 };

describe('aspect families', () => {
  it('name only aspects the catalogue holds, each in one family', () => {
    const all = ASPECT_FAMILIES.flatMap((family) => family.aspectKeys);
    for (const key of all) expect(CATALOGUE_KEYS).toContain(key);
    expect(new Set(all).size).toBe(all.length);
  });

  it('hold the recorded angles', () => {
    const keys = (name: AspectFamilyKey): readonly string[] =>
      ASPECT_FAMILIES.find((f) => f.key === name)?.aspectKeys ?? [];
    expect(keys('major')).toEqual(['conjunction', 'sextile', 'square', 'trine', 'opposition']);
    expect(keys('hardMinor')).toEqual(['semisquare', 'sesquiquadrate', 'quincunx', 'semisextile']);
    expect(keys('softMinor')).toEqual(['quintile', 'biquintile']);
    // Own family, apart from the quintile series (#1184).
    // Derived from the catalogue family (#1532), so the order is catalogue order; membership is what is pinned.
    expect([...keys('higherHarmonic')].sort()).toEqual(['decile', 'novile', 'septile']);
  });

  it('offer the higher-harmonic family as a filter and show its three aspects when it is chosen (#1184)', () => {
    expect(FILTERABLE_FAMILIES.map((f) => f.key)).toContain('higherHarmonic');
    for (const aspectKey of ['decile', 'septile', 'novile']) {
      const contact = { aKey: 'sun', bKey: 'moon', aspectKey };
      expect(isContactShown(contact, new Set<AspectFamilyKey>(['higherHarmonic']))).toBe(true);
      expect(isContactShown(contact, new Set<AspectFamilyKey>(['softMinor']))).toBe(false);
      expect(isContactShown(contact, new Set<AspectFamilyKey>(['major']))).toBe(false);
      expect(isMajorAspect(aspectKey)).toBe(false);
    }
    expect(
      isContactShown(
        { aKey: 'sun', bKey: 'moon', aspectKey: 'quintile' },
        new Set<AspectFamilyKey>(['higherHarmonic']),
      ),
    ).toBe(false);
  });

  it('offer no filter for parallels, which neither the wheel nor the matrix draws', () => {
    expect(FILTERABLE_FAMILIES.map((f) => f.key)).not.toContain('parallels');
  });
});

describe('isContactShown', () => {
  it('shows everything with no family and no cap (the default view)', () => {
    expect(isContactShown(trine, none)).toBe(true);
    expect(isContactShown({ ...trine, aspectKey: 'quintile', orb: 9 }, none)).toBe(true);
  });

  it('keeps only the selected families', () => {
    const major = new Set<AspectFamilyKey>(['major']);
    expect(isContactShown(trine, major)).toBe(true);
    expect(isContactShown({ ...trine, aspectKey: 'quincunx' }, major)).toBe(false);
  });

  it('adds contacts to nodes and angles for the nodal and angular family, whatever the aspect', () => {
    const families = new Set<AspectFamilyKey>(['nodalAngular']);
    expect(isContactShown({ aKey: 'venus', bKey: 'asc', aspectKey: 'quincunx' }, families)).toBe(true);
    expect(isContactShown({ aKey: 'venus', bKey: 'mars', aspectKey: 'quincunx' }, families)).toBe(false);
  });

  it('hides a contact wider than the cap, using the luminary cap for a pair with the Sun or Moon', () => {
    const caps = { luminary: 3, planet: 2 };
    expect(isContactShown(trine, none, caps)).toBe(false);
    expect(isContactShown({ ...trine, orb: 3 }, none, caps)).toBe(true);
    expect(isContactShown({ aKey: 'mars', bKey: 'venus', aspectKey: 'trine', orb: 2.5 }, none, caps)).toBe(false);
    expect(orbCapFor('mars', 'venus', caps)).toBe(2);
  });
});

describe('toggleFamily', () => {
  it('returns a new set and leaves the old one alone', () => {
    const on = toggleFamily(none, 'major', true);
    expect(on.has('major')).toBe(true);
    expect(none.size).toBe(0);
    expect(toggleFamily(on, 'major', false).size).toBe(0);
  });
});

describe('consultation presets', () => {
  it('are the four recorded, with the recorded families and orbs', () => {
    const byKey = new Map(CONSULTATION_PRESETS.map((p) => [p.key, p]));
    expect(byKey.get('standardOverview')).toMatchObject({
      families: ['major', 'nodalAngular'],
      orbs: { luminary: 8, planet: 6 },
    });
    expect(byKey.get('natalCore')).toMatchObject({
      families: ['major', 'parallels'],
      orbs: { luminary: 7, planet: 5 },
    });
    expect(byKey.get('predictiveTiming')?.families).toEqual(['major', 'hardMinor']);
    expect(byKey.get('dynamicSynastry')).toMatchObject({
      families: ['major', 'nodalAngular'],
      orbs: { luminary: 6, planet: 6 },
    });
    expect(CONSULTATION_PRESETS).toHaveLength(4);
  });

  it('switch on the tone pills of the aspects their families name, and no preset switches all on (#1532)', () => {
    const tones = (key: string | undefined) => [...presetTones(CONSULTATION_PRESETS.find((p) => p.key === key))].sort();
    // Owner decision on #1532 (2026-11-14), "Follow listed aspects": nodes and angles name no aspect, so add no tone.
    expect(tones('standardOverview')).toEqual(['hard', 'soft']);
    expect(tones('natalCore')).toEqual(['hard', 'soft']);
    expect(tones('dynamicSynastry')).toEqual(['hard', 'soft']);
    expect(tones('predictiveTiming')).toEqual(['hard', 'minor', 'soft']);
    expect(tones(undefined)).toEqual(['hard', 'minor', 'soft']);
  });
});

describe('what presets say and hide (#1190)', () => {
  const preset = (key: string) => CONSULTATION_PRESETS.find((candidate) => candidate.key === key);

  it('asks for the Time Lord and profection lines in Standard Overview and Predictive and Timing only', () => {
    expect(
      CONSULTATION_PRESETS.filter((candidate) => candidate.switches?.timeLords === true).map(
        (candidate) => candidate.key,
      ),
    ).toEqual(['standardOverview', 'predictiveTiming']);
  });

  it('hides minor natal aspects in Predictive and Timing only', () => {
    expect(
      CONSULTATION_PRESETS.filter((candidate) => candidate.switches?.suppressMinorNatal === true).map(
        (candidate) => candidate.key,
      ),
    ).toEqual(['predictiveTiming']);
    expect(preset('natalCore')?.switches?.suppressMinorNatal).toBeUndefined();
  });

  it('counts only the five Ptolemaic aspects as major', () => {
    for (const key of ['conjunction', 'sextile', 'square', 'trine', 'opposition'])
      expect(isMajorAspect(key)).toBe(true);
    for (const key of ['semisquare', 'sesquiquadrate', 'quincunx', 'semisextile', 'quintile', 'biquintile']) {
      expect(isMajorAspect(key)).toBe(false);
    }
  });

  // The hand-written #1063 minor groups are not derived from tone (owner decision Q7); this only forbids a member of
  // the wrong tone, so a soft aspect cannot enter hardMinor and a hard aspect cannot enter softMinor (#1532).
  it('keep a soft-tone aspect out of hardMinor and a hard-tone aspect out of softMinor (#1532)', () => {
    const keys = (name: AspectFamilyKey): readonly string[] =>
      ASPECT_FAMILIES.find((f) => f.key === name)?.aspectKeys ?? [];
    for (const aspectKey of keys('hardMinor')) expect(aspectTone(aspectKey), aspectKey).not.toBe('soft');
    for (const aspectKey of keys('softMinor')) expect(aspectTone(aspectKey), aspectKey).not.toBe('hard');
  });
});
