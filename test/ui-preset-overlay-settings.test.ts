// @vitest-environment jsdom
/**
 * Consultation preset switches (#1190): what each preset sets on a chart's overlay settings, per chart and on demand.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_CHART_OVERLAY_SETTINGS } from '../src/ui/ChartOverlaySettingsPanel.js';
import { CONSULTATION_PRESETS } from '../src/ui/aspect-family-filter.js';
import { orbLimitDegrees, presetOverlaySettings } from '../src/ui/preset-overlay-settings.js';

const opening = DEFAULT_CHART_OVERLAY_SETTINGS;
const preset = (key: string) => CONSULTATION_PRESETS.find((p) => p.key === key);

describe('presetOverlaySettings', () => {
  it('leaves the defaults showing everything the chart shows today', () => {
    expect(opening.transit).toBe(false);
    expect(opening.solarArc).toBe(false);
    expect(opening.chartFacts).toBe(true);
    expect(opening.transitOrb).toBe('');
    expect(opening.solarArcOrb).toBe('');
  });

  it('standard overview switches the transit ring on with the 3 degree transit orb', () => {
    const next = presetOverlaySettings(opening, preset('standardOverview'), opening);
    expect(next.transit).toBe(true);
    expect(next.transitOrb).toBe('3');
    expect(next.solarArc).toBe(false);
    expect(next.chartFacts).toBe(true);
  });

  it('natal core suppresses transits and progressive layers and keeps the chart facts', () => {
    const on = { ...opening, transit: true, progressed: true, directed: true, solarArc: true };
    const next = presetOverlaySettings(on, preset('natalCore'), opening);
    expect([next.transit, next.progressed, next.directed, next.solarArc]).toEqual([false, false, false, false]);
    expect(next.chartFacts).toBe(true);
  });

  it('predictive timing sets the 3 degree transit and 1 degree solar arc orbs', () => {
    const next = presetOverlaySettings(opening, preset('predictiveTiming'), opening);
    expect([next.transit, next.solarArc, next.interRingAspects]).toEqual([true, true, true]);
    expect([next.transitOrb, next.solarArcOrb]).toEqual(['3', '1']);
  });

  it('keeps dates and ring order, and leaves the settings alone for a preset without switches', () => {
    const dated = { ...opening, transitDate: '2030-01-01' };
    expect(presetOverlaySettings(dated, preset('predictiveTiming'), opening).transitDate).toBe('2030-01-01');
    expect(presetOverlaySettings(dated, preset('dynamicSynastry'), opening)).toBe(dated);
  });

  it('no preset restores the opening values of every switch', () => {
    const chosen = presetOverlaySettings(opening, preset('predictiveTiming'), opening);
    expect(presetOverlaySettings(chosen, undefined, opening)).toEqual(opening);
  });
});

describe('orbLimitDegrees', () => {
  it('is no limit when empty or invalid', () => {
    expect(orbLimitDegrees('')).toBeUndefined();
    expect(orbLimitDegrees('-1')).toBeUndefined();
    expect(orbLimitDegrees('x')).toBeUndefined();
    expect(orbLimitDegrees('1.5')).toBe(1.5);
  });
});
