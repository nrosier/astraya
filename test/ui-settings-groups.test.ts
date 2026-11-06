/**
 * The Advanced placement of the Extended settings (#856): every setting has exactly one place, the per-tab lists match
 * the owner's decision, the customised count is measured against the active profile's baseline (not the Astraya
 * default), and nothing that is calculated, saved or exported depends on the grouping or on whether a group is open.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyCalculationProfile } from '../src/chart/calculation-profiles.js';
import { DEFAULT_EXTENDED_SETTINGS, type ExtendedSettings } from '../src/chart/extended-settings.js';
import { DEFAULT_OBJECT_POLICIES } from '../src/chart/object-policy.js';
import {
  ADVANCED_TABS,
  advancedFields,
  baselineSettings,
  customisedCount,
  PLACEMENT,
} from '../src/ui/settings-groups.js';

const OPTIONAL_KEYS = ['orbRules', 'stationWindow', 'motionScore'];

describe('the placement table', () => {
  it('names every Extended setting exactly once, and nothing that is not one', () => {
    const settingKeys = [...Object.keys(DEFAULT_EXTENDED_SETTINGS), ...OPTIONAL_KEYS].sort();
    expect(Object.keys(PLACEMENT).sort()).toEqual(settingKeys);
  });

  it('keeps the tab lists the owner decided on #856', () => {
    expect(advancedFields('profile')).toEqual(['boundsScheme']);
    expect(advancedFields('bodies')).toEqual(['orbScalePercent', 'enabledMinorAspects', 'objectPolicies']);
    expect(advancedFields('special')).toEqual([
      'lilithVariant',
      'nodeVariant',
      'antisciaVisible',
      'antisciaMaxOrb',
      'declinationVisible',
      'declinationMaxOrb',
      'dial90Visible',
      'midpointTreeOrb',
      'stationWindow',
      'motionScore',
    ]);
  });

  it('puts the house system, zodiac, orb rules and midpoints on a first screen, and the wheel colours on Display', () => {
    for (const field of ['houseSystem', 'zodiac', 'orbRules', 'midpointsVisible'] as const) {
      expect(PLACEMENT[field], field).toBe('first');
    }
    expect(PLACEMENT.rainbowZodiac).toBe('display');
  });
});

describe('the customised count', () => {
  it('is zero for the Astraya defaults on every tab', () => {
    for (const tab of ADVANCED_TABS) expect(customisedCount(tab, DEFAULT_EXTENDED_SETTINGS), tab).toBe(0);
  });

  it('is zero for each built-in profile as it is, so Traditional Western’s Whole Sign is not customised', () => {
    for (const id of ['modern-western-v1', 'traditional-western-v1', 'sidereal-lahiri-v1'] as const) {
      const settings = applyCalculationProfile(DEFAULT_EXTENDED_SETTINGS, id);
      for (const tab of ADVANCED_TABS) expect(customisedCount(tab, settings), `${id} ${tab}`).toBe(0);
    }
  });

  it('counts a value that differs from the profile the draft is closest to, on the tab that holds it', () => {
    const traditional = applyCalculationProfile(DEFAULT_EXTENDED_SETTINGS, 'traditional-western-v1');
    expect(customisedCount('special', { ...traditional, lilithVariant: 'true', nodeVariant: 'true' })).toBe(2);
    expect(customisedCount('profile', { ...traditional, boundsScheme: 'ptolemaic' })).toBe(1);
    expect(customisedCount('bodies', { ...traditional, enabledMinorAspects: ['quincunx'] })).toBe(1);
    // The same change is invisible to the other tabs.
    expect(customisedCount('bodies', { ...traditional, lilithVariant: 'true' })).toBe(0);
  });

  it('does not count the orb scale while it sits on a named step, because the first screen already shows it', () => {
    expect(customisedCount('bodies', { ...DEFAULT_EXTENDED_SETTINGS, orbScalePercent: -50 })).toBe(0);
    expect(customisedCount('bodies', { ...DEFAULT_EXTENDED_SETTINGS, orbScalePercent: 40 })).toBe(0);
    expect(customisedCount('bodies', { ...DEFAULT_EXTENDED_SETTINGS, orbScalePercent: -30 })).toBe(1);
  });

  it('counts a changed object policy once, however many objects it touches, and adds the extra values', () => {
    const hidden = {
      ...DEFAULT_EXTENDED_SETTINGS,
      objectPolicies: { ...DEFAULT_OBJECT_POLICIES, ceres: { visible: true, aspectParticipant: true } },
    } as ExtendedSettings;
    expect(customisedCount('bodies', hidden)).toBe(1);
    expect(customisedCount('bodies', hidden, 2)).toBe(3);
    expect(customisedCount('bodies', DEFAULT_EXTENDED_SETTINGS, 1)).toBe(1);
  });

  it('treats the same minor aspects in another order as the same choice', () => {
    const a = { ...DEFAULT_EXTENDED_SETTINGS, enabledMinorAspects: ['quincunx', 'semisquare'] };
    const b = { ...DEFAULT_EXTENDED_SETTINGS, enabledMinorAspects: ['semisquare', 'quincunx'] };
    expect(customisedCount('bodies', a)).toBe(customisedCount('bodies', b));
  });

  it('picks the profile a draft differs from least as its baseline', () => {
    const traditional = applyCalculationProfile(DEFAULT_EXTENDED_SETTINGS, 'traditional-western-v1');
    expect(baselineSettings({ ...traditional, lilithVariant: 'true' }).houseSystem).toBe(traditional.houseSystem);
    expect(baselineSettings(DEFAULT_EXTENDED_SETTINGS).houseSystem).toBe(DEFAULT_EXTENDED_SETTINGS.houseSystem);
  });
});

describe('the grouping is display only', () => {
  /** Every module that calculates, saves, exports or prints. None of them may read the grouping or its open state. */
  const SEAMS = ['src/chart', 'src/domain', 'src/astrology', 'src/store', 'src/sync'];

  function sources(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return sources(path);
      return /\.tsx?$/.test(entry.name) ? [path] : [];
    });
  }

  it('is imported by no calculation, domain, store or sync code', () => {
    const offenders = SEAMS.flatMap(sources).filter((path) =>
      /settings-groups|advanced-groups-setting/.test(readFileSync(path, 'utf-8')),
    );
    expect(offenders).toEqual([]);
  });

  it('is imported by no export, print or PDF module', () => {
    const offenders = readdirSync('src/ui')
      .filter((name) => /^(pdf-|PdfExport|PrintProvenance|chart-export|export-)/.test(name))
      .filter((name) => /settings-groups|advanced-groups-setting/.test(readFileSync(join('src/ui', name), 'utf-8')));
    expect(offenders).toEqual([]);
  });
});
