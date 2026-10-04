/**
 * Computes the annual and monthly profection for a target moment (#168).
 *
 * Mirrors `solar-return.ts`/`secondary-progression.ts`'s shape: a natal Julian day, one
 * houses call for the natal Ascendant (profections rotate the Ascendant, so an unknown
 * birth time makes this meaningless the same way it does for houses generally — see
 * `chart-compute.ts`'s own doc comment), then pure arithmetic (`astrology/profections.ts`)
 * over the result. No position call at all: nothing here needs a body other than the angle.
 */
import { DEFAULT_RULERSHIP_CHOICE, rulersOf, type RulershipChoice } from '../astrology/rulership.js';
import { annualProfection, monthlyProfection } from '../astrology/profections.js';
import { ageInYears } from '../astrology/progressions.js';
import { signOf } from '../astrology/signs.js';
import { julianDayFor } from '../time/julian.js';
import { resolveMoment } from '../time/resolve.js';
import type {
  BodyId,
  Degrees,
  EphemerisProvider,
  GeoPosition,
  HouseSystem,
  JulianDayUT,
  Zodiac,
} from '../ephemeris/types.js';
import type { BirthMomentInput } from '../time/types.js';

/** Placidus, matching every other chart-computing module's default. */
const DEFAULT_HOUSE_SYSTEM: HouseSystem = 'P';

export interface ProfectionOptions {
  readonly houseSystem?: HouseSystem;
  readonly zodiac?: Zodiac;
  /**
   * Whose rulers name the lord (#426); modern by default like the rest of the app. The technique is
   * Hellenistic and predates the outer planets, so Traditional is the historically faithful choice;
   * under Both a sign has two lords.
   */
  readonly rulership?: RulershipChoice;
}

export interface ProfectedPeriod {
  readonly signIndex: number;
  readonly signName: string;
  readonly longitude: Degrees;
  /** The lord of the period (the traditional ruler first under Both). */
  readonly ruler: BodyId;
  /** The second lord, under Both and only in Scorpio, Aquarius and Pisces. */
  readonly coRuler?: BodyId;
}

export interface ProfectionData {
  readonly natalJd: JulianDayUT;
  readonly targetJd: JulianDayUT;
  readonly ascendant: Degrees;
  readonly age: number;
  readonly year: ProfectedPeriod;
  readonly month: ProfectedPeriod & { readonly monthIndex: number };
}

/** `provider` must already be initialized. `targetJd` may be before birth (`age` comes back negative, not an error). */
export async function computeProfections(
  natalMoment: BirthMomentInput,
  targetJd: JulianDayUT,
  provider: EphemerisProvider,
  options: ProfectionOptions = {},
): Promise<ProfectionData> {
  const resolved = resolveMoment(natalMoment);
  const natalJd = await julianDayFor(provider, resolved);
  const place: GeoPosition = { ...natalMoment.coordinates, altitude: 0 };
  const houseSystem = options.houseSystem ?? DEFAULT_HOUSE_SYSTEM;
  const rulership = options.rulership ?? DEFAULT_RULERSHIP_CHOICE;
  const lords = (sign: number): Pick<ProfectedPeriod, 'ruler' | 'coRuler'> => {
    const [ruler, coRuler] = rulersOf(sign, rulership);
    if (ruler === undefined) throw new RangeError(`sign index ${String(sign)} has no ruler`);
    return coRuler === undefined ? { ruler } : { ruler, coRuler };
  };

  const natalHouses = await provider.houses(natalJd, place, houseSystem, options.zodiac);
  const age = ageInYears(natalJd, targetJd);

  const year = annualProfection(natalHouses.ascendant, age);
  const month = monthlyProfection(natalHouses.ascendant, age);

  return {
    natalJd,
    targetJd,
    ascendant: natalHouses.ascendant,
    age,
    year: {
      signIndex: year.signIndex,
      signName: signOf(year.longitude).name,
      longitude: year.longitude,
      ...lords(year.signIndex),
    },
    month: {
      signIndex: month.signIndex,
      signName: signOf(month.longitude).name,
      longitude: month.longitude,
      ...lords(month.signIndex),
      monthIndex: month.monthIndex,
    },
  };
}
