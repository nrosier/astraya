/** Which orbs a chart context calculates with, from the card and the device's orb library (#590). */
import { describe, expect, it } from 'vitest';
import type { OrbProfileRecord } from '../src/astrology/orb-library.js';
import {
  DEFAULT_EXTENDED_SETTINGS,
  settingsForContext,
  type ExtendedSettings,
} from '../src/chart/extended-settings.js';

const profile: OrbProfileRecord = {
  id: 'house-style',
  name: 'House style',
  revision: 3,
  scalePercent: -20,
  aspectOrbs: { trine: { base: 6, luminaryBonus: 1 } },
  bodyOrbs: {},
};
const library = { profiles: [profile] };
const card: ExtendedSettings = { ...DEFAULT_EXTENDED_SETTINGS, orbScalePercent: 10, houseSystem: 'W' };

describe('settingsForContext', () => {
  it('is the card unchanged when nothing was chosen, so an untouched device behaves as before', () => {
    expect(settingsForContext(card, 'transit', library, {})).toBe(card);
    expect(settingsForContext(card, 'synastry', library, { transit: 'house-style' })).toBe(card);
  });

  it('replaces only the orbs when a context names a profile; every other setting stays the card’s', () => {
    const result = settingsForContext(card, 'transit', library, { transit: 'house-style' });
    expect(result.orbScalePercent).toBe(-20);
    expect(result.orbRules).toEqual({ aspectOrbs: { trine: { base: 6, luminaryBonus: 1 } } });
    expect(result.houseSystem).toBe('W');
  });

  it('drops the card’s own rules rather than merging them into a profile’s', () => {
    const ruled: ExtendedSettings = { ...card, orbRules: { bodyOrbs: { venus: 4 } } };
    const result = settingsForContext(ruled, 'synastry', library, { synastry: 'house-style' });
    expect(result.orbRules).toEqual({ aspectOrbs: { trine: { base: 6, luminaryBonus: 1 } } });
  });

  it('falls back to the card when the named profile no longer exists', () => {
    expect(settingsForContext(card, 'transit', { profiles: [] }, { transit: 'house-style' })).toBe(card);
  });

  it('leaves no rules at all for a profile that has none, matching a never-customized settings value', () => {
    const bare = { ...profile, aspectOrbs: {}, bodyOrbs: {} };
    const result = settingsForContext(card, 'transit', { profiles: [bare] }, { transit: 'house-style' });
    expect('orbRules' in result).toBe(false);
  });

  it('uses a cited Lilly preset for a context, replacing the card’s own orbs', () => {
    const ruled: ExtendedSettings = { ...card, orbRules: { aspectOrbs: { trine: { base: 5, luminaryBonus: 0 } } } };
    const result = settingsForContext(ruled, 'synastry', { profiles: [] }, { synastry: 'lilly-1647-second-v1' });
    expect(result.orbScalePercent).toBe(0);
    expect(result.orbRules).toEqual({
      bodyOrbs: { saturn: 4.5, jupiter: 4.5, mars: 3.5, sun: 7.5, venus: 3.5, mercury: 3.5, moon: 6 },
    });
    expect(result.houseSystem).toBe('W');
  });
});
