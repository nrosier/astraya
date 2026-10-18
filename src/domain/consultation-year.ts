/**
 * The year a consultation reads (#669): the frame an astrologer sets before looking at transits. The profected year
 * and its lord, the firdaria period, the progressed Moon (sign, natal house, phase) and the solar returns either side
 * of now.
 *
 * Nothing here is a new technique: each fact comes from an existing module (`profections.ts`, `firdaria.ts`,
 * `secondary-progression.ts`, `solar-return.ts`, `lunar-phase.ts`), only gathered for one moment.
 */
/**
 * @module domain/consultation-year
 * @purpose Gathers the year's frame for the consultation page (#669): profection year and lord, firdaria period, progressed Moon with phase and natal house, and the current and next solar return.
 * @conventions Pure aggregation over existing modules; the progressed Moon's house is read in the natal houses (the usual reading), its phase from the progressed Sun; the current solar return is the latest one at or before `nowJd`.
 * @exports ConsultationYear, consultationYear
 */
import { bodyById, bodyByKey } from '../astrology/bodies.js';
import { houseOf } from '../astrology/emphasis.js';
import { firdariaPeriodAt } from '../astrology/firdaria.js';
import { lunarPhaseOf, type LunarPhaseKey } from '../astrology/lunar-phase.js';
import type { RulershipChoice } from '../astrology/rulership.js';
import { signIndex } from '../astrology/signs.js';
import type { EphemerisProvider, JulianDayUT } from '../ephemeris/types.js';
import { civilFromJulianDay } from '../time/julian.js';
import type { BirthMomentInput } from '../time/types.js';
import { housesAreDefined, type ChartData } from './chart-compute.js';
import { computeProfections } from './profections.js';
import { computeSecondaryProgression } from './secondary-progression.js';
import { computeSolarReturn } from './solar-return.js';

export interface ConsultationYear {
  /** Undefined without a known birth time: a profection counts from the Ascendant. */
  readonly profection:
    | { readonly sign: number; readonly house: number; readonly lords: readonly string[]; readonly endJd: JulianDayUT }
    | undefined;
  readonly firdaria: { readonly ruler: string; readonly endJd: JulianDayUT } | undefined;
  readonly progressedMoon: {
    readonly sign: number;
    /** In the natal houses; undefined without a known birth time. */
    readonly house: number | undefined;
    readonly phase: LunarPhaseKey;
  };
  readonly solarReturns: { readonly current: JulianDayUT; readonly next: JulianDayUT };
}

const keyOf = (id: number): string => bodyById(id)?.key ?? String(id);

export async function consultationYear(
  moment: BirthMomentInput,
  natal: ChartData,
  natalJd: JulianDayUT,
  nowJd: JulianDayUT,
  provider: EphemerisProvider,
  rulership: RulershipChoice,
): Promise<ConsultationYear> {
  const timed = housesAreDefined(natal.houses);
  const year = civilFromJulianDay(nowJd).year;
  const [profections, progressed, returnThisYear] = await Promise.all([
    timed ? computeProfections(moment, nowJd, provider, { rulership }) : Promise.resolve(undefined),
    computeSecondaryProgression(moment, nowJd, provider),
    computeSolarReturn(moment, year, provider),
  ]);
  // The latest return at or before now, and the one after it.
  const [current, next] =
    returnThisYear.returnJd <= nowJd
      ? [returnThisYear.returnJd, (await computeSolarReturn(moment, year + 1, provider)).returnJd]
      : [(await computeSolarReturn(moment, year - 1, provider)).returnJd, returnThisYear.returnJd];

  const sun = bodyByKey('sun')?.id;
  const moon = bodyByKey('moon')?.id;
  const progressedMoon = progressed.positions.find((position) => position.body === moon);
  const progressedSun = progressed.positions.find((position) => position.body === sun);
  if (progressedMoon === undefined || progressedSun === undefined) {
    throw new Error('unreachable: a progression always has the Sun and the Moon');
  }
  const firdaria = firdariaPeriodAt(natal.sect, natalJd, nowJd);

  return {
    profection:
      profections === undefined
        ? undefined
        : {
            sign: profections.year.signIndex,
            house: profections.year.house,
            lords: [
              profections.year.ruler,
              ...(profections.year.coRuler === undefined ? [] : [profections.year.coRuler]),
            ].map(keyOf),
            endJd: profections.year.endJd,
          },
    firdaria: firdaria === undefined ? undefined : { ruler: firdaria.ruler, endJd: firdaria.endJd },
    progressedMoon: {
      sign: signIndex(progressedMoon.longitude),
      house: timed ? houseOf(progressedMoon.longitude, natal.houses.cusps) : undefined,
      phase: lunarPhaseOf(progressedMoon.longitude, progressedSun.longitude).phase,
    },
    solarReturns: { current, next },
  };
}
