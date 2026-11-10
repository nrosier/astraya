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
});
