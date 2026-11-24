/**
 * @module domain/progression-contacts
 * @purpose The two extra contact sets the Progressions screen offers (#1407, Solar Fire Deluxe v6 §23.2): progressed bodies to each other, and the transiting sky on the as-of date to the progressed chart.
 * @conventions Pure apart from the one position call for the transits; the default body set applies, and the transits are read in the zodiac the caller passes (the person's, so transits and progressed positions share one zodiac, #1935), tropical when none is given. Orbs reuse what exists, per context (owner decision, 2026-11-14): progressed to progressed uses the same default orbs as the screen's progressed-to-natal contacts; transits to progressed use the transit context's orbs (`orbConfigForContext('transit', …)`). The progressed positions are treated as fixed points for the transit contacts, as the natal ones are on the Transits screen, so applying or separating is the transiting body's motion alone. All ephemeris access goes through `EphemerisProvider`.
 * @exports ProgressionContactTarget, PROGRESSION_CONTACT_TARGETS, progressedToProgressed, transitsToProgressed
 */
import {
  DEFAULT_ORB_CONFIG,
  findAspects,
  findCrossAspects,
  fixedSubjects,
  subjectsFrom,
  type Aspect,
} from '../astrology/aspects.js';
import { bodyById, bodyIdsFor, type BodyCategory } from '../astrology/bodies.js';
import { orbConfigForContext } from '../astrology/orb-profiles.js';
import type { BodyId, BodyPosition, EphemerisProvider, JulianDayUT, Zodiac } from '../ephemeris/types.js';

/** What the Progressions screen's contacts are measured to: the natal chart (as before), the progressed chart, or the transits. */
export type ProgressionContactTarget = 'natal' | 'progressed' | 'transit';

/** In the order the screen offers them. */
export const PROGRESSION_CONTACT_TARGETS: readonly ProgressionContactTarget[] = ['natal', 'progressed', 'transit'];

function categoryOf(body: BodyId): BodyCategory {
  return bodyById(body)?.category ?? 'asteroid';
}

/** The aspects between the progressed bodies themselves, with the screen's default orbs. */
export function progressedToProgressed(positions: readonly BodyPosition[]): readonly Aspect[] {
  return findAspects(subjectsFrom(positions, categoryOf), DEFAULT_ORB_CONFIG);
}

/**
 * The transiting bodies at `targetJd` (the screen's as-of moment) to the progressed bodies, with the transit orbs.
 * The transiting body is `bodyA`, the progressed one `bodyB`, as a transit-to-natal contact reads.
 * `zodiac` is the zodiac the progressed positions were computed in; the transits are read in it too.
 */
export async function transitsToProgressed(
  targetJd: JulianDayUT,
  progressedPositions: readonly BodyPosition[],
  provider: EphemerisProvider,
  options: { readonly zodiac?: Zodiac } = {},
): Promise<readonly Aspect[]> {
  const transitPositions = await provider.positions(
    targetJd,
    bodyIdsFor(),
    options.zodiac === undefined ? undefined : { zodiac: options.zodiac },
  );
  return findCrossAspects(
    subjectsFrom(transitPositions, categoryOf),
    fixedSubjects(progressedPositions, categoryOf),
    orbConfigForContext('transit', DEFAULT_ORB_CONFIG),
  );
}
