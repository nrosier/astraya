/**
 * The coordinate → time-zone lookup uses current timezone-boundary-builder data (#624). `tz-lookup` 6.1.25
 * (2019) put Ciudad Juárez in America/Ojinaga, which since late 2022 is an hour off. Pinned here so a
 * downgrade, or a replacement with stale boundaries, fails a test and not a birth chart.
 */
import { describe, expect, it } from 'vitest';
import { resolveMoment } from '../src/time/resolve.js';
import { lookupZone } from '../src/time/zones.js';

const JUAREZ = { latitude: 31.69, longitude: -106.42 };

function offsetAt(
  coordinates: { latitude: number; longitude: number },
  year: number,
  month: number,
  day: number,
): number {
  return resolveMoment({ civil: { year, month, day, hour: 12, minute: 0, second: 0 }, coordinates }).offsetMinutes;
}

describe('Ciudad Juárez (#624)', () => {
  it('is in America/Ciudad_Juarez, not America/Ojinaga', () => {
    expect(lookupZone(JUAREZ)).toBe('America/Ciudad_Juarez');
  });

  it("resolves the offset that Mexico's border city actually uses today, in winter and in summer", () => {
    // Since late 2022 Ciudad Juárez follows US Mountain time: -7 h standard, -6 h daylight.
    expect(offsetAt(JUAREZ, 2024, 1, 15)).toBe(-420);
    expect(offsetAt(JUAREZ, 2024, 7, 1)).toBe(-360);
  });

  it('is unchanged for births before the zones split (2021)', () => {
    expect(offsetAt(JUAREZ, 2021, 7, 1)).toBe(-360);
  });
});

// Places whose zone is certain, spread across the world and across the areas where the 2019 and current
// boundary data disagree. Each is the expected IANA zone, or a link name that has the same rules.
const KNOWN: readonly (readonly [string, number, number, readonly string[]])[] = [
  ['London', 51.5072, -0.1276, ['Europe/London']],
  ['Kyiv', 50.45, 30.52, ['Europe/Kyiv', 'Europe/Kiev']],
  ['Nuuk', 64.18, -51.72, ['America/Nuuk', 'America/Godthab']],
  ['Yakutsk', 62.03, 129.73, ['Asia/Yakutsk']],
  ['Vladivostok', 43.12, 131.89, ['Asia/Vladivostok']],
  ['Magadan', 59.56, 150.8, ['Asia/Magadan']],
  ['Mazatlan', 23.25, -106.42, ['America/Mazatlan']],
  ['Mexico City', 19.43, -99.13, ['America/Mexico_City']],
  ['Hermosillo', 29.07, -110.96, ['America/Hermosillo']],
  ['Inuvik', 68.36, -133.72, ['America/Inuvik']],
  ['Iqaluit', 63.75, -68.52, ['America/Iqaluit']],
  ['Ulaanbaatar', 47.89, 106.91, ['Asia/Ulaanbaatar']],
  ['Khovd', 48.0, 91.64, ['Asia/Hovd']],
  ['Anchorage', 61.22, -149.9, ['America/Anchorage']],
  ['Honolulu', 21.31, -157.86, ['Pacific/Honolulu']],
  ['Sao Paulo', -23.55, -46.63, ['America/Sao_Paulo']],
  ['Sydney', -33.87, 151.21, ['Australia/Sydney']],
  ['Perth', -31.95, 115.86, ['Australia/Perth']],
  ['Kolkata', 22.57, 88.36, ['Asia/Kolkata', 'Asia/Calcutta']],
  ['Jakarta', -6.21, 106.85, ['Asia/Jakarta']],
  ['Moscow', 55.75, 37.62, ['Europe/Moscow']],
];

describe('well-known places resolve to their zone (#624)', () => {
  for (const [name, latitude, longitude, accepted] of KNOWN) {
    it(name, () => {
      expect(accepted).toContain(lookupZone({ latitude, longitude }));
    });
  }
});
