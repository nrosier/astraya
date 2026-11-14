/**
 * The user-defined ayanamsa (#1407; owner decision 2026-11-14, "Date + degrees"): its validation, its round trip
 * through a calculation snapshot, the degrees and minutes the settings fields show, and the basis line it states.
 * The engine side is `ephemeris-user-ayanamsa.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { isValidUserAyanamsa, USER_AYANAMSA_ID } from '../src/astrology/ayanamsas.js';
import { DEFAULT_EXTENDED_SETTINGS, type ExtendedSettings } from '../src/chart/extended-settings.js';
import {
  buildCalculationSnapshot,
  calculationSnapshotToJson,
  decodeCalculationSnapshot,
  parseCalculationSnapshot,
  SnapshotDecodeError,
} from '../src/domain/calculation-snapshot.js';
import { SE } from '../src/ephemeris/generated-constants.js';
import { buildCalculationBasisLine, type BasisWords } from '../src/ui/calculation-basis.js';
import { calculationBasisMessages } from '../src/ui/calculation-basis.messages.js';
import { joinDegrees, splitDegrees } from '../src/ui/user-ayanamsa.js';

const USER = { referenceDate: '1950-01-01', degrees: 23.25 };
const SETTINGS: ExtendedSettings = {
  ...DEFAULT_EXTENDED_SETTINGS,
  zodiac: { kind: 'sidereal', ayanamsa: USER_AYANAMSA_ID, user: USER },
};

describe('USER_AYANAMSA_ID and isValidUserAyanamsa', () => {
  it('is the engine’s SE_SIDM_USER', () => {
    expect(USER_AYANAMSA_ID).toBe(SE.SE_SIDM_USER);
  });

  it('accepts a real date and degrees in [0, 360)', () => {
    expect(isValidUserAyanamsa(USER)).toBe(true);
    expect(isValidUserAyanamsa({ referenceDate: '2000-02-29', degrees: 0 })).toBe(true);
  });

  it.each([
    ['an impossible date', { referenceDate: '2001-02-29', degrees: 23 }],
    ['a date in another shape', { referenceDate: '1/1/1950', degrees: 23 }],
    ['360 degrees', { referenceDate: '1950-01-01', degrees: 360 }],
    ['negative degrees', { referenceDate: '1950-01-01', degrees: -1 }],
    ['non-numeric degrees', { referenceDate: '1950-01-01', degrees: '23' }],
    ['nothing', undefined],
  ])('refuses %s', (_name, value) => {
    expect(isValidUserAyanamsa(value)).toBe(false);
  });
});

describe('a calculation snapshot carries a user ayanamsa (#1407)', () => {
  it('round-trips through the strict decoder', () => {
    const sent = calculationSnapshotToJson(buildCalculationSnapshot(SETTINGS, 'modern'));
    expect(decodeCalculationSnapshot(sent).settings.zodiac).toEqual(SETTINGS.zodiac);
  });

  it('refuses SE_SIDM_USER without a valid definition, and a predefined mode that carries one', () => {
    const sent = calculationSnapshotToJson(buildCalculationSnapshot(SETTINGS, 'modern'));
    const settings = sent.settings as Record<string, unknown>;
    const withZodiac = (zodiac: unknown): Record<string, unknown> => ({ ...sent, settings: { ...settings, zodiac } });
    expect(() => decodeCalculationSnapshot(withZodiac({ kind: 'sidereal', ayanamsa: USER_AYANAMSA_ID }))).toThrow(
      SnapshotDecodeError,
    );
    expect(() =>
      decodeCalculationSnapshot(
        withZodiac({ kind: 'sidereal', ayanamsa: USER_AYANAMSA_ID, user: { ...USER, degrees: 400 } }),
      ),
    ).toThrow(SnapshotDecodeError);
    expect(() => decodeCalculationSnapshot(withZodiac({ kind: 'sidereal', ayanamsa: 1, user: USER }))).toThrow(
      SnapshotDecodeError,
    );
  });

  it('the lenient parser keeps a valid one and falls back to the default for an invalid one', () => {
    expect(parseCalculationSnapshot({ settings: { zodiac: SETTINGS.zodiac } }).settings.zodiac).toEqual(
      SETTINGS.zodiac,
    );
    expect(
      parseCalculationSnapshot({ settings: { zodiac: { kind: 'sidereal', ayanamsa: USER_AYANAMSA_ID } } }).settings
        .zodiac,
    ).toEqual(DEFAULT_EXTENDED_SETTINGS.zodiac);
  });
});

describe('the degrees and minutes the settings fields show', () => {
  it('splits degrees into whole degrees and minutes to two decimals, carrying at 60', () => {
    expect(splitDegrees(23.25)).toEqual({ degrees: 23, minutes: 15 });
    expect(splitDegrees(23 + 59.999 / 60)).toEqual({ degrees: 24, minutes: 0 });
    expect(splitDegrees(0)).toEqual({ degrees: 0, minutes: 0 });
  });

  it('joins typed fields, and refuses what is not whole degrees 0-359 or minutes 0 up to 60', () => {
    expect(joinDegrees('23', '15')).toBe(23.25);
    expect(joinDegrees('23', '')).toBeUndefined();
    expect(joinDegrees('23.5', '0')).toBeUndefined();
    expect(joinDegrees('360', '0')).toBeUndefined();
    expect(joinDegrees('23', '60')).toBeUndefined();
    expect(joinDegrees('23', '-1')).toBeUndefined();
  });

  it('shows a full-precision value with its minutes to two decimals', () => {
    expect(splitDegrees(23.123456789)).toEqual({ degrees: 23, minutes: 7.41 });
  });
});

describe('the basis line names a user-defined ayanamsa', () => {
  const words = (locale: 'en' | 'nl'): BasisWords => ({
    t: calculationBasisMessages[locale],
    rulerTitles: { modern: 'Modern', traditional: 'Traditional', both: 'Both' },
    orbProfileTitles: { custom: 'Custom', 'standard-v1': 'Standard', 'tight-v1': 'Tight', 'wide-v1': 'Wide' },
  });

  it('says Sidereal (user-defined) in English and Siderisch (zelf bepaald) in Dutch', () => {
    expect(buildCalculationBasisLine(SETTINGS, 'modern', words('en'))).toMatch(/^Sidereal \(user-defined\) · /);
    expect(buildCalculationBasisLine(SETTINGS, 'modern', words('nl'))).toMatch(/^Siderisch \(zelf bepaald\) · /);
    const lahiri = { ...DEFAULT_EXTENDED_SETTINGS, zodiac: { kind: 'sidereal', ayanamsa: 1 } as const };
    expect(buildCalculationBasisLine(lahiri, 'modern', words('en'))).toMatch(/^Sidereal · /);
  });
});
