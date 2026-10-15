/**
 * End-to-end regression for #542's acceptance criterion, against the real engine: toggling a
 * point off removes it from the wheel, the aspect list, and the aspect matrix simultaneously —
 * even when it was still a real aspect candidate at compute time (`aspectsTo*: true`).
 */
import { describe, expect, it } from 'vitest';
import { bodyByKey } from '../src/astrology/bodies.js';
import { DEFAULT_EXTENDED_SETTINGS, toPointVisibilityOptions } from '../src/chart/extended-settings.js';
import { computeChartData } from '../src/domain/chart-compute.js';
import {
  angleRows,
  aspectRows,
  chartSheetInput,
  chartWheelRing,
  derivedPointRows,
} from '../src/domain/chart-tables.js';
import type { BirthMomentInput } from '../src/time/types.js';
import { getEngine } from './engine-harness.js';

const MOMENT: BirthMomentInput = {
  civil: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, second: 0 },
  coordinates: { latitude: 38.7478, longitude: -85.0672 },
  offsetOverrideMinutes: -300,
};

const WIDE_ORB_CONFIG = {
  majorOrb: { base: 12, luminaryBonus: 3 },
  sextileOrb: { base: 8, luminaryBonus: 1.5 },
  minorOrb: 2.5,
  scalePercent: 0,
  enabledMinorAspects: [],
};

describe('a hidden Chiron cannot still speak through an aspect anywhere (#542)', () => {
  it('is a real aspect candidate at compute time, but absent from the wheel, aspect list, and matrix once hidden', async () => {
    const engine = await getEngine();
    const chiron = bodyByKey('chiron');
    if (chiron === undefined) throw new Error('fixture bug: chiron missing from BODIES');
    const data = await computeChartData(MOMENT, engine, {
      orbConfig: WIDE_ORB_CONFIG,
      aspectsTo: { chiron: true },
    });
    // Not a vacuous fixture: Chiron really does have at least one aspect under these wide orbs.
    expect(data.aspects.some((aspect) => aspect.bodyA === chiron.id || aspect.bodyB === chiron.id)).toBe(true);

    const hasChiron = (bodyA: number, bodyB: number): boolean => bodyA === chiron.id || bodyB === chiron.id;

    // chironVisible defaults to true: shown and aspecting everywhere, same as today.
    expect(aspectRows(data).some((row) => row.bodyAKey === 'chiron' || row.bodyBKey === 'chiron')).toBe(true);
    expect(chartWheelRing(data).bodies.some((body) => body.key === 'chiron')).toBe(true);
    expect(chartWheelRing(data).aspects?.some((aspect) => hasChiron(aspect.bodyA, aspect.bodyB))).toBe(true);
    const shownMatrix = chartSheetInput(data).matrix;
    expect(shownMatrix.bodies.some((body) => body.key === 'chiron')).toBe(true);
    expect(shownMatrix.aspects.some((aspect) => aspect.aKey === 'chiron' || aspect.bKey === 'chiron')).toBe(true);

    // chironVisible: false — gone from all three surfaces, even though aspectsTo.chiron was true
    // at compute time and `data.aspects` itself still carries the raw contact unchanged.
    const hidden = { bodyVisibility: { chiron: false } };
    expect(aspectRows(data, hidden).some((row) => row.bodyAKey === 'chiron' || row.bodyBKey === 'chiron')).toBe(false);
    expect(chartWheelRing(data, 'Natal', hidden).bodies.some((body) => body.key === 'chiron')).toBe(false);
    expect(chartWheelRing(data, 'Natal', hidden).aspects?.some((aspect) => hasChiron(aspect.bodyA, aspect.bodyB))).toBe(
      false,
    );
    const hiddenMatrix = chartSheetInput(data, [], 'Natal', hidden).matrix;
    expect(hiddenMatrix.bodies.some((body) => body.key === 'chiron')).toBe(false);
    expect(hiddenMatrix.aspects.some((aspect) => aspect.aKey === 'chiron' || aspect.bKey === 'chiron')).toBe(false);

    // The raw computed data is untouched by any of this — only the display-side views are filtered.
    expect(data.aspects.some((aspect) => hasChiron(aspect.bodyA, aspect.bodyB))).toBe(true);
  });
});

describe('ExtendedSettings -> toPointVisibilityOptions -> chart-tables.ts, end to end (#585 regression)', () => {
  it('shows Vertex/Fortune/Spirit once a real ExtendedSettings policy turns them on, not just a hand-built PointVisibilityOptions literal', async () => {
    // Regression for the mid-#585 bug where extended-settings.ts stopped populating the
    // dedicated chironVisible/fortuneVisible/vertexVisible/spiritVisible fields but
    // chart-tables.ts still read those (now permanently undefined) fields directly — every
    // other test in this suite exercises chart-tables.ts with a hand-built PointVisibilityOptions
    // literal, which can't see a producer/consumer disagreement like that; this one chains the
    // real producer (toPointVisibilityOptions) into the real consumer (chart-tables.ts).
    const engine = await getEngine();
    const settings = {
      ...DEFAULT_EXTENDED_SETTINGS,
      objectPolicies: {
        ...DEFAULT_EXTENDED_SETTINGS.objectPolicies,
        vertex: { visible: true, aspectParticipant: false },
        partOfFortune: { visible: true, aspectParticipant: false },
        partOfSpirit: { visible: true, aspectParticipant: false },
      },
    };
    const data = await computeChartData(MOMENT, engine, {});
    const options = toPointVisibilityOptions(settings);

    expect(angleRows(data, options).some((row) => row.label === 'Vertex')).toBe(true);
    const derived = derivedPointRows(data, options);
    expect(derived.some((row) => row.pointKey === 'part-of-fortune')).toBe(true);
    expect(derived.some((row) => row.pointKey === 'part-of-spirit')).toBe(true);
    const matrixKeys = chartSheetInput(data, [], 'Natal', options).matrix.bodies.map((body) => body.key);
    expect(matrixKeys).toEqual(expect.arrayContaining(['vertex', 'partOfFortune', 'partOfSpirit']));

    // And the default policy (all three off) still hides them through the same real pipeline.
    const defaultOptions = toPointVisibilityOptions(DEFAULT_EXTENDED_SETTINGS);
    expect(angleRows(data, defaultOptions).some((row) => row.label === 'Vertex')).toBe(false);
    expect(derivedPointRows(data, defaultOptions)).toHaveLength(0);
  });
});
