// @vitest-environment jsdom
/**
 * #544: the final regression gate for #541 — one non-default `CalculationSnapshot`, checked
 * independently across every path a chart's settings travel through (save/reload, share link,
 * full export), each asserted to reproduce the identical snapshot and identical computed
 * positions. Against the real engine throughout; re-run (not rewritten) as later phases land.
 * jsdom only for `writeDefaultCalculationProfile`'s `localStorage`/`window` — the save/reload
 * path is the one of the three that genuinely needs a DOM-shaped environment.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ayanamsaByKey } from '../src/astrology/ayanamsas.js';
import { bodyByKey } from '../src/astrology/bodies.js';
import { DEFAULT_RULERSHIP_CHOICE } from '../src/astrology/rulership.js';
import {
  DEFAULT_EXTENDED_SETTINGS,
  toChartCalculationOptions,
  type ExtendedSettings,
} from '../src/chart/extended-settings.js';
import {
  buildCalculationSnapshot,
  calculationSnapshotToJson,
  parseCalculationSnapshot,
  type CalculationSnapshot,
} from '../src/domain/calculation-snapshot.js';
import { computeChartData, type ChartData } from '../src/domain/chart-compute.js';
import { decodeChartShareLink, encodeChartShareLink } from '../src/domain/chart-share.js';
import { buildFullExport } from '../src/domain/full-export.js';
import {
  readDefaultCalculationProfile,
  resetDefaultCalculationProfileMemory,
  writeDefaultCalculationProfile,
} from '../src/ui/default-calculation-profile.js';
import type { EphemerisProvider } from '../src/ephemeris/types.js';
import type { Person } from '../src/domain/person.js';
import type { BirthMomentInput } from '../src/time/types.js';
import { getEngine } from './engine-harness.js';

let engine: EphemerisProvider;
beforeAll(async () => {
  engine = await getEngine();
}, 60_000);

afterEach(() => {
  localStorage.clear();
  resetDefaultCalculationProfileMemory();
});

const LAHIRI_ID = ayanamsaByKey('lahiri')?.id ?? 1;

/** Deliberately far from every field's default, so a path that silently falls back to defaults is caught. */
const NON_DEFAULT_SETTINGS: ExtendedSettings = {
  ...DEFAULT_EXTENDED_SETTINGS,
  houseSystem: 'K',
  zodiac: { kind: 'sidereal', ayanamsa: LAHIRI_ID },
  orbScalePercent: -35,
  enabledMinorAspects: ['semisextile', 'quincunx'],
  lilithVariant: 'true',
  nodeVariant: 'true',
  fortuneVisible: true,
  vertexVisible: true,
  chironVisible: false,
  spiritVisible: true,
  midpointsVisible: true,
  aspectsToChiron: false,
  aspectsToVertex: true,
  aspectsToPartOfFortune: true,
  aspectsToPartOfSpirit: true,
};
const NON_DEFAULT_RULERSHIP = 'traditional' as const;
const SENT = buildCalculationSnapshot(NON_DEFAULT_SETTINGS, NON_DEFAULT_RULERSHIP);

const MOMENT: BirthMomentInput = {
  civil: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, second: 0 },
  coordinates: { latitude: 38.7478, longitude: -85.0672 },
  offsetOverrideMinutes: -300,
};

async function computeWith(snapshot: CalculationSnapshot): Promise<ChartData> {
  return computeChartData(MOMENT, engine, {
    ...toChartCalculationOptions(snapshot.settings),
    rulership: snapshot.rulership,
  });
}

describe('a non-default CalculationSnapshot survives every path identically (#544)', () => {
  it('is not accidentally equal to the app defaults — otherwise this whole fixture would be vacuous', () => {
    expect(SENT).not.toEqual(buildCalculationSnapshot(DEFAULT_EXTENDED_SETTINGS, DEFAULT_RULERSHIP_CHOICE));
  });

  it('save then reload (the device default profile)', async () => {
    writeDefaultCalculationProfile(SENT.settings, SENT.rulership);
    const reloaded = readDefaultCalculationProfile();
    if (reloaded === undefined) throw new Error('fixture bug: nothing was saved');
    expect(reloaded.settings).toEqual(SENT.settings);
    expect(reloaded.rulership).toBe(SENT.rulership);

    const live = await computeWith(SENT);
    const afterReload = await computeWith(buildCalculationSnapshot(reloaded.settings, reloaded.rulership));
    expect(afterReload.positions).toEqual(live.positions);
    expect(afterReload.houses).toEqual(live.houses);
  });

  it('a share link, encoded then decoded', async () => {
    const query = encodeChartShareLink({
      moment: MOMENT,
      settings: calculationSnapshotToJson(SENT),
      housesKnown: true,
    }).toString();
    const decoded = decodeChartShareLink(new URLSearchParams(query));
    const received = parseCalculationSnapshot(decoded.settings);
    expect(received).toEqual(SENT);

    const live = await computeWith(SENT);
    const afterShare = await computeWith(received);
    expect(afterShare.positions).toEqual(live.positions);
    expect(afterShare.houses).toEqual(live.houses);
  });

  it('a full export', async () => {
    const person: Person = {
      id: 'p-parity',
      displayName: 'Parity Fixture',
      placeLabel: 'Louisville, KY',
      timeAccuracy: 'recorded',
      notes: '',
      missing: [],
      moment: MOMENT,
    };
    const archive = await buildFullExport({
      people: [person],
      provider: engine,
      appVersion: '9.9.9',
      settings: SENT.settings,
      rulership: SENT.rulership,
      symbolClass: 'drawn',
      now: new Date('2026-10-13T00:00:00.000Z'),
    });
    expect(archive.preferences.settings).toEqual(SENT.settings);
    expect(archive.preferences.rulership).toBe(SENT.rulership);

    const live = await computeWith(SENT);
    const exportedPositions = archive.people[0]?.natalChart?.positions;
    expect(exportedPositions).toBeDefined();
    expect(exportedPositions?.length).toBeGreaterThan(0);
    // Exported rows go through visibility filtering (chironVisible: false here), so Chiron is
    // correctly absent — but every row that *is* present must agree exactly with the live chart.
    expect(exportedPositions?.some((row) => row.bodyKey === 'chiron')).toBe(false);
    for (const row of exportedPositions ?? []) {
      if (row.bodyKey === 'asc') {
        expect(row.longitude).toBe(live.houses.ascendant);
        continue;
      }
      if (row.bodyKey === 'mc') {
        expect(row.longitude).toBe(live.houses.midheaven);
        continue;
      }
      const body = bodyByKey(row.bodyKey);
      const livePosition = body === undefined ? undefined : live.positions.find((p) => p.body === body.id);
      expect(livePosition, row.bodyKey).toBeDefined();
      expect(row.longitude).toBe(livePosition?.longitude);
    }
    expect(live.houses.system).toBe('K');
  });
});
