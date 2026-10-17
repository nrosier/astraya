/**
 * The Extended settings' orbs reach every chart (#590). A chart's options carry the card's orbs, and each
 * technique applies its own context rule once: synastry tightens (#543), transit keeps its three minor
 * aspects. Real engine, as the other chart tests use. The check is that a tighter card orb really
 * narrows what each chart finds, and that the context rules hold.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_ORB_CONFIG } from '../src/astrology/aspects.js';
import {
  DEFAULT_EXTENDED_SETTINGS,
  toChartCalculationOptions,
  type ExtendedSettings,
} from '../src/chart/extended-settings.js';
import { computeDraconic } from '../src/domain/draconic.js';
import { computeHarmonic } from '../src/domain/harmonic.js';
import { computeSolarReturn } from '../src/domain/solar-return.js';
import { computeSynastry } from '../src/domain/synastry.js';
import { computeTransit } from '../src/domain/transit.js';
import type { EphemerisProvider } from '../src/ephemeris/types.js';
import type { BirthMomentInput } from '../src/time/types.js';
import { getEngine } from './engine-harness.js';

const PERSON: BirthMomentInput = {
  civil: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, second: 0 },
  coordinates: { latitude: 38.7478, longitude: -85.0672 },
  offsetOverrideMinutes: -300,
};
const PARTNER: BirthMomentInput = {
  civil: { year: 1988, month: 2, day: 2, hour: 9, minute: 5, second: 0 },
  coordinates: { latitude: 51.5072, longitude: -0.1276 },
  offsetOverrideMinutes: 0,
};
const TARGET_JD = 2460000.5;

/** The card with its orb scale cut to the minimum: a chart drawn from it finds far fewer contacts. */
const TIGHT_CARD: ExtendedSettings = { ...DEFAULT_EXTENDED_SETTINGS, orbScalePercent: -90 };
const WIDE_CARD: ExtendedSettings = { ...DEFAULT_EXTENDED_SETTINGS, orbScalePercent: 40 };

let engine: EphemerisProvider;

beforeAll(async () => {
  engine = await getEngine();
}, 60_000);

describe('the card’s orbs reach each chart (#590)', () => {
  it('draconic: the card’s orbs narrow its aspects', async () => {
    const wide = await computeDraconic(PERSON, engine, toChartCalculationOptions(WIDE_CARD));
    const tight = await computeDraconic(PERSON, engine, toChartCalculationOptions(TIGHT_CARD));
    expect(tight.draconic.aspects.length).toBeLessThan(wide.draconic.aspects.length);
  }, 60_000);

  it('harmonic: the card’s orbs narrow its aspects', async () => {
    const wide = await computeHarmonic(PERSON, 5, engine, toChartCalculationOptions(WIDE_CARD));
    const tight = await computeHarmonic(PERSON, 5, engine, toChartCalculationOptions(TIGHT_CARD));
    expect(tight.harmonic.aspects.length).toBeLessThan(wide.harmonic.aspects.length);
  }, 60_000);

  it('solar return: the card’s orbs narrow its contacts', async () => {
    const wide = await computeSolarReturn(PERSON, 2015, engine, toChartCalculationOptions(WIDE_CARD));
    const tight = await computeSolarReturn(PERSON, 2015, engine, toChartCalculationOptions(TIGHT_CARD));
    expect(tight.contacts.length).toBeLessThan(wide.contacts.length);
  }, 60_000);

  it('transit: the card’s orbs narrow its contacts', async () => {
    const wide = await computeTransit(PERSON, TARGET_JD, engine, toChartCalculationOptions(WIDE_CARD));
    const tight = await computeTransit(PERSON, TARGET_JD, engine, toChartCalculationOptions(TIGHT_CARD));
    expect(tight.contacts.length).toBeLessThan(wide.contacts.length);
  }, 60_000);

  it('synastry: a card with default orbs keeps synastry’s own tighter limit (#543)', async () => {
    const card = await computeSynastry(PERSON, PARTNER, engine, toChartCalculationOptions(DEFAULT_EXTENDED_SETTINGS));
    const bare = await computeSynastry(PERSON, PARTNER, engine);
    expect(card.aspects.length).toBe(bare.aspects.length);
    expect(card.orbConfig.scalePercent).toBe(-30);
  }, 60_000);

  it('synastry tightens the card’s orbs exactly once, not twice', async () => {
    const wide = await computeSynastry(PERSON, PARTNER, engine, toChartCalculationOptions(WIDE_CARD));
    expect(wide.orbConfig.scalePercent).toBe(40 - 30);
  }, 60_000);

  it('transit keeps its three minor aspects on, whatever the card says', async () => {
    const minorsOff = await computeTransit(PERSON, TARGET_JD, engine, {
      ...toChartCalculationOptions(DEFAULT_EXTENDED_SETTINGS),
      orbConfig: { ...DEFAULT_ORB_CONFIG, enabledMinorAspects: [] },
    });
    const minorsOn = await computeTransit(
      PERSON,
      TARGET_JD,
      engine,
      toChartCalculationOptions(DEFAULT_EXTENDED_SETTINGS),
    );
    expect(minorsOff.contacts.length).toBe(minorsOn.contacts.length);
  }, 60_000);
});
