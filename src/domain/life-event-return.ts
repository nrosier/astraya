/**
 * The solar or lunar return in force at a life event (#1399, slice S5): the last return at or before the event.
 */
/**
 * @module life-event-return
 * @purpose Finds the return in force at a stored life event, so picking an event on a Returns screen selects the return the person was living under.
 * @conventions Event time is local civil time at the birth place (the person's zone override, never the birth offset override); an untimed event counts as noon; the lunar search looks back `LUNAR_RETURN_SEARCH_DAYS` (longer than any gap between Moon returns) and takes the last return at or before the event; a solar event takes the event year's return, or the previous year's when the event falls before it.
 * @exports ReturnInForce, returnInForceAtEvent
 */
import { civilFromJulianDay, julianDayFor } from '../time/julian.js';
import { resolveMoment } from '../time/resolve.js';
import type { EphemerisProvider, JulianDayUT } from '../ephemeris/types.js';
import type { BirthMomentInput } from '../time/types.js';
import type { LifeEvent } from './life-events.js';
import { LUNAR_RETURN_SEARCH_DAYS } from './return-chart.js';
import { computeLunarReturns } from './lunar-returns.js';
import { computeSolarReturn } from './solar-return.js';

export interface ReturnInForce {
  readonly returnJd: JulianDayUT;
  /** UTC calendar date of the return, `YYYY-MM-DD`: the Lunar return screen's "on or after" date selects exactly this return. */
  readonly utcDate: string;
  /** UTC year of the return: the Solar return screen's year. */
  readonly year: number;
}

function twoDigits(n: number): string {
  return String(n).padStart(2, '0');
}

/** The Julian day (UT) of the event at the birth place. */
async function eventJd(event: LifeEvent, birth: BirthMomentInput, provider: EphemerisProvider): Promise<JulianDayUT> {
  const [year, month, day] = event.date.split('-').map(Number);
  const [hour, minute] = (event.time ?? '12:00').split(':').map(Number);
  if (year === undefined || month === undefined || day === undefined || hour === undefined || minute === undefined) {
    throw new RangeError(`Life event ${event.id} has no readable date.`);
  }
  const moment: BirthMomentInput = {
    civil: { year, month, day, hour, minute, second: 0 },
    coordinates: birth.coordinates,
    ...(birth.zoneOverride === undefined ? {} : { zoneOverride: birth.zoneOverride }),
  };
  return julianDayFor(provider, resolveMoment(moment));
}

function describe(returnJd: JulianDayUT): ReturnInForce {
  const civil = civilFromJulianDay(returnJd);
  return {
    returnJd,
    utcDate: `${String(civil.year).padStart(4, '0')}-${twoDigits(civil.month)}-${twoDigits(civil.day)}`,
    year: civil.year,
  };
}

/** The return of `kind` in force at `event`, for a person born at `birth`. Throws a RangeError when none is found. */
export async function returnInForceAtEvent(
  kind: 'solar-return' | 'lunar-return',
  event: LifeEvent,
  birth: BirthMomentInput,
  provider: EphemerisProvider,
): Promise<ReturnInForce> {
  const atEvent = await eventJd(event, birth, provider);
  if (kind === 'lunar-return') {
    const found = await computeLunarReturns(birth, atEvent - LUNAR_RETURN_SEARCH_DAYS, atEvent, provider);
    const last = found.returns.at(-1);
    if (last === undefined) throw new RangeError('No lunar return was found before this event.');
    return describe(last.returnJd);
  }
  const eventYear = civilFromJulianDay(atEvent).year;
  const thisYear = await computeSolarReturn(birth, eventYear, provider);
  if (thisYear.returnJd <= atEvent) return describe(thisYear.returnJd);
  const previous = await computeSolarReturn(birth, eventYear - 1, provider);
  return describe(previous.returnJd);
}
