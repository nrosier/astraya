/**
 * `OBJECT_KEYS`/`DEFAULT_OBJECT_POLICIES`/presets (#585) — against the real engine for the
 * behavior-preservation claims, since those are exactly the kind of transcription that's easy
 * to get subtly wrong.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { bodyByKey, BODIES, OPT_IN_BODIES } from '../src/astrology/bodies.js';
import { DEFAULT_EXTENDED_SETTINGS, toChartCalculationOptions } from '../src/chart/extended-settings.js';
import {
  DEFAULT_OBJECT_POLICIES,
  OBJECT_KEYS,
  PRESET_OBJECT_POLICIES,
  type ObjectKey,
} from '../src/chart/object-policy.js';
import { computeChartData } from '../src/domain/chart-compute.js';
import type { EphemerisProvider } from '../src/ephemeris/types.js';
import type { BirthMomentInput } from '../src/time/types.js';
import { getEngine } from './engine-harness.js';

let engine: EphemerisProvider;
beforeAll(async () => {
  engine = await getEngine();
}, 60_000);

const MOMENT: BirthMomentInput = {
  civil: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, second: 0 },
  coordinates: { latitude: 38.7478, longitude: -85.0672 },
};

// Wide enough that every gated object actually lands in at least one real aspect at MOMENT —
// `chart-visibility-policy.test.ts`'s own convention for "not a vacuous fixture". Without this,
// the default (non-widened) orb config leaves trueNode/osculatingLilith/interpolatedLilith with
// zero aspects either way, so the equivalence test below would pass even if their table entries
// were wrong — the two code paths would just drift together into the same empty result.
const WIDE_ORB_CONFIG = {
  majorOrb: { base: 12, luminaryBonus: 3 },
  sextileOrb: { base: 8, luminaryBonus: 1.5 },
  minorOrb: 2.5,
  scalePercent: 0,
  enabledMinorAspects: [],
};

describe('OBJECT_KEYS', () => {
  it('is exactly every BODIES and opt-in body key plus the Vertex and the two Hellenistic lots, with no drift between the two lists', () => {
    const bodyKeys = [...BODIES, ...OPT_IN_BODIES].map((body) => body.key);
    const pointKeys: readonly ObjectKey[] = ['vertex', 'partOfFortune', 'partOfSpirit'];
    expect([...OBJECT_KEYS].sort()).toEqual([...bodyKeys, ...pointKeys].sort());
    expect(OBJECT_KEYS).toHaveLength(bodyKeys.length + pointKeys.length);
  });

  it('has no duplicate keys', () => {
    expect(new Set(OBJECT_KEYS).size).toBe(OBJECT_KEYS.length);
  });
});

describe('DEFAULT_OBJECT_POLICIES', () => {
  it('has a policy for every object key, no more and no fewer', () => {
    expect(Object.keys(DEFAULT_OBJECT_POLICIES).sort()).toEqual([...OBJECT_KEYS].sort());
  });

  it('reproduces the implicit pre-#585 aspect-participation default for every key exactly, non-vacuously (real engine)', async () => {
    // Before #585, `aspectsTo` being entirely absent/empty gave every body/point its own
    // category-driven implicit default inside chart-compute.ts itself. Explicitly supplying
    // DEFAULT_OBJECT_POLICIES' own participation values must compute identically — if the
    // hand-derived default table above drifted from the real implicit behavior, this fails.
    const implicit = await computeChartData(MOMENT, engine, { orbConfig: WIDE_ORB_CONFIG });
    const explicit = await computeChartData(MOMENT, engine, {
      orbConfig: WIDE_ORB_CONFIG,
      aspectsTo: Object.fromEntries(OBJECT_KEYS.map((key) => [key, DEFAULT_OBJECT_POLICIES[key].aspectParticipant])),
    });
    expect(explicit.positions).toEqual(implicit.positions);
    expect(explicit.aspects).toEqual(implicit.aspects);
    expect(explicit.angleAspects).toEqual(implicit.angleAspects);

    // Not a vacuous fixture: every key that defaults to participating really does land in at
    // least one aspect at MOMENT under this wide orb — otherwise a wrong `aspectParticipant`
    // value for that key couldn't have been caught by the equivalence check above.
    const bodyIdsInAspects = new Set(implicit.aspects.flatMap((aspect) => [aspect.bodyA, aspect.bodyB]));
    for (const key of OBJECT_KEYS) {
      if (!DEFAULT_OBJECT_POLICIES[key].aspectParticipant) continue;
      const id = bodyByKey(key)?.id;
      if (id === undefined) continue; // vertex/partOfFortune/partOfSpirit aren't BODIES entries
      expect(bodyIdsInAspects.has(id)).toBe(true);
    }
  });

  it('toChartCalculationOptions(DEFAULT_EXTENDED_SETTINGS) computes identically to no aspectsTo at all (real engine)', async () => {
    const bare = await computeChartData(MOMENT, engine, {});
    const viaDefaults = await computeChartData(MOMENT, engine, toChartCalculationOptions(DEFAULT_EXTENDED_SETTINGS));
    expect(viaDefaults.positions).toEqual(bare.positions);
    expect(viaDefaults.aspects).toEqual(bare.aspects);
    expect(viaDefaults.angleAspects).toEqual(bare.angleAspects);
  });

  it('spot-checks the documented per-category defaults directly', () => {
    for (const key of ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto']) {
      expect(DEFAULT_OBJECT_POLICIES[key as ObjectKey]).toEqual({ visible: true, aspectParticipant: true });
    }
    expect(DEFAULT_OBJECT_POLICIES.chiron).toEqual({ visible: true, aspectParticipant: false });
    for (const key of ['meanNode', 'trueNode', 'meanLilith', 'osculatingLilith', 'interpolatedLilith']) {
      expect(DEFAULT_OBJECT_POLICIES[key as ObjectKey]).toEqual({ visible: false, aspectParticipant: false });
    }
    for (const key of ['ceres', 'pallas', 'juno', 'vesta']) {
      expect(DEFAULT_OBJECT_POLICIES[key as ObjectKey]).toEqual({ visible: false, aspectParticipant: true });
    }
    for (const key of ['vertex', 'partOfFortune', 'partOfSpirit']) {
      expect(DEFAULT_OBJECT_POLICIES[key as ObjectKey]).toEqual({ visible: false, aspectParticipant: false });
    }
  });
});

describe('PRESET_OBJECT_POLICIES', () => {
  it('"all" makes every object visible and participating', () => {
    for (const key of OBJECT_KEYS) {
      expect(PRESET_OBJECT_POLICIES.all[key]).toEqual({ visible: true, aspectParticipant: true });
    }
  });

  it('"core" shows only the luminaries and the three closest personal planets', () => {
    const on = new Set(['sun', 'moon', 'mercury', 'venus', 'mars']);
    for (const key of OBJECT_KEYS) {
      expect(PRESET_OBJECT_POLICIES.core[key]).toEqual(
        on.has(key) ? { visible: true, aspectParticipant: true } : { visible: false, aspectParticipant: false },
      );
    }
  });

  it('"traditional" shows the seven classical planets plus the two Hellenistic lots', () => {
    const on = new Set([
      'sun',
      'moon',
      'mercury',
      'venus',
      'mars',
      'jupiter',
      'saturn',
      'partOfFortune',
      'partOfSpirit',
    ]);
    for (const key of OBJECT_KEYS) {
      expect(PRESET_OBJECT_POLICIES.traditional[key]).toEqual(
        on.has(key) ? { visible: true, aspectParticipant: true } : { visible: false, aspectParticipant: false },
      );
    }
    // Chiron, the outer three, the asteroids, nodes, Lilith and the Vertex are all off —
    // "traditional" names an object set, not a technique.
    expect(PRESET_OBJECT_POLICIES.traditional.chiron.visible).toBe(false);
    expect(PRESET_OBJECT_POLICIES.traditional.uranus.visible).toBe(false);
  });

  it('every preset covers every object key', () => {
    for (const policies of Object.values(PRESET_OBJECT_POLICIES)) {
      expect(Object.keys(policies).sort()).toEqual([...OBJECT_KEYS].sort());
    }
  });
});
