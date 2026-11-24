/**
 * The practitioner-input list for a horary judgment (#1960, PR B): which of the six closed keys a judgment emits,
 * the `alsoApplies` field that feeds `rule-order` without changing the chosen kind, and the display text per key.
 */
import { describe, expect, it } from 'vitest';
import type { Aspect } from '../src/astrology/aspects.js';
import { bodyByKey } from '../src/astrology/bodies.js';
import { horaryConsiderations } from '../src/astrology/horary.js';
import {
  HORARY_PRACTITIONER_KEYS,
  HORARY_PRACTITIONER_REASONS,
  judgePerfection,
  practitionerInputFor,
  type HoraryJudgment,
  type HoraryPractitionerKey,
  type PerfectionResult,
} from '../src/domain/horary-judgment.js';
import { horaryViewMessages } from '../src/ui/HoraryView.messages.js';

const id = (key: string): number => {
  const body = bodyByKey(key)?.id;
  if (body === undefined) throw new Error(`fixture: ${key}`);
  return body;
};
const SUN = id('sun');
const MOON = id('moon');
const MERCURY = id('mercury');
const VENUS = id('venus');

function aspect(bodyA: number, bodyB: number, applying: boolean, orb = 1): Aspect {
  return {
    bodyA,
    bodyB,
    aspect: { key: 'trine', name: 'Trine', angle: 120, family: 'major', tone: 'soft' },
    separation: 120 + orb,
    orb,
    allowedOrb: 8,
    applying,
  };
}

/** A judgment around a perfection result; the considerations come from the real rule, so the late flag is the real one. */
function judgmentOf(
  perfection: PerfectionResult,
  input: { ascendant?: number; saturnHouse?: number } = {},
): HoraryJudgment {
  const considerations = horaryConsiderations({
    ascendant: input.ascendant ?? 100,
    moonLongitude: 10,
    saturnHouse: input.saturnHouse,
    moonIsVoid: false,
  });
  return {
    querent: { house: 1, ruler: SUN, rulerKey: 'sun' },
    quesited: { house: 7, ruler: MOON, rulerKey: 'moon' },
    perfection,
    reception: { kind: 'none', aFromB: [], bFromA: [], sameDignityType: false },
    receptionAidsPerfection: false,
    considerations,
    radical: !considerations.some((c) => c.applies && !c.softened),
  };
}

const keysOf = (judgment: HoraryJudgment, saturnHouse?: number): readonly HoraryPractitionerKey[] =>
  practitionerInputFor(judgment, saturnHouse).map((input) => input.key);

const NONE: PerfectionResult = { kind: 'none' };
const DIRECT: PerfectionResult = { kind: 'directAspect', aspect: aspect(SUN, MOON, true) };

describe('practitionerInputFor, one key at a time', () => {
  it('emits nothing for a radical chart that does not perfect', () => {
    expect(practitionerInputFor(judgmentOf(NONE), undefined)).toEqual([]);
  });

  it('non-radical-chart: emitted when radical is false, not when true', () => {
    expect(keysOf(judgmentOf(NONE, { ascendant: 30 + 1 }))).toEqual(['non-radical-chart']);
    expect(keysOf(judgmentOf(NONE, { ascendant: 100 }))).toEqual([]);
  });

  it('late-ascendant-limit: emitted at exactly 27.0 and at 28, not at 26.999 or in the early window', () => {
    expect(keysOf(judgmentOf(NONE, { ascendant: 60 + 27 }))).toContain('late-ascendant-limit');
    expect(keysOf(judgmentOf(NONE, { ascendant: 60 + 28 }))).toContain('late-ascendant-limit');
    expect(keysOf(judgmentOf(NONE, { ascendant: 60 + 26.999 }))).not.toContain('late-ascendant-limit');
    expect(keysOf(judgmentOf(NONE, { ascendant: 60 + 1 }))).not.toContain('late-ascendant-limit');
  });

  it('house-by-exact-cusp: emitted when Saturn is in house 6 or 7, not in 5 or 8 or when houses are missing', () => {
    expect(keysOf(judgmentOf(NONE), 6)).toEqual(['house-by-exact-cusp']);
    expect(keysOf(judgmentOf(NONE), 7)).toEqual(['house-by-exact-cusp']);
    expect(keysOf(judgmentOf(NONE), 5)).toEqual([]);
    expect(keysOf(judgmentOf(NONE), 8)).toEqual([]);
    expect(keysOf(judgmentOf(NONE), undefined)).toEqual([]);
  });

  it('perfection-orbs: emitted for every perfection kind but none', () => {
    expect(keysOf(judgmentOf(DIRECT))).toEqual(['perfection-orbs']);
    expect(keysOf(judgmentOf({ kind: 'translation', thirdBody: MERCURY }))).toEqual(['perfection-orbs']);
    expect(keysOf(judgmentOf(NONE))).toEqual([]);
  });

  it('sign-change: emitted only when the chosen kind is signChange', () => {
    expect(keysOf(judgmentOf({ kind: 'signChange', aspect: aspect(SUN, MOON, true), impedimentBody: SUN }))).toEqual([
      'perfection-orbs',
      'sign-change',
    ]);
    expect(keysOf(judgmentOf({ kind: 'refranation', aspect: aspect(SUN, MOON, true), impedimentBody: SUN }))).toEqual([
      'perfection-orbs',
    ]);
  });

  it('rule-order: emitted when two direct-aspect rules hold, or translation and collection both hold, not for one', () => {
    const base = { aspect: aspect(SUN, MOON, true), impedimentBody: SUN };
    expect(keysOf(judgmentOf({ kind: 'signChange', ...base, alsoApplies: ['refranation'] }))).toContain('rule-order');
    expect(keysOf(judgmentOf({ kind: 'refranation', ...base, alsoApplies: ['signChange'] }))).toContain('rule-order');
    expect(keysOf(judgmentOf({ kind: 'prohibition', thirdBody: MERCURY, alsoApplies: ['frustration'] }))).toContain(
      'rule-order',
    );
    expect(keysOf(judgmentOf({ kind: 'translation', thirdBody: MERCURY, alsoApplies: ['collection'] }))).toContain(
      'rule-order',
    );
    expect(keysOf(judgmentOf({ kind: 'signChange', ...base }))).not.toContain('rule-order');
    expect(keysOf(judgmentOf(DIRECT))).not.toContain('rule-order');
  });

  it('emits in the closed list order, with the reason equal to the canonical text', () => {
    const input = practitionerInputFor(
      judgmentOf(
        { kind: 'signChange', aspect: aspect(SUN, MOON, true), impedimentBody: SUN, alsoApplies: ['refranation'] },
        { ascendant: 60 + 27 },
      ),
      7,
    );
    // A late Ascendant also makes the chart not radical, so both notes appear.
    expect(input.map((entry) => entry.key)).toEqual([
      'non-radical-chart',
      'late-ascendant-limit',
      'house-by-exact-cusp',
      'perfection-orbs',
      'rule-order',
      'sign-change',
    ]);
    for (const entry of input) expect(entry.reason).toBe(HORARY_PRACTITIONER_REASONS[entry.key]);
  });
});

describe('alsoApplies, the set of rules that held (output-neutral)', () => {
  const forecast = (stations: [number, number][], signs: [number, number][]) => ({
    stationDays: new Map(stations),
    signChangeDays: new Map(signs),
  });

  it('keeps the chosen kind: a querent sign change over a quesited refranation reports signChange, refranation also', () => {
    const aspects = [aspect(SUN, MOON, true)];
    const result = judgePerfection(aspects, SUN, MOON, undefined, forecast([[MOON, 2]], [[SUN, 1]]));
    expect(result.kind).toBe('signChange');
    expect(result.impedimentBody).toBe(SUN);
    expect(result.alsoApplies).toEqual(['refranation']);
  });

  it('adds nothing when one rule holds, so the result is exactly what it was', () => {
    const aspects = [aspect(SUN, MOON, true)];
    expect(judgePerfection(aspects, SUN, MOON, undefined, forecast([], [[SUN, 1]]))).toEqual({
      kind: 'signChange',
      aspect: aspects[0],
      impedimentBody: SUN,
    });
  });

  it('records a prohibition that also frustrates, with prohibition still chosen', () => {
    const aspects = [aspect(SUN, MOON, true, 3), aspect(VENUS, SUN, true, 1)];
    const result = judgePerfection(aspects, SUN, MOON);
    expect(result.kind).toBe('prohibition');
    expect(result.alsoApplies).toEqual(['frustration']);
  });

  it('records translation with collection also holding, translation still chosen', () => {
    const aspects = [
      aspect(MERCURY, SUN, false),
      aspect(MERCURY, MOON, true),
      aspect(VENUS, SUN, true),
      aspect(VENUS, MOON, true),
    ];
    const result = judgePerfection(aspects, SUN, MOON);
    expect(result.kind).toBe('translation');
    expect(result.thirdBody).toBe(MERCURY);
    expect(result.alsoApplies).toEqual(['collection']);
  });
});

describe('the display text per key', () => {
  it('has en and nl for every key, each under 120 code points, and en equals the stored reason', () => {
    for (const key of HORARY_PRACTITIONER_KEYS) {
      const en = horaryViewMessages.en.practitioner[key];
      const nl = horaryViewMessages.nl.practitioner[key];
      expect(en, key).toBe(HORARY_PRACTITIONER_REASONS[key]);
      expect(nl.length, key).toBeGreaterThan(0);
      expect(Array.from(en).length, `${key} en`).toBeLessThan(120);
      expect(Array.from(nl).length, `${key} nl`).toBeLessThan(120);
    }
  });

  it('never says a sign change counts as perfection', () => {
    expect(HORARY_PRACTITIONER_REASONS['sign-change']).not.toMatch(/counts as perfection|is perfection/i);
  });
});
