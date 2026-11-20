/**
 * The time-zone data a birth-moment conversion needs: the `tz-lookup` coordinate→zone polygons and luxon's zone and
 * date arithmetic. Both are large, so they are not in the eager bundle. The app shell calls `loadZoneData()` once at
 * startup and awaits it before any screen renders, so every synchronous time function in `zones.ts` and `julian.ts`
 * sees the modules as soon as a chart can run.
 *
 * Until the load resolves, those functions throw a clear error rather than compute with missing data. That is
 * deliberate: a chart computed before the data is ready would be silently wrong, which is the failure this project
 * is built to avoid.
 *
 * @module time/zone-data
 * @purpose Loads the tz-lookup and luxon modules once with a dynamic import() and hands them to the synchronous time functions.
 * @conventions `loadZoneData` is idempotent and resolves only once both modules are set; the synchronous readers throw `TimeDataNotReadyError` before then. Only this module imports the two dependencies.
 * @exports loadZoneData, zoneDataReady, TimeDataNotReadyError, zoneLookupModule, luxonModule
 */
import type tzlookupType from '@photostructure/tz-lookup';
import type * as LuxonModule from 'luxon';

/** Thrown by a synchronous time function called before `loadZoneData` has resolved. */
export class TimeDataNotReadyError extends Error {
  constructor() {
    super('Time-zone data is not loaded yet; await loadZoneData() before computing a chart.');
    this.name = 'TimeDataNotReadyError';
  }
}

interface ZoneData {
  readonly tzlookup: typeof tzlookupType;
  readonly luxon: typeof LuxonModule;
}

let loaded: ZoneData | undefined;
let pending: Promise<ZoneData> | undefined;

/**
 * Loads the time-zone data once. Concurrent and repeated calls share one load. Resolves when both modules are ready.
 */
export function loadZoneData(): Promise<void> {
  if (loaded !== undefined) return Promise.resolve();
  pending ??= Promise.all([import('@photostructure/tz-lookup'), import('luxon')]).then(([tz, luxon]) => {
    const data: ZoneData = { tzlookup: tz.default, luxon };
    loaded = data;
    return data;
  });
  return pending.then(() => undefined);
}

/** Whether `loadZoneData` has resolved, so the synchronous functions can run. */
export function zoneDataReady(): boolean {
  return loaded !== undefined;
}

/** The loaded `tz-lookup` function. Throws `TimeDataNotReadyError` until `loadZoneData` has resolved. */
export function zoneLookupModule(): typeof tzlookupType {
  if (loaded === undefined) throw new TimeDataNotReadyError();
  return loaded.tzlookup;
}

/** The loaded luxon module. Throws `TimeDataNotReadyError` until `loadZoneData` has resolved. */
export function luxonModule(): typeof LuxonModule {
  if (loaded === undefined) throw new TimeDataNotReadyError();
  return loaded.luxon;
}
