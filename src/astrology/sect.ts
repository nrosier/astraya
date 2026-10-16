/**
 * Sect (day/night), solar phase (oriental/occidental), and the Sun-proximity
 * conditions cazimi, combustion and under-the-beams (#28).
 *
 * Sect is easy to get backwards, so the reasoning is spelled out rather than
 * assumed: house cusps increase in the same direction as ecliptic longitude
 * as you go from house 1 (the Ascendant) around to house 12, for every house
 * system — that's why house 7 (the Descendant) always falls exactly 180
 * degrees from house 1, and house 10 (the Midheaven, literally overhead) is
 * always in the 7-12 half. So a longitude is above the horizon exactly when
 * it is 180-360 degrees past the Ascendant in the increasing-longitude
 * direction — no house cusps needed, just the Ascendant itself.
 *
 * Orientality follows the same increasing-longitude sweep, but for *time*
 * rather than *height*: the Ascendant sweeps through increasing longitude
 * once per day, so of two bodies, whichever one the Ascendant reaches first
 * rises first. A body behind the Sun (lower longitude, reached by the
 * Ascendant earlier that same rotation) therefore rises *before* the Sun —
 * traditionally called oriental, "of the sun" in the morning sky, and
 * astronomically to the Sun's west. A body ahead of the Sun rises after it:
 * occidental, an evening body, east of the Sun.
 */

/**
 * @module Sect
 * @purpose Determines a chart's sect (day/night), a body's solar phase (oriental/occidental), and Sun-proximity conditions (cazimi, combust, under the beams).
 * @conventions A longitude is above the horizon when it is 180-360 degrees past the Ascendant in the increasing-longitude direction (houses 7-12), needing only the Ascendant, no full cusp set; orientality follows the same increasing-longitude sweep but over time rather than height; cazimi/combustion/under-the-beams use traditional orbs (17 arcminutes, 8°, 15° respectively).
 * @exports Sect, isAboveHorizon, sectOf, solarPhaseOf, solarConditionOf, solarConditionOfPosition
 */
import type { BodyPosition, Degrees } from '../ephemeris/types.js';
import { angularSeparation } from './aspects.js';

/** Normalise to the half-open interval [0, 360). */
function norm360(degrees: Degrees): Degrees {
  const value = degrees % 360;
  return value < 0 ? value + 360 : value;
}

export type Sect = 'day' | 'night';

/** True when a longitude is in the above-horizon half of the ecliptic (houses 7-12). */
export function isAboveHorizon(longitude: Degrees, ascendant: Degrees): boolean {
  return norm360(longitude - ascendant) >= 180;
}

/** A chart's sect: day when the Sun is above the horizon, night otherwise. */
export function sectOf(sunLongitude: Degrees, ascendant: Degrees): Sect {
  return isAboveHorizon(sunLongitude, ascendant) ? 'day' : 'night';
}

export type SolarPhase = 'oriental' | 'occidental';

/**
 * Whether a body rises before the Sun (oriental) or after it (occidental).
 * `undefined` when the body is conjunct or exactly opposite the Sun, where
 * orientality isn't a meaningful distinction.
 */
export function solarPhaseOf(bodyLongitude: Degrees, sunLongitude: Degrees): SolarPhase | undefined {
  const diff = norm360(sunLongitude - bodyLongitude);
  if (diff === 0 || diff === 180) return undefined;
  return diff < 180 ? 'oriental' : 'occidental';
}

export type SolarCondition = 'cazimi' | 'combust' | 'underTheBeams' | 'free';

/*
 * Lilly, Christian Astrology (1647), Book I, p. 113, gives cazimi within 17 arcminutes, combustion within
 * 8 degrees 30 minutes in the same sign, and under the beams within 17 degrees. Book II, p. 300 (aphorism 26),
 * gives 12 degrees and 16 minutes instead. Astraya's cazimi matches Book I; its combustion (8) and under-the-
 * beams (15) values are its own choices, narrower than Book I's. See docs/references/orb-conventions.references.json.
 */
/** Within the Sun's own disk — roughly its apparent radius, 17 arcminutes (Lilly, Book I, p. 113). */
const CAZIMI_ORB: Degrees = 17 / 60;
/** Combustion orb: Astraya's 8 degrees, against Lilly's 8 degrees 30 minutes (Book I, p. 113). */
const COMBUSTION_ORB: Degrees = 8;
/** Under-the-beams orb, wider than and inclusive of combustion: Astraya's 15, against Lilly's 17 (Book I, p. 113). */
const UNDER_THE_BEAMS_ORB: Degrees = 15;

/**
 * How close a body is to the Sun, classified into the traditional bands.
 * Not meaningful called with the Sun as `bodyLongitude` — it is always
 * exactly cazimi with itself, which is a degenerate case rather than a real
 * condition, and it is the caller's responsibility not to ask.
 */
export function solarConditionOf(bodyLongitude: Degrees, sunLongitude: Degrees): SolarCondition {
  const separation = angularSeparation(bodyLongitude, sunLongitude);
  if (separation <= CAZIMI_ORB) return 'cazimi';
  if (separation <= COMBUSTION_ORB) return 'combust';
  if (separation <= UNDER_THE_BEAMS_ORB) return 'underTheBeams';
  return 'free';
}

/** Convenience overload taking full positions rather than bare longitudes. */
export function solarConditionOfPosition(body: BodyPosition, sun: BodyPosition): SolarCondition {
  return solarConditionOf(body.longitude, sun.longitude);
}
