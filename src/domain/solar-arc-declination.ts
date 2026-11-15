/**
 * @module domain/solar-arc-declination
 * @purpose Solar arc in declination (#1407, Solar Fire Deluxe v6 §23.2; owner decisions of 2026-11-14): every natal body's declination moved by the Sun's own arc in declination, and the parallels and contraparallels the directed bodies make to the natal ones.
 * @conventions The arc is the secondary-progressed Sun's declination minus the natal Sun's (day for a year, `progressedJulianDay`), the same basis as the longitude solar arc, and it is added to each natal declination. Contacts are directed body to natal body, parallel (same declination) or contraparallel (opposite), within the declination orb the app already uses for declination contacts (`DEFAULT_DECLINATION_ORB`, no new number). Declinations come from the engine's equatorial positions. Definition cited to the Solar Fire User Guide (Deluxe), "Changes from Version 5.x to Deluxe", PDF p. 182 (printed p. 179): "chart point declinations are directed by the secondary progressed arc in declination" (record `esoteric-solar-fire-deluxe-user-guide-undated`; owner decision on #1407, 2026-11-15). All ephemeris access goes through `EphemerisProvider`.
 * @exports SolarArcDeclinationData, DirectedDeclination, DeclinationDirectionContact, computeSolarArcDeclinations
 */
import { bodyByKey, bodyIdsFor, type BodySetOptions } from '../astrology/bodies.js';
import type { DeclinationContactKind } from '../astrology/declinations.js';
import { ageInYears, progressedJulianDay } from '../astrology/progressions.js';
import { DEFAULT_DECLINATION_ORB } from './chart-tables.js';
import { julianDayFor } from '../time/julian.js';
import { resolveMoment } from '../time/resolve.js';
import type { BirthMomentInput } from '../time/types.js';
import type { BodyId, Degrees, EphemerisProvider, JulianDayUT } from '../ephemeris/types.js';

export interface DirectedDeclination {
  readonly body: BodyId;
  readonly natal: Degrees;
  readonly directed: Degrees;
}

export interface DeclinationDirectionContact {
  /** The directed body. */
  readonly directed: BodyId;
  /** The natal body it is parallel or contraparallel to. */
  readonly natal: BodyId;
  readonly kind: DeclinationContactKind;
  readonly orb: Degrees;
}

export interface SolarArcDeclinationData {
  readonly ageInYears: number;
  /** The Sun's arc in declination, in degrees: progressed minus natal, so negative when the Sun moved south. */
  readonly arc: Degrees;
  readonly declinations: readonly DirectedDeclination[];
  readonly contacts: readonly DeclinationDirectionContact[];
}

/** `provider` must already be initialized. */
export async function computeSolarArcDeclinations(
  moment: BirthMomentInput,
  targetJd: JulianDayUT,
  provider: EphemerisProvider,
  options: BodySetOptions = {},
): Promise<SolarArcDeclinationData> {
  const sun = bodyByKey('sun');
  if (sun === undefined) throw new Error('unreachable: the Sun is always in BODIES');
  const natalJd = await julianDayFor(provider, resolveMoment(moment));
  const ids = bodyIdsFor(options);
  const [natalPositions, [progressedSun]] = await Promise.all([
    provider.positions(natalJd, ids, { equatorial: true }),
    provider.positions(progressedJulianDay(natalJd, targetJd), [sun.id], { equatorial: true }),
  ]);
  const natalSun = natalPositions.find((position) => position.body === sun.id);
  if (natalSun === undefined || progressedSun === undefined) {
    throw new Error('unreachable: the ephemeris returned no position for the Sun');
  }
  // With `equatorial`, the latitude field is the declination.
  const arc = progressedSun.latitude - natalSun.latitude;
  const declinations = natalPositions.map((position) => ({
    body: position.body,
    natal: position.latitude,
    directed: position.latitude + arc,
  }));

  const contacts: DeclinationDirectionContact[] = [];
  for (const directed of declinations) {
    for (const natal of declinations) {
      const parallelOrb = Math.abs(directed.directed - natal.natal);
      if (parallelOrb <= DEFAULT_DECLINATION_ORB) {
        contacts.push({ directed: directed.body, natal: natal.body, kind: 'parallel', orb: parallelOrb });
      }
      const contraparallelOrb = Math.abs(directed.directed + natal.natal);
      if (contraparallelOrb <= DEFAULT_DECLINATION_ORB) {
        contacts.push({ directed: directed.body, natal: natal.body, kind: 'contraparallel', orb: contraparallelOrb });
      }
    }
  }
  return { ageInYears: ageInYears(natalJd, targetJd), arc, declinations, contacts };
}
