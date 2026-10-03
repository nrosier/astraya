/**
 * The transit importance rules (#416), against a real transit chart (1 Jan 1970 natal, the sky of
 * 8 April 2024). Expectations are hand-written predicates over the raw contacts, and scores are
 * worked out by hand from the stated weights, not read back from the module under test.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { ASPECTS, type Aspect } from '../src/astrology/aspects.js';
import { BODIES, bodyById, bodyByKey } from '../src/astrology/bodies.js';
import {
  TRANSIT_ORB_CONFIG,
  chartRulerKeyOf,
  filterTransits,
  orbLimitFor,
  presetOf,
  rankTransits,
  transitImportance,
  transitPreset,
  type TransitFilter,
  type TransitRuleContext,
} from '../src/astrology/transit-importance.js';
import { computeTransit, type TransitData } from '../src/domain/transit.js';
import { getEngine } from './engine-harness.js';

let transit: TransitData;
let contacts: readonly Aspect[];
let rulerKey: string | undefined;

const EVERY = BODIES.map((body) => body.key);
const keyOf = (id: number): string => bodyById(id)?.key ?? '';
const rules = (context: 'daily' | 'yearly', chartRulerKey?: string): TransitRuleContext => ({
  everyBodyKey: EVERY,
  context,
  chartRulerKey,
});
const OUTER = ['jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];
const PERSONAL = ['sun', 'moon', 'mercury', 'venus', 'mars'];
const MAJORS = ['conjunction', 'sextile', 'square', 'trine', 'opposition'];
const MINORS = ['semisquare', 'sesquiquadrate', 'quincunx'];
/** Traditional rulers by sign, written out here rather than imported. */
const TRADITIONAL_RULER = [
  'mars',
  'venus',
  'mercury',
  'moon',
  'sun',
  'mercury',
  'venus',
  'mars',
  'jupiter',
  'saturn',
  'saturn',
  'jupiter',
];

beforeAll(async () => {
  const engine = await getEngine();
  const target = await engine.julianDayFromUtc(2024, 4, 8, 12, 0, 0);
  transit = await computeTransit(
    {
      civil: { year: 1970, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
      coordinates: { latitude: 41.1833, longitude: -84.7333 },
      zoneOverride: 'America/New_York',
    },
    target,
    engine,
    {},
    TRANSIT_ORB_CONFIG,
  );
  contacts = transit.contacts;
  rulerKey = TRADITIONAL_RULER[Math.floor(transit.natal.houses.ascendant / 30)];
}, 60_000);

/** A hand-built contact, for the weights. */
function contact(transiting: string, natal: string, aspectKey: string, orb: number, applying: boolean): Aspect {
  const aspect = ASPECTS.find((candidate) => candidate.key === aspectKey);
  const a = bodyByKey(transiting);
  const b = bodyByKey(natal);
  if (aspect === undefined || a === undefined || b === undefined) throw new Error('fixture bug');
  return { bodyA: a.id, bodyB: b.id, aspect, separation: aspect.angle + orb, orb, applying };
}

describe('the real transit fixture', () => {
  it('includes minor aspects, so the Minor toggle has something to hide', () => {
    expect(contacts.some((c) => MINORS.includes(c.aspect.key))).toBe(true);
    expect(rulerKey).toBeDefined();
  });
});

describe('transit presets (#416)', () => {
  it('the daily default is the stated rule: fast bodies within 1.5° (Moon 1°), slow planets only within 1°, to the personal planets and the chart ruler, by the five majors', () => {
    const natal = [...PERSONAL, ...(rulerKey !== undefined && !PERSONAL.includes(rulerKey) ? [rulerKey] : [])];
    const expected = contacts.filter((c) => {
      const t = keyOf(c.bodyA);
      const limit = t === 'moon' ? 1 : OUTER.includes(t) ? 1 : 1.5;
      return (
        [...PERSONAL, ...OUTER].includes(t) &&
        natal.includes(keyOf(c.bodyB)) &&
        MAJORS.includes(c.aspect.key) &&
        c.orb <= limit
      );
    });
    const shown = filterTransits(contacts, transitPreset('important', rules('daily', rulerKey)));
    expect(shown).toEqual(expected);
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.length).toBeLessThan(contacts.length);
  });

  it('the chart ruler is added to the daily natal targets when it is not already a personal planet', () => {
    const filter = transitPreset('important', rules('daily', 'saturn'));
    expect(filter.natal).toContain('saturn');
    expect(transitPreset('important', rules('daily', 'sun')).natal).toEqual(PERSONAL);
    expect(transitPreset('important', rules('daily')).natal).toEqual(PERSONAL);
  });

  it('the yearly default is the stated rule: Jupiter–Pluto and Chiron to the planets and nodes by the majors within 3.5°', () => {
    const natal = [...PERSONAL, ...OUTER, 'meanNode', 'trueNode'];
    const expected = contacts.filter(
      (c) =>
        [...OUTER, 'chiron'].includes(keyOf(c.bodyA)) &&
        (natal.includes(keyOf(c.bodyB)) || keyOf(c.bodyB) === rulerKey) &&
        MAJORS.includes(c.aspect.key) &&
        c.orb <= 3.5,
    );
    const shown = filterTransits(contacts, transitPreset('important', rules('yearly', rulerKey)));
    expect(shown).toEqual(expected);
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.length).toBeLessThan(contacts.length);
  });

  it('the two important defaults differ: the daily one has no slow-planet contact wider than 1°, the yearly one allows 3.5°', () => {
    const daily = transitPreset('important', rules('daily', rulerKey));
    const yearly = transitPreset('important', rules('yearly', rulerKey));
    expect(orbLimitFor(daily, 'saturn')).toBe(1);
    expect(orbLimitFor(yearly, 'saturn')).toBe(3.5);
    expect(orbLimitFor(daily, 'moon')).toBe(1);
    expect(orbLimitFor(daily, 'mars')).toBe(1.5);
    expect(daily.transiting).toContain('moon');
    expect(yearly.transiting).not.toContain('moon');
    expect(yearly.transiting).toContain('chiron');
  });

  it('"all" restores the whole list, minor aspects included', () => {
    expect(filterTransits(contacts, transitPreset('all', rules('daily')))).toEqual(contacts);
  });

  it('the outer and personal presets keep every contact by those transiting bodies, and nothing else', () => {
    expect(filterTransits(contacts, transitPreset('outer', rules('daily')))).toEqual(
      contacts.filter((c) => OUTER.includes(keyOf(c.bodyA)) && MAJORS.includes(c.aspect.key)),
    );
    expect(filterTransits(contacts, transitPreset('personal', rules('daily')))).toEqual(
      contacts.filter((c) => PERSONAL.includes(keyOf(c.bodyA)) && MAJORS.includes(c.aspect.key)),
    );
  });

  it('applying-only drops separating contacts, and only those', () => {
    const base = transitPreset('all', rules('daily'));
    const shown = filterTransits(contacts, { ...base, applyingOnly: true });
    expect(shown).toEqual(contacts.filter((c) => c.applying));
    expect(shown.length).toBeLessThan(contacts.length);
    expect(shown.length).toBeGreaterThan(0);
  });
});

describe('orb sensitivity and aspect groups (#416)', () => {
  it('tight caps every limit at 1.5°, balanced leaves them, wide lifts them to at least 5° (never past 10°)', () => {
    const yearly = transitPreset('important', rules('yearly'));
    expect(orbLimitFor({ ...yearly, orbSensitivity: 'tight' }, 'saturn')).toBe(1.5);
    expect(orbLimitFor({ ...yearly, orbSensitivity: 'balanced' }, 'saturn')).toBe(3.5);
    expect(orbLimitFor({ ...yearly, orbSensitivity: 'wide' }, 'saturn')).toBe(5);
    const daily = transitPreset('important', rules('daily'));
    expect(orbLimitFor({ ...daily, orbSensitivity: 'tight' }, 'moon')).toBe(1);
    expect(orbLimitFor({ ...daily, orbSensitivity: 'wide' }, 'moon')).toBe(5);
    const all = transitPreset('all', rules('daily'));
    expect(orbLimitFor({ ...all, orbSensitivity: 'wide' }, 'sun')).toBe(10);
  });

  it('a tighter scale never shows more, and a wider one never shows less', () => {
    const base = transitPreset('important', rules('yearly', rulerKey));
    const tight = filterTransits(contacts, { ...base, orbSensitivity: 'tight' });
    const balanced = filterTransits(contacts, base);
    const wide = filterTransits(contacts, { ...base, orbSensitivity: 'wide' });
    expect(tight.length).toBeLessThanOrEqual(balanced.length);
    expect(wide.length).toBeGreaterThanOrEqual(balanced.length);
    expect(tight.every((c) => c.orb <= 1.5)).toBe(true);
    expect(wide.some((c) => c.orb > 3.5)).toBe(true);
  });

  it('a contact exactly at its limit stays', () => {
    const base = transitPreset('all', rules('daily'));
    const edge = contacts[0];
    if (edge === undefined) throw new Error('fixture bug');
    expect(filterTransits([edge], { ...base, maxOrb: edge.orb })).toEqual([edge]);
    expect(filterTransits([edge], { ...base, maxOrb: edge.orb - 0.001 })).toEqual([]);
  });

  it('shows minor aspects only when the aspect list includes them', () => {
    const base = transitPreset('all', rules('daily'));
    const withMinors = filterTransits(contacts, base);
    const hard = filterTransits(contacts, { ...base, aspects: ['conjunction', 'square', 'opposition'] });
    expect(withMinors.some((c) => MINORS.includes(c.aspect.key))).toBe(true);
    expect(hard.every((c) => ['conjunction', 'square', 'opposition'].includes(c.aspect.key))).toBe(true);
    expect(hard.length).toBeGreaterThan(0);
  });

  it('names the preset a filter equals, and nothing for a custom filter', () => {
    for (const context of ['daily', 'yearly'] as const) {
      for (const preset of ['important', 'outer', 'personal', 'all'] as const) {
        const r = rules(context, 'saturn');
        expect(presetOf(transitPreset(preset, r), r)).toBe(preset);
      }
    }
    const custom: TransitFilter = { ...transitPreset('important', rules('daily')), orbSensitivity: 'wide' };
    expect(presetOf(custom, rules('daily'))).toBeUndefined();
  });
});

describe('the chart ruler (#416)', () => {
  it('is the traditional ruler of the Ascendant’s sign', () => {
    expect(chartRulerKeyOf(15)).toBe('mars'); // Aries
    expect(chartRulerKeyOf(75)).toBe('mercury'); // Gemini
    expect(chartRulerKeyOf(225)).toBe('mars'); // Scorpio (traditional)
    expect(chartRulerKeyOf(315)).toBe('saturn'); // Aquarius (traditional)
    expect(chartRulerKeyOf(-15)).toBe('jupiter'); // 345°, Pisces
    expect(chartRulerKeyOf(Number.NaN)).toBeUndefined();
  });

  it('agrees with the fixture chart’s own Ascendant', () => {
    expect(chartRulerKeyOf(transit.natal.houses.ascendant)).toBe(rulerKey);
  });
});

describe('transit score (#416)', () => {
  const yearly = transitPreset('important', rules('yearly'));
  const daily = transitPreset('important', rules('daily'));

  it('is the product of the stated weights: Pluto conjunct the natal Sun, exact and separating, is 1.0 × 1.3 × 1.0 × 1', () => {
    expect(transitImportance(contact('pluto', 'sun', 'conjunction', 0, false), yearly)).toBeCloseTo(1.3, 10);
  });

  it('shrinks with the orb: half the limit halves it (Saturn square Moon at 1.75° of 3.5° is 0.85 × 1.3 × 1.0 × 0.5)', () => {
    expect(transitImportance(contact('saturn', 'moon', 'square', 1.75, false), yearly)).toBeCloseTo(0.5525, 10);
  });

  it('is nothing at the edge of the limit', () => {
    expect(transitImportance(contact('saturn', 'moon', 'square', 3.5, false), yearly)).toBe(0);
  });

  it('uses the limit of the transiting body: the same 0.5° orb scores less for the Moon (limit 1°) than for Mars (limit 1.5°)', () => {
    // Moon: 0.15 × 1.3 × 1.0 × (1 − 0.5/1) = 0.0975; Mars: 0.6 × 1.3 × 1.0 × (1 − 0.5/1.5).
    expect(transitImportance(contact('moon', 'sun', 'conjunction', 0.5, false), daily)).toBeCloseTo(0.0975, 10);
    expect(transitImportance(contact('mars', 'sun', 'conjunction', 0.5, false), daily)).toBeCloseTo(0.52, 10);
  });

  it('adds 15% while applying', () => {
    const separating = transitImportance(contact('jupiter', 'sun', 'conjunction', 1, false), yearly);
    expect(transitImportance(contact('jupiter', 'sun', 'conjunction', 1, true), yearly)).toBeCloseTo(
      separating * 1.15,
      10,
    );
  });

  it('weighs the chart ruler above the Sun and Moon: Venus as ruler is 1.5, otherwise 1.0', () => {
    const c = contact('pluto', 'venus', 'conjunction', 0, false);
    expect(transitImportance(c, yearly, 'venus')).toBeCloseTo(1.5, 10);
    expect(transitImportance(c, yearly)).toBeCloseTo(1.0, 10);
  });

  it('weighs natal Jupiter–Pluto at 0.7 and the nodes at 0.5', () => {
    expect(transitImportance(contact('pluto', 'saturn', 'conjunction', 0, false), yearly)).toBeCloseTo(0.7, 10);
    expect(transitImportance(contact('pluto', 'meanNode', 'conjunction', 0, false), yearly)).toBeCloseTo(0.5, 10);
  });

  it('weighs aspects: hard 1.0, soft 0.7, minor 0.4', () => {
    const score = (key: string): number =>
      transitImportance(contact('pluto', 'venus', key, 0, false), { ...yearly, aspects: [...MAJORS, ...MINORS] });
    expect(score('square')).toBeCloseTo(1, 10);
    expect(score('trine')).toBeCloseTo(0.7, 10);
    expect(score('semisquare')).toBeCloseTo(0.4, 10);
  });

  it('orders a real transit list best-first, without losing or inventing a contact', () => {
    const filter = transitPreset('all', rules('daily', rulerKey));
    const ranked = rankTransits(contacts, filter, rulerKey);
    expect(ranked).toHaveLength(contacts.length);
    expect(new Set(ranked)).toEqual(new Set(contacts));
    const scores = ranked.map((c) => transitImportance(c, filter, rulerKey));
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });
});
