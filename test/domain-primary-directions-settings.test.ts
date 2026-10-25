/**
 * Unit tests for the primary-directions settings comparison (#797) — pure, no engine needed.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_EXTENDED_SETTINGS } from '../src/chart/extended-settings.js';
import { DEFAULT_RULERSHIP_CHOICE, RULERSHIP_CHOICES } from '../src/astrology/rulership.js';
import { buildCalculationSnapshot } from '../src/domain/calculation-snapshot.js';
import { differingPrimaryDirectionsSettings } from '../src/domain/primary-directions-settings.js';

describe('differingPrimaryDirectionsSettings', () => {
  it('reports nothing for the defaults', () => {
    const snapshot = buildCalculationSnapshot(DEFAULT_EXTENDED_SETTINGS, DEFAULT_RULERSHIP_CHOICE);
    expect(differingPrimaryDirectionsSettings(snapshot)).toEqual([]);
  });

  it('ignores settings that do not affect directions', () => {
    const snapshot = buildCalculationSnapshot(
      {
        ...DEFAULT_EXTENDED_SETTINGS,
        orbScalePercent: 20,
        midpointsVisible: !DEFAULT_EXTENDED_SETTINGS.midpointsVisible,
      },
      DEFAULT_RULERSHIP_CHOICE,
    );
    expect(differingPrimaryDirectionsSettings(snapshot)).toEqual([]);
  });

  it('reports a different house system and a sidereal zodiac, in fixed order', () => {
    const snapshot = buildCalculationSnapshot(
      { ...DEFAULT_EXTENDED_SETTINGS, houseSystem: 'W', zodiac: { kind: 'sidereal', ayanamsa: 1 } },
      DEFAULT_RULERSHIP_CHOICE,
    );
    expect(differingPrimaryDirectionsSettings(snapshot)).toEqual(['houseSystem', 'zodiac']);
  });

  it('reports a different ayanamsa as a zodiac difference', () => {
    const base = buildCalculationSnapshot(
      { ...DEFAULT_EXTENDED_SETTINGS, zodiac: { kind: 'sidereal', ayanamsa: 1 } },
      DEFAULT_RULERSHIP_CHOICE,
    );
    const other = buildCalculationSnapshot(
      { ...DEFAULT_EXTENDED_SETTINGS, zodiac: { kind: 'sidereal', ayanamsa: 3 } },
      DEFAULT_RULERSHIP_CHOICE,
    );
    expect(differingPrimaryDirectionsSettings(other, base)).toEqual(['zodiac']);
  });

  it('reports rulership, node and Lilith variants', () => {
    const rulership = RULERSHIP_CHOICES.find((choice) => choice !== DEFAULT_RULERSHIP_CHOICE);
    expect(rulership).toBeDefined();
    const snapshot = buildCalculationSnapshot(
      { ...DEFAULT_EXTENDED_SETTINGS, nodeVariant: 'true', lilithVariant: 'true' },
      rulership ?? DEFAULT_RULERSHIP_CHOICE,
    );
    expect(differingPrimaryDirectionsSettings(snapshot)).toEqual(['rulership', 'nodeVariant', 'lilithVariant']);
  });
});
