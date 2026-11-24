/**
 * A horary chart (#406): an ordinary chart for the moment and place a question was asked, with the
 * considerations-before-judgment (`astrology/horary.ts`) worked out alongside it.
 *
 * Reuses `computeChartData` — a horary chart is a chart-for-a-moment, not a new kind of
 * computation, though its aspects use Lilly's moiety orbs (#1960) — and `findVoidOfCourseMoon` for the one consideration that needs the ephemeris
 * beyond the chart itself.
 */
/**
 * @module horary
 * @purpose Computes a horary chart (#406): an ordinary chart for the moment a question was asked, plus the traditional considerations-before-judgment.
 * @conventions Reuses `computeChartData` (a horary chart is a chart-for-a-moment, not a new computation) with Lilly's 1647 first-column moiety orbs (`HORARY_ORB_PROFILE`, #1960), never the user's natal orb settings; defaults to Regiomontanus houses (`HORARY_DEFAULT_HOUSE_SYSTEM`), the system the horary tradition (Lilly onward) used, versus the natal screens' Placidus default; void-of-course Moon comes from `findVoidOfCourseMoon`.
 * @exports computeHoraryChart, HoraryChart, HORARY_ORB_PROFILE, HORARY_ORB_CONFIG, HORARY_DEFAULT_HOUSE_SYSTEM, HORARY_HOUSE_SYSTEMS
 */
import { DEFAULT_ORB_CONFIG, type OrbConfig } from '../astrology/aspects.js';
import { bodyByKey } from '../astrology/bodies.js';
import { houseOf } from '../astrology/emphasis.js';
import { horaryConsiderations, type HoraryConsideration } from '../astrology/horary.js';
import { citedPresetSettings } from '../astrology/orb-profiles.js';
import { findVoidOfCourseMoon, type VoidOfCourseMoon } from '../astrology/void-of-course.js';
import type { EphemerisProvider, HouseSystem, JulianDayUT } from '../ephemeris/types.js';
import { julianDayFor } from '../time/julian.js';
import { resolveMoment } from '../time/resolve.js';
import type { BirthMomentInput } from '../time/types.js';
import { computeChartData, housesAreDefined, type ChartData } from './chart-compute.js';

/**
 * Regiomontanus, the house system the horary tradition (Lilly onward) cast its charts in. The
 * natal screens default to Placidus; a horary chart is offered in the system its sources use.
 */
export const HORARY_DEFAULT_HOUSE_SYSTEM: HouseSystem = 'R';

/**
 * The house systems a horary chart is offered in, by Swiss Ephemeris code. The first is the horary tradition's. Lives
 * here, not in `ui/horary.ts`, so the saved-judgment guard in `src/store/` can check membership without importing
 * from `src/ui/` (#1960); the UI module re-exports it.
 */
export const HORARY_HOUSE_SYSTEMS: readonly string[] = ['R', 'P', 'W'];

/**
 * The orb profile horary perfection is judged in (#1960): William Lilly, Christian Astrology (1647), Book I, p. 107, first
 * column (`CITED_ORB_PRESETS` in `astrology/orb-profiles.ts`). Two planets are in aspect within the sum of their moieties.
 */
export const HORARY_ORB_PROFILE = 'lilly-1647-first-v1';

/** The orb config horary charts are computed with: the profile's moieties at scale 0, no minor aspects enabled. */
export const HORARY_ORB_CONFIG: OrbConfig = { ...DEFAULT_ORB_CONFIG, ...citedPresetSettings(HORARY_ORB_PROFILE) };

export interface HoraryChart {
  readonly data: ChartData;
  readonly jd: JulianDayUT;
  readonly considerations: readonly HoraryConsideration[];
  readonly voidOfCourse: VoidOfCourseMoon;
  /** False when the houses came back undefined (no finite cusps), so no Ascendant exists to check. */
  readonly housesAvailable: boolean;
}

export async function computeHoraryChart(
  moment: BirthMomentInput,
  provider: EphemerisProvider,
  houseSystem: HouseSystem = HORARY_DEFAULT_HOUSE_SYSTEM,
): Promise<HoraryChart> {
  const data = await computeChartData(moment, provider, { houseSystem, orbConfig: HORARY_ORB_CONFIG });
  const jd = await julianDayFor(provider, resolveMoment(moment));
  const voidOfCourse = await findVoidOfCourseMoon(provider, jd);

  const moon = bodyByKey('moon');
  const saturn = bodyByKey('saturn');
  const moonLongitude = data.positions.find((position) => position.body === moon?.id)?.longitude;
  const saturnLongitude = data.positions.find((position) => position.body === saturn?.id)?.longitude;
  if (moonLongitude === undefined || saturnLongitude === undefined) {
    throw new Error('unreachable: the ephemeris returned no position for the Moon or Saturn');
  }

  const housesAvailable = housesAreDefined(data.houses);
  return {
    data,
    jd,
    voidOfCourse,
    housesAvailable,
    considerations: horaryConsiderations({
      // With no houses there is no Ascendant to be early or late; NaN fails both comparisons.
      ascendant: housesAvailable ? data.houses.ascendant : Number.NaN,
      moonLongitude,
      saturnHouse: housesAvailable ? houseOf(saturnLongitude, data.houses.cusps) : undefined,
      moonIsVoid: voidOfCourse.isVoid,
    }),
  };
}
