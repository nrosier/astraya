// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { primaryDirectionsBasisItems, progressionBasisItems, solarArcBasisItems } from '../src/ui/timing-basis.js';
import { withBasisItems } from '../src/ui/calculation-basis.js';
import { timingBasisMessages } from '../src/ui/timing-basis.messages.js';

const LINE = 'Tropical · Placidus · Modern rulers · Standard orbs';

describe('timing basis items (#1059)', () => {
  const en = timingBasisMessages.en;
  const nl = timingBasisMessages.nl;

  it('appends items after the shared line with the same separator', () => {
    expect(withBasisItems(LINE, ...progressionBasisItems('tertiary', 'naibod', timingBasisMessages.en))).toBe(
      `${LINE} · Tertiary progression · angles recomputed at the progressed moment`,
    );
    expect(withBasisItems(LINE)).toBe(LINE);
  });

  it('names the technique and, for secondary only, the MC method', () => {
    expect(progressionBasisItems('secondary', 'naibod', en)).toEqual([
      'Secondary progression',
      'Naibod MC',
      'angles shifted by the Naibod arc, in longitude',
    ]);
    expect(progressionBasisItems('secondary', 'solarArc', en)).toEqual([
      'Secondary progression',
      'Solar arc MC',
      'angles shifted by the solar arc, in longitude',
    ]);
    expect(progressionBasisItems('tertiary', 'naibod', en)).toEqual([
      'Tertiary progression',
      'angles recomputed at the progressed moment',
    ]);
    expect(progressionBasisItems('minor', 'quotidian', nl)).toEqual([
      'Minorprogressie',
      'hoeken herberekend op het progressieve moment',
    ]);
    expect(progressionBasisItems('secondary', 'naibod', nl)[2]).toBe('hoeken verschoven met de Naibod-boog, in lengte');
  });

  it('names the solar-arc key', () => {
    expect(solarArcBasisItems(en)).toEqual(['Solar arc (the Sun’s progressed arc)', 'directed in longitude only']);
    expect(solarArcBasisItems(nl)[1]).toBe('alleen in lengte gedirigeerd');
    expect(solarArcBasisItems(nl)[0]).toContain('Zonneboog');
  });

  it('names a non-default solar arc, its multiplier and converse, and leaves the default untouched (#1407)', () => {
    const plain = { arcKind: 'solar', arcMultiplier: 1, converse: false } as const;
    expect(solarArcBasisItems(en, 'longitude', plain)).toEqual(solarArcBasisItems(en));
    expect(solarArcBasisItems(en, 'longitude', { arcKind: 'ascendant', arcMultiplier: 0.5, converse: true })).toEqual([
      'Ascendant arc (the progressed Ascendant’s arc)',
      'directed in longitude only',
      'MC by solar arc in longitude',
      '×0.5',
      'converse (backwards in time)',
    ]);
    // The Sun's own arc, multiplied: no MC derivation to mention.
    expect(solarArcBasisItems(en, 'longitude', { arcKind: 'solar', arcMultiplier: -2, converse: false })).toEqual([
      'Solar arc (the Sun’s progressed arc)',
      'directed in longitude only',
      '×−2',
    ]);
    // Dutch decimal comma, and every multiplier has a word in both languages.
    expect(solarArcBasisItems(nl, 'longitude', { arcKind: 'vertex', arcMultiplier: -0.5, converse: false })).toEqual([
      'Vertexboog (de boog van de geprogresseerde Vertex)',
      'alleen in lengte gedirigeerd',
      'MC per zonneboog in lengte',
      '×−0,5',
    ]);
    for (const multiplier of [1, 2, 0.5, -1, -2, -0.5] as const) {
      expect(en.arcMultipliers[String(multiplier) as keyof typeof en.arcMultipliers]).toBeDefined();
      expect(nl.arcMultipliers[String(multiplier) as keyof typeof nl.arcMultipliers]).toBeDefined();
    }
    // Declination takes none of the arc options, so none is named.
    expect(solarArcBasisItems(en, 'declination', { arcKind: 'ascendant', arcMultiplier: 2, converse: true })).toEqual([
      'Solar arc (the Sun’s progressed arc)',
      'directed in declination',
    ]);
  });

  it('names the primary-direction key and semi-arc method', () => {
    expect(primaryDirectionsBasisItems('naibod', 'zodiacal', en)).toEqual([
      'Naibod key',
      'Placidus semi-arcs, in zodiaco',
      '±1° of arc',
    ]);
    expect(primaryDirectionsBasisItems('ptolemy', 'in-mundo', nl)).toEqual([
      'Ptolemaeus-sleutel',
      'Placidus-semiboog, in mundo',
      '±1° boog',
    ]);
  });

  it('names the true-solar-arc key in en and nl (#1795)', () => {
    expect(en.directionKeys['true-solar-arc']).toBe('True solar arc in RA key');
    expect(nl.directionKeys['true-solar-arc']).toBe('Ware zonneboog in RK-sleutel');
  });
});
