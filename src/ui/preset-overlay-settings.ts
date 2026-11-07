/**
 * @module ui/preset-overlay-settings
 * @purpose Applies a consultation preset's layer, chart-facts and orb switches to a chart's overlay settings (#1190).
 * @conventions Pure, no React. Per chart: the result is the screen's draft state, never stored. Dates, ring order and the relocated inputs are kept. No preset restores the switches the presets touch to the screen's opening values.
 * @exports presetOverlaySettings, orbLimitDegrees
 */
import type { ChartOverlaySettings } from './ChartOverlaySettingsPanel.js';
import type { ConsultationPreset } from './aspect-family-filter.js';

/** `current` with the preset's switches set; with no preset, `opening` values for every switch a preset can set. */
export function presetOverlaySettings(
  current: ChartOverlaySettings,
  preset: ConsultationPreset | undefined,
  opening: ChartOverlaySettings,
): ChartOverlaySettings {
  if (preset === undefined) {
    return {
      ...current,
      transit: opening.transit,
      progressed: opening.progressed,
      directed: opening.directed,
      solarArc: opening.solarArc,
      transitOrb: opening.transitOrb,
      solarArcOrb: opening.solarArcOrb,
      interRingAspects: opening.interRingAspects,
      chartFacts: opening.chartFacts,
    };
  }
  const switches = preset.switches;
  if (switches === undefined) return current;
  return {
    ...current,
    ...switches.layers,
    ...(switches.chartFacts === undefined ? {} : { chartFacts: switches.chartFacts }),
    transitOrb: switches.transitOrb === undefined ? opening.transitOrb : String(switches.transitOrb),
    solarArcOrb: switches.solarArcOrb === undefined ? opening.solarArcOrb : String(switches.solarArcOrb),
    interRingAspects: switches.interRingAspects ?? opening.interRingAspects,
  };
}

/** The typed orb limit in degrees, or undefined when it is empty or not a non-negative number (no limit). */
export function orbLimitDegrees(value: string): number | undefined {
  if (value.trim() === '') return undefined;
  const degrees = Number(value);
  return Number.isFinite(degrees) && degrees >= 0 ? degrees : undefined;
}
