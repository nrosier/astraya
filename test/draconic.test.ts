/**
 * Integration tests for computeDraconic (#398).
 *
 * Runs against the real Swiss Ephemeris engine, same reason computeHarmonic's own tests do: the
 * draconic transform itself is pure arithmetic (covered without an engine in
 * draconic-astrology.test.ts), but the natal positions and Node longitude it transforms come from
 * a real ephemeris pass.
 */
import { describe, expect, it } from 'vitest';
import { bodyByKey } from '../src/astrology/bodies.js';
import { draconicLongitude } from '../src/astrology/draconic.js';
import { computeDraconic } from '../src/domain/draconic.js';
import type { BirthMomentInput } from '../src/time/types.js';
import { getEngine } from './engine-harness.js';

const PERSON: BirthMomentInput = {
  civil: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, second: 0 },
  coordinates: { latitude: 38.7478, longitude: -85.0672 },
  offsetOverrideMinutes: -300,
};

describe('computeDraconic (#398)', () => {
  it('computes full, independent ChartData for the natal chart and the draconic chart', async () => {
    const engine = await getEngine();
    const data = await computeDraconic(PERSON, engine);

    expect(data.natal.positions.length).toBeGreaterThan(0);
    expect(data.natal.houses.cusps).toHaveLength(13);
    expect(data.draconic.positions.length).toBe(data.natal.positions.length);
  });

  it('keeps the natal houses and Ascendant unchanged', async () => {
    const engine = await getEngine();
    const data = await computeDraconic(PERSON, engine);
    expect(data.draconic.houses).toBe(data.natal.houses);
    expect(data.draconic.houses.ascendant).toBe(data.natal.houses.ascendant);
  });

  it('places every draconic body position at the natal longitude minus the Node, wrapped', async () => {
    const engine = await getEngine();
    const data = await computeDraconic(PERSON, engine);
    const meanNode = bodyByKey('meanNode');
    expect(meanNode).toBeDefined();
    const natalNode = data.natal.positions.find((p) => p.body === meanNode?.id);
    expect(natalNode).toBeDefined();
    if (natalNode === undefined) return;

    for (const draconicPos of data.draconic.positions) {
      const natal = data.natal.positions.find((p) => p.body === draconicPos.body);
      expect(natal).toBeDefined();
      if (natal === undefined) continue;
      expect(draconicPos.longitude).toBeCloseTo(draconicLongitude(natal.longitude, natalNode.longitude), 6);
      // Latitude and retrograde are carried over unchanged — see draconic.ts's doc comment.
      expect(draconicPos.latitude).toBeCloseTo(natal.latitude, 9);
      expect(draconicPos.retrograde).toBe(natal.retrograde);
    }
  });

  it('places the natal North Node itself at draconic 0° Aries', async () => {
    const engine = await getEngine();
    const data = await computeDraconic(PERSON, engine);
    const meanNode = bodyByKey('meanNode');
    expect(meanNode).toBeDefined();
    const draconicNode = data.draconic.positions.find((p) => p.body === meanNode?.id);
    expect(draconicNode).toBeDefined();
    if (draconicNode === undefined) return;
    expect(draconicNode.longitude).toBeCloseTo(0, 6);
  });

  it('finds aspects within the draconic chart itself', async () => {
    const engine = await getEngine();
    const data = await computeDraconic(PERSON, engine);
    expect(data.draconic.aspects.length).toBeGreaterThan(0);
  });

  it('excludes Chiron, Lilith and the lunar nodes from draconic aspects by default', async () => {
    const engine = await getEngine();
    const withoutExtras = await computeDraconic(PERSON, engine);
    const withExtras = await computeDraconic(PERSON, engine, {
      // Per-object keys (#585), not the old grouped 'lilith'/'lunarNodes' — only the Mean
      // variants are actually present by default (nodeVariant/lilithVariant default to 'mean'),
      // so a strict '>' here would have caught #585's four-sibling-module regression where
      // these modules kept reading the pre-#585 grouped key shape after it was removed.
      aspectsTo: { chiron: true, meanLilith: true, meanNode: true },
    });
    expect(withExtras.draconic.aspects.length).toBeGreaterThan(withoutExtras.draconic.aspects.length);
  });

  it('retains transformed custom formula points with standard non-luminary aspects', async () => {
    const engine = await getEngine();
    const data = await computeDraconic(PERSON, engine, {
      customPoints: [{ id: 'formula-point', name: 'Formula point', formula: 'ascendant + moon - sun' }],
    });

    const [natalPoint] = data.natal.customPoints ?? [];
    const [draconicPoint] = data.draconic.customPoints ?? [];
    const meanNode = bodyByKey('meanNode');
    const natalNode = data.natal.positions.find((position) => position.body === meanNode?.id);
    expect(draconicPoint?.body).toBe(natalPoint?.body);
    expect(draconicPoint?.name).toBe('Formula point');
    expect(draconicPoint?.position.longitude).toBeCloseTo(
      draconicLongitude(natalPoint?.position.longitude ?? NaN, natalNode?.longitude ?? NaN),
      9,
    );
    expect(
      data.draconic.aspects.some(
        (aspect) => aspect.bodyA === draconicPoint?.body || aspect.bodyB === draconicPoint?.body,
      ),
    ).toBe(true);
  });
});
