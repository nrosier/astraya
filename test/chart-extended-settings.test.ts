import { describe, expect, it } from 'vitest';
import { DEFAULT_ORB_CONFIG } from '../src/astrology/aspects.js';
import {
  DEFAULT_EXTENDED_SETTINGS,
  toChartCalculationOptions,
  toPointVisibilityOptions,
  toSignWedgeStyle,
  type ExtendedSettings,
} from '../src/chart/extended-settings.js';
import { DEFAULT_OBJECT_POLICIES, OBJECT_KEYS } from '../src/chart/object-policy.js';

function withOverrides(overrides: Partial<ExtendedSettings>): ExtendedSettings {
  return { ...DEFAULT_EXTENDED_SETTINGS, ...overrides };
}

describe('DEFAULT_EXTENDED_SETTINGS', () => {
  it('matches a chart with the panel never opened: Placidus, tropical, no minor aspects, the default object policy (#585)', () => {
    expect(DEFAULT_EXTENDED_SETTINGS.houseSystem).toBe('P');
    expect(DEFAULT_EXTENDED_SETTINGS.zodiac).toEqual({ kind: 'tropical' });
    expect(DEFAULT_EXTENDED_SETTINGS.orbScalePercent).toBe(0);
    expect(DEFAULT_EXTENDED_SETTINGS.enabledMinorAspects).toEqual([]);
    expect(DEFAULT_EXTENDED_SETTINGS.objectPolicies).toEqual(DEFAULT_OBJECT_POLICIES);
    // Spot-checks reproducing the pre-#585 scattered defaults directly, not just via equality
    // with the (also newly-written) DEFAULT_OBJECT_POLICIES constant.
    expect(DEFAULT_EXTENDED_SETTINGS.objectPolicies.chiron).toEqual({ visible: true, aspectParticipant: false });
    expect(DEFAULT_EXTENDED_SETTINGS.objectPolicies.sun).toEqual({ visible: true, aspectParticipant: true });
    expect(DEFAULT_EXTENDED_SETTINGS.objectPolicies.ceres).toEqual({ visible: false, aspectParticipant: true });
    expect(DEFAULT_EXTENDED_SETTINGS.objectPolicies.vertex).toEqual({ visible: false, aspectParticipant: false });
    expect(DEFAULT_EXTENDED_SETTINGS.midpointsVisible).toBe(false);
    expect(DEFAULT_EXTENDED_SETTINGS.antisciaVisible).toBe(false);
    expect(DEFAULT_EXTENDED_SETTINGS.antisciaMaxOrb).toBe(1);
    expect(DEFAULT_EXTENDED_SETTINGS.declinationVisible).toBe(false);
    expect(DEFAULT_EXTENDED_SETTINGS.declinationMaxOrb).toBe(1);
    expect(DEFAULT_EXTENDED_SETTINGS.dial90Visible).toBe(false);
    expect(DEFAULT_EXTENDED_SETTINGS.midpointTreeOrb).toBe(1);
    expect(DEFAULT_EXTENDED_SETTINGS.rainbowZodiac).toBe(false);
  });
});

describe('toChartCalculationOptions', () => {
  it('passes house system, zodiac, and variants through unchanged', () => {
    const settings = withOverrides({
      houseSystem: 'K',
      zodiac: { kind: 'sidereal', ayanamsa: 1 },
      lilithVariant: 'true',
      nodeVariant: 'true',
    });
    const options = toChartCalculationOptions(settings);
    expect(options.houseSystem).toBe('K');
    expect(options.zodiac).toEqual({ kind: 'sidereal', ayanamsa: 1 });
    expect(options.lilithVariant).toBe('true');
    expect(options.nodeVariant).toBe('true');
  });

  it('passes the interpolated Lilith variant through too (#380)', () => {
    const settings = withOverrides({ lilithVariant: 'interpolated' });
    expect(toChartCalculationOptions(settings).lilithVariant).toBe('interpolated');
  });

  it('builds an orbConfig from DEFAULT_ORB_CONFIG with only scalePercent/enabledMinorAspects overridden', () => {
    const settings = withOverrides({ orbScalePercent: 50, enabledMinorAspects: ['quincunx'] });
    const options = toChartCalculationOptions(settings);
    expect(options.orbConfig).toEqual({
      ...DEFAULT_ORB_CONFIG,
      scalePercent: 50,
      enabledMinorAspects: ['quincunx'],
    });
  });

  it('maps every object key’s aspectParticipant by name (#585)', () => {
    const settings = withOverrides({
      objectPolicies: {
        ...DEFAULT_EXTENDED_SETTINGS.objectPolicies,
        chiron: { visible: true, aspectParticipant: true },
        vertex: { visible: false, aspectParticipant: true },
        sun: { visible: true, aspectParticipant: false },
      },
    });
    const options = toChartCalculationOptions(settings);
    expect(options.aspectsTo?.chiron).toBe(true);
    expect(options.aspectsTo?.vertex).toBe(true);
    expect(options.aspectsTo?.sun).toBe(false);
    for (const key of OBJECT_KEYS) {
      expect(options.aspectsTo?.[key]).toBe(settings.objectPolicies[key].aspectParticipant);
    }
  });
});

describe('toPointVisibilityOptions', () => {
  it('picks out the feature-toggle fields and builds bodyVisibility from every object’s policy (#542, #556, #560, #585)', () => {
    const settings = withOverrides({
      midpointsVisible: true,
      antisciaVisible: true,
      antisciaMaxOrb: 1.5,
      declinationVisible: true,
      declinationMaxOrb: 0.5,
      dial90Visible: true,
      midpointTreeOrb: 2,
      objectPolicies: {
        ...DEFAULT_EXTENDED_SETTINGS.objectPolicies,
        chiron: { visible: false, aspectParticipant: false },
        partOfFortune: { visible: true, aspectParticipant: false },
        vertex: { visible: true, aspectParticipant: false },
        meanLilith: { visible: true, aspectParticipant: false },
        ceres: { visible: true, aspectParticipant: true },
      },
    });
    const options = toPointVisibilityOptions(settings);
    expect(options).toMatchObject({
      midpointsVisible: true,
      antisciaVisible: true,
      antisciaMaxOrb: 1.5,
      declinationVisible: true,
      declinationMaxOrb: 0.5,
      dial90Visible: true,
      midpointTreeOrb: 2,
    });
    for (const key of OBJECT_KEYS) {
      expect(options.bodyVisibility?.[key]).toBe(settings.objectPolicies[key].visible);
    }
  });
});

describe('toSignWedgeStyle', () => {
  it('is "default" when rainbowZodiac is off and "rainbow" when on', () => {
    expect(toSignWedgeStyle(withOverrides({ rainbowZodiac: false }))).toBe('default');
    expect(toSignWedgeStyle(withOverrides({ rainbowZodiac: true }))).toBe('rainbow');
  });
});
