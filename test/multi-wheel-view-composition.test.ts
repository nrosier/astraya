/**
 * Integration test for MultiWheelView's own ring composition (#558): natal + transit +
 * relocated as three independent rings in one `renderMultiWheelSvg` call, each produced by
 * `chartWheelRing` from a real computed `ChartData`. `renderMultiWheelSvg`'s own N-ary support
 * is already covered generically in `chart-multi-wheel.test.ts`; this test is specifically that
 * MultiWheelView's three real ring sources compose without error and render all three labels —
 * the first screen to actually exercise more than two rings at once.
 */
import { describe, expect, it } from 'vitest';
import { chartWheelRing } from '../src/domain/chart-tables.js';
import { computeChartData } from '../src/domain/chart-compute.js';
import { computeRelocatedChart } from '../src/domain/relocated-chart.js';
import { computeTransit } from '../src/domain/transit.js';
import { renderMultiWheelSvg, type CrossRingAspects } from '../src/chart/multi-wheel.js';
import type { BirthMomentInput } from '../src/time/types.js';
import { getEngine } from './engine-harness.js';

const PERSON: BirthMomentInput = {
  civil: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, second: 0 },
  coordinates: { latitude: 38.7478, longitude: -85.0672 },
  offsetOverrideMinutes: -300,
};

describe('three-ring overlay composition (#558)', () => {
  it('builds natal + transit + relocated rings and renders all three legend labels', async () => {
    const engine = await getEngine();

    const natal = await computeChartData(PERSON, engine);
    const targetJd = await engine.julianDayFromUtc(2026, 10, 13, 12, 0, 0);
    const transitData = await computeTransit(PERSON, targetJd, engine);
    const relocatedData = await computeRelocatedChart(
      PERSON,
      { latitude: -33.8688, longitude: 151.2093, altitude: 0 },
      engine,
    );

    const rings = [
      chartWheelRing(natal, 'Natal'),
      chartWheelRing(transitData.transit, 'Transit'),
      chartWheelRing(relocatedData.relocated, 'Relocated'),
    ];
    const crossAspects: readonly CrossRingAspects[] = [
      { innerRingIndex: 0, outerRingIndex: 1, aspects: transitData.contacts },
    ];

    const svg = renderMultiWheelSvg(rings, crossAspects);
    expect(svg).toContain('<svg');
    expect(svg).toContain('Natal');
    expect(svg).toContain('Transit');
    expect(svg).toContain('Relocated');
  });
});
