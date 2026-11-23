/**
 * The Swiss Ephemeris boundary: the only module in Astraya that touches
 * `sweph-wasm`.
 *
 * This is deliberately a plain module rather than worker-only code, so the same
 * implementation runs on the main thread, inside a Web Worker, and directly in
 * Node under Vitest. The golden-chart gate therefore tests exactly what ships.
 *
 * Two properties of the underlying library shaped this file and are easy to get
 * wrong, so they are asserted rather than assumed:
 *
 * 1. `swe_houses_ex2` returns 13 cusps with **index 0 unused** — houses are
 *    1..12, matching the C API and every astrological text. The package's own
 *    type declarations claim `cusp[0]` is the first house; that is wrong, and
 *    believing it rotates every chart by one house. Verified empirically:
 *    `cusps[1] === ascmc[0]` (Ascendant) and `cusps[10] === ascmc[1]` (MC).
 *
 * 2. Sidereal mode and the topocentric observer are *global mutable state* on
 *    the WASM instance, not per-call arguments. Every call that depends on them
 *    sets them first. Relying on a previous call's setting is how a sidereal
 *    request silently returns tropical longitudes.
 */

/**
 * @module ephemeris/engine
 * @purpose Implements EphemerisProvider directly against sweph-wasm — the sole module permitted to import sweph-wasm — so Swiss Ephemeris calculations run identically on the main thread, in a Web Worker, or under Vitest.
 * @conventions House cusps are indexed 1..12 with index 0 unused, matching the C API; sidereal mode and the topocentric observer are global mutable WASM state that must be set before every call that depends on them; dates outside the shipped 1800-2399 CE ephemeris range are refused rather than silently computed via the lower-precision fallback theory.
 * @exports EngineConfig, SwissEphemerisEngine
 */
import { EPHEMERIS_DATA_FILES, EPHEMERIS_YEAR_RANGE, EPHE_BASE_URL, FIXED_STARS_ASSET } from './assets.js';
import { SE } from './generated-constants.js';
import {
  EphemerisError,
  type EphemerisErrorContext,
  type AzimuthAltitudeOptions,
  type BodyId,
  type BodyPosition,
  type CalendarSystem,
  type Degrees,
  type EphemerisProvider,
  type FixedStarMagnitude,
  type FixedStarPosition,
  type GeoPosition,
  type RiseTransitEvent,
  type RiseTransitHorizon,
  type HorizontalPosition,
  type HousePositions,
  type HouseSystem,
  type JulianDayUT,
  type LunarEclipse,
  type LunarEclipseKind,
  type PositionOptions,
  type SolarEclipse,
  type SolarEclipseKind,
  type UserAyanamsa,
  type Zodiac,
} from './types.js';

/** Index of each value in the `ascmc` array returned by the houses functions. */
const ASCMC = {
  ascendant: 0,
  midheaven: 1,
  armc: 2,
  vertex: 3,
  equatorialAscendant: 4,
  coAscendantKoch: 5,
  coAscendantMunkasey: 6,
  polarAscendant: 7,
} as const;

/**
 * Placidus, Koch and their variants are undefined near the poles (roughly
 * beyond +/-66.5 degrees latitude). `sweph-wasm` detects this itself and
 * throws rather than silently returning cusps for a different system, naming
 * the fallback it would have used in the message — e.g. "within polar
 * circle, switched to Porphyry". Verified empirically across every house
 * system and both hemispheres (#20): only Placidus, Koch, Gauquelin sectors
 * and 'Sunshine/alt.' ever fail this way, and the named fallback is always
 * Porphyry. Keyed by name rather than hardcoded, so an unrecognised fallback
 * name fails loudly instead of silently mis-rendering.
 */
const POLAR_FALLBACK_BY_NAME: Readonly<Record<string, HouseSystem>> = { Porphyry: 'O' };

/**
 * The star name as the fixed-star calls must receive it (#803). The C functions treat `star` as an in/out buffer of
 * `SE_MAX_STNAME` characters and write the full "name,designation" back into it, but `sweph-wasm` allocates only the
 * requested name's length plus one. A short request ("Vega" resolving to "Vega,alLyr") therefore overruns the WASM
 * heap: the name comes back cut short and later lookups abort with a segmentation fault (seen for Polaris). Padding
 * with spaces gives the call a full-size buffer; Swiss Ephemeris removes every blank from a search name before it
 * matches (`fixstar_format_search_name`, swephlib), so the padding never changes which star is found.
 */
function starNameBuffer(name: string): string {
  return name.padEnd(SE.SE_MAX_STNAME - 1, ' ');
}

/** Gregorian calendar, as opposed to Julian. */
const GREGORIAN = SE.SE_GREG_CAL;
const JULIAN = SE.SE_JUL_CAL;

/** Swiss Ephemeris `gregflag` for a resolved calendar. */
/** What `#sidModeSet` records: the mode, plus a user ayanamsa's definition so a changed one is set again. */
function sidModeKey(mode: number, user: UserAyanamsa | undefined): string {
  return user === undefined ? String(mode) : `${String(mode)}|${user.referenceDate}|${String(user.degrees)}`;
}

function gregflag(calendar: CalendarSystem): number {
  return calendar === 'julian' ? JULIAN : GREGORIAN;
}

/**
 * Base flags for every position request.
 *
 * `SEFLG_SWIEPH` selects the compressed Swiss Ephemeris data files rather than
 * the built-in Moshier analytic theory, which is orders of magnitude less
 * accurate. `SEFLG_SPEED` is always on: speed is what tells us a planet is
 * retrograde, and it is needed for progressions.
 */
const BASE_FLAGS = SE.SEFLG_SWIEPH | SE.SEFLG_SPEED;

export interface EngineConfig {
  /**
   * Base URL the `.se1` files are served from. Same-origin `/ephe/` in the
   * browser; a `file://` URL in Node tests.
   */
  readonly epheBaseUrl?: string;
  /** Optional override for the WASM binary location. */
  readonly wasmUrl?: string;
}

/** The WASM-heap pointers the two raw house calls share (#1859, #1407). */
interface HouseBuffers {
  readonly cusps: number;
  readonly ascmc: number;
  readonly cuspSpeed: number;
  readonly ascmcSpeed: number;
  readonly serr: number;
}

/** Minimal shape of the sweph-wasm instance, kept local to this module. */
interface SweInstance {
  wasm: {
    FS: { analyzePath(path: string, dontResolveLastLink?: boolean): { exists: boolean } };
    /** The raw Emscripten exports `#calcUt` uses to call `swe_calc_ut` with reused buffers (#1856). */
    _malloc(bytes: number): number;
    _free(pointer: number): void;
    _swe_calc_ut(jd: number, body: number, flags: number, xx: number, serr: number): number;
    /** The raw `swe_houses_ex2` export `#housesEx2` uses with reused buffers (#1859); `hsys` is the system's char code. */
    _swe_houses_ex2(
      jd: number,
      flags: number,
      latitude: number,
      longitude: number,
      hsys: number,
      cusps: number,
      ascmc: number,
      cuspSpeed: number,
      ascmcSpeed: number,
      serr: number,
    ): number;
    /** The raw `swe_houses_armc_ex2` export `#housesArmcEx2` uses with the same reused buffers (#1407). */
    _swe_houses_armc_ex2(
      armc: number,
      latitude: number,
      obliquity: number,
      hsys: number,
      cusps: number,
      ascmc: number,
      cuspSpeed: number,
      ascmcSpeed: number,
      serr: number,
    ): number;
    /** The raw `swe_rise_trans` export `#riseTrans` uses with reused buffers (#1407); `star` is 0 for a planet. */
    _swe_rise_trans(
      jd: number,
      body: number,
      star: number,
      ephemerisFlags: number,
      rsmi: number,
      geopos: number,
      pressure: number,
      temperature: number,
      tret: number,
      serr: number,
    ): number;
    setValue(pointer: number, value: number, type: 'double'): void;
    getValue(pointer: number, type: 'double'): number;
    UTF8ToString(pointer: number): string;
  };
  swe_set_ephe_path(url?: string, files?: readonly string[]): Promise<unknown>;
  swe_set_sid_mode(mode: number, t0: number, ayanT0: number): void;
  swe_set_topo(longitude: number, latitude: number, altitude: number): void;
  swe_julday(year: number, month: number, day: number, hour: number, gregflag: number): number;
  swe_utc_to_jd(
    year: number,
    month: number,
    day: number,
    hour: number,
    minute: number,
    second: number,
    gregflag: number,
  ): readonly number[];
  swe_calc_ut(jd: number, body: number, flags: number): readonly number[];
  swe_houses_ex2(
    jd: number,
    flags: number,
    latitude: number,
    longitude: number,
    hsys: string,
  ): { cusps: readonly (number | null)[]; ascmc: readonly number[] };
  swe_get_ayanamsa_ex_ut(jd: number, flags: number): number;
  swe_get_ayanamsa_name(mode: number): string;
  swe_house_name(hsys: string): string;
  swe_fixstar2_ut(star: string, tjd_ut: number, iflag: number): { star_name: string; data: readonly number[] };
  swe_fixstar2_mag(star: string): { star_name: string; magnitude: number };
  swe_solcross_ut(x2cross: number, jd_ut: number, flag: number): number;
  swe_mooncross_ut(x2cross: number, jd_ut: number, flag: number): number;
  /** The bare times array — see `nextSolarEclipse` for why this is not the `{ flag, data }` the package declares. */
  swe_sol_eclipse_when_glob(tjd_start: number, ifl: number, iftype: number, backwards: boolean): readonly number[];
  swe_sol_eclipse_where(tjd_ut: number, ifl: number): { data: readonly number[]; Array: readonly number[] };
  swe_lun_eclipse_when(tjd_start: number, ifl: number, ifltype: number, backwards: boolean): readonly number[];
  swe_azalt(
    tjd_ut: number,
    calc_flag: number,
    geopos: readonly [number, number, number],
    atpress: number,
    attemp: number,
    xin: readonly [number, number, number],
  ): readonly number[];
  swe_version(): string;
  swe_close(): void;
}

/**
 * The size of Swiss Ephemeris's error-message buffer, `AS_MAXCH` in `swephexp.h` (256 chars). `swe_calc_ut` writes at
 * most this many bytes into `serr`.
 */
const SERR_BYTES = 256;
/** `swe_calc_ut` fills six doubles: longitude, latitude, distance and their speeds. */
const CALC_RESULT_DOUBLES = 6;
/**
 * `swe_houses_ex2` buffer sizes (`swephexp.h`): the cusp arrays hold 37 doubles (Gauquelin's 36 sectors plus the unused
 * index 0), the ascmc arrays 10. Every other system fills cusps 0..12 and ascmc 0..7.
 */
const HOUSE_CUSP_DOUBLES = 37;
/** `swe_rise_trans` returns -2 when the body does not rise or set that day (circumpolar or never up). */
const CIRCUMPOLAR = -2;
/** The atmosphere `riseTransit` assumes, the same defaults `azimuthAltitude` uses: 0 hPa (estimated by the library). */
const RISE_PRESSURE_HPA = 0;
const RISE_TEMPERATURE_C = 15;
/**
 * The true-horizon search (#1407): samples every 5 minutes, for up to 36 hours, more than the Moon's 24h50m cycle. A
 * grazing body that clears the horizon for less than one step can be missed, which then reads as not rising that day.
 */
const TRUE_HORIZON_STEP_DAYS = 5 / 1440;
const TRUE_HORIZON_WINDOW_DAYS = 1.5;
const HOUSE_ASCMC_DOUBLES = 10;

/** Normalise to the half-open interval [0, 360). */
function norm360(degrees: number): Degrees {
  const value = degrees % 360;
  return value < 0 ? value + 360 : value;
}

/** Forward arc from one ecliptic longitude to the next, always in [0, 360). */
function forwardArc(from: Degrees, to: Degrees): Degrees {
  const diff = (to - from) % 360;
  return diff < 0 ? diff + 360 : diff;
}

/**
 * How many times a closed loop of cusps winds forward around the ecliptic:
 * 1 for a normal, single-winding house system. Used to detect the Horizon
 * system's (#184) degeneracy near the celestial equator, where Swiss
 * Ephemeris's vertical-circle geometry becomes ill-conditioned and
 * `swe_houses_ex2` silently returns cusps that wind several times instead of
 * once — verified directly against the engine for the reported repro (jd
 * 2378897.625, latitude -1e-6): the raw cusps come back clustered into two
 * tight, *decreasing* runs near 0 and 180 degrees rather than spread every
 * ~30 degrees, and summing their forward arcs gives exactly 3960 = 11 x 360.
 * That is not a units or modulo-wrap bug in this codebase — the raw engine
 * output is already wrong before any normalisation touches it — so the fix
 * is to detect it and fail loudly rather than hand back a chart with
 * silently bogus houses.
 */
function windingCount(cusps: readonly Degrees[]): number {
  let total = 0;
  for (let i = 0; i < cusps.length; i += 1) {
    const from = cusps[i];
    const to = cusps[(i + 1) % cusps.length];
    if (from === undefined || to === undefined) throw new Error('windingCount: missing cusp');
    total += forwardArc(from, to);
  }
  return total / 360;
}

export class SwissEphemerisEngine implements EphemerisProvider {
  #swe: SweInstance | undefined;
  #initializing: Promise<void> | undefined;
  /** Tracks the sidereal mode currently set on the WASM instance, as `sidModeKey` gives it. */
  #sidModeSet: string | undefined;
  /**
   * The result and error buffers `#calcUt` reuses on every call (#1856), allocated once per WASM instance. sweph-wasm
   * 2.6.9's own `swe_calc_ut` allocates both on every call and frees only the result on success, leaking the 256-byte
   * error buffer each time: about 2.5 KB per ten-body `positions` call, which filled the 128 MB heap in a long session
   * and ended in `Aborted(segmentation fault)`.
   */
  #calcBuffers: { readonly xx: number; readonly serr: number } | undefined;
  /**
   * The buffers `#housesEx2` reuses (#1859). sweph-wasm's `swe_houses_ex2` frees its four result arrays only on
   * success, so every throw (each polar-latitude Placidus or Koch call, the "switched to Porphyry" path) leaked about
   * 750 bytes: 100,000 polar calls grew the heap from 16 MB to 83 MB.
   */
  #houseBuffers: HouseBuffers | undefined;
  /**
   * The buffers `#riseTrans` reuses (#1407): sweph-wasm 2.6.9's own `swe_rise_trans` never frees its geopos buffer,
   * frees nothing when it throws, and throws on the circumpolar return code, the same leak pattern as #1856 and #1859.
   */
  #riseBuffers: { readonly geopos: number; readonly tret: number; readonly serr: number } | undefined;
  readonly #config: EngineConfig;

  constructor(config: EngineConfig = {}) {
    this.#config = config;
  }

  async initialize(): Promise<void> {
    this.#initializing ??= this.#doInitialize();
    return this.#initializing;
  }

  async #doInitialize(): Promise<void> {
    const { default: SwissEPH } = await import('sweph-wasm');
    const swe = await (SwissEPH as unknown as { init(wasmPath?: string): Promise<SweInstance> }).init(
      this.#config.wasmUrl,
    );

    const baseUrl = this.#config.epheBaseUrl ?? EPHE_BASE_URL;
    const files = [...EPHEMERIS_DATA_FILES.map((asset) => asset.file), FIXED_STARS_ASSET.file];
    await swe.swe_set_ephe_path(baseUrl, files);

    // `swe_set_ephe_path` swallows per-file failures and only throws when EVERY
    // file fails to load. A partial load would silently fall back to the Moshier
    // theory for the missing bodies — wrong by arcminutes, with no error. So
    // verify each expected file actually landed in the WASM filesystem.
    const missing = files.filter((file) => !swe.wasm.FS.analyzePath(`/ephe/${file}`).exists);
    if (missing.length > 0) {
      throw new EphemerisError(
        `Ephemeris data files failed to load: ${missing.join(', ')}. ` +
          `Expected them under ${baseUrl}. Refusing to compute with reduced accuracy.`,
        { call: 'swe_set_ephe_path' },
      );
    }

    this.#swe = swe;
    this.#calcBuffers = undefined;
    this.#houseBuffers = undefined;
    this.#riseBuffers = undefined;
  }

  /**
   * `swe_houses_ex2` through the raw export with buffers allocated once and reused (#1859), so neither a success nor an
   * error allocates. Same contract as sweph-wasm's wrapper: cusps 0..12 (0..36 for Gauquelin 'G') and ascmc 0..7 back,
   * and an error carrying the library's own `serr` message (for example "within polar circle, switched to Porphyry")
   * when the return code is negative.
   */
  #housesEx2(
    jd: number,
    flags: number,
    latitude: number,
    longitude: number,
    system: string,
  ): { cusps: readonly number[]; ascmc: readonly number[] } {
    const { wasm } = this.#instance();
    const buffers = this.#ensureHouseBuffers();
    const code = wasm._swe_houses_ex2(
      jd,
      flags,
      latitude,
      longitude,
      system.charCodeAt(0),
      buffers.cusps,
      buffers.ascmc,
      buffers.cuspSpeed,
      buffers.ascmcSpeed,
      buffers.serr,
    );
    if (code < 0) throw new Error(wasm.UTF8ToString(buffers.serr));
    return this.#readHouseBuffers(system);
  }

  /**
   * `swe_houses_armc_ex2` through the raw export, on the same reused buffers as `#housesEx2` (#1407, #1859): houses
   * for an ARMC, a latitude and an obliquity, with no moment. sweph-wasm's wrapper frees nothing when it throws, like
   * the others. `ascmc[9]` is an input only for the Sunshine system, which `housesFromArmc` refuses, so the reused
   * buffer's old value there is never read.
   */
  #housesArmcEx2(
    armc: number,
    latitude: number,
    obliquity: number,
    system: string,
  ): { cusps: readonly number[]; ascmc: readonly number[] } {
    const { wasm } = this.#instance();
    const buffers = this.#ensureHouseBuffers();
    const code = wasm._swe_houses_armc_ex2(
      armc,
      latitude,
      obliquity,
      system.charCodeAt(0),
      buffers.cusps,
      buffers.ascmc,
      buffers.cuspSpeed,
      buffers.ascmcSpeed,
      buffers.serr,
    );
    if (code < 0) throw new Error(wasm.UTF8ToString(buffers.serr));
    return this.#readHouseBuffers(system);
  }

  /** The house buffers, allocated on first use and freed in `dispose()` (#1859). */
  #ensureHouseBuffers(): HouseBuffers {
    const { wasm } = this.#instance();
    this.#houseBuffers ??= {
      cusps: wasm._malloc(HOUSE_CUSP_DOUBLES * 8),
      ascmc: wasm._malloc(HOUSE_ASCMC_DOUBLES * 8),
      cuspSpeed: wasm._malloc(HOUSE_CUSP_DOUBLES * 8),
      ascmcSpeed: wasm._malloc(HOUSE_ASCMC_DOUBLES * 8),
      serr: wasm._malloc(SERR_BYTES),
    };
    return this.#houseBuffers;
  }

  /** Cusps 0..12 (0..36 for Gauquelin 'G') and ascmc 0..7, read back from the house buffers after a successful call. */
  #readHouseBuffers(system: string): { cusps: readonly number[]; ascmc: readonly number[] } {
    const { wasm } = this.#instance();
    const buffers = this.#ensureHouseBuffers();
    const read = (pointer: number, count: number): readonly number[] =>
      Array.from({ length: count }, (_, index) => wasm.getValue(pointer + index * 8, 'double'));
    return { cusps: read(buffers.cusps, system === 'G' ? HOUSE_CUSP_DOUBLES : 13), ascmc: read(buffers.ascmc, 8) };
  }

  /**
   * `swe_calc_ut` through the raw export, with buffers allocated once and reused (#1856): unlike sweph-wasm's wrapper, a
   * call allocates nothing, so nothing can leak. Same contract as the wrapper: six doubles back, and an error (with the
   * library's own message from `serr`) when the return code is negative.
   */
  #calcUt(jd: number, body: number, flags: number): readonly number[] {
    const { wasm } = this.#instance();
    this.#calcBuffers ??= { xx: wasm._malloc(CALC_RESULT_DOUBLES * 8), serr: wasm._malloc(SERR_BYTES) };
    const { xx, serr } = this.#calcBuffers;
    const code = wasm._swe_calc_ut(jd, body, flags, xx, serr);
    if (code < 0) throw new Error(wasm.UTF8ToString(serr));
    return Array.from({ length: CALC_RESULT_DOUBLES }, (_, index) => wasm.getValue(xx + index * 8, 'double'));
  }

  #instance(): SweInstance {
    if (!this.#swe) {
      throw new EphemerisError('Engine used before initialize() completed', { call: 'initialize' });
    }
    return this.#swe;
  }

  /**
   * Applies a zodiac choice, returning the flags to OR into the request.
   *
   * Sidereal mode is global state on the WASM instance, so it is set on every
   * sidereal call rather than once at startup.
   */
  #applyZodiac(zodiac: Zodiac | undefined): number {
    if (!zodiac || zodiac.kind === 'tropical') return 0;
    this.#setSidMode(zodiac.ayanamsa, zodiac.user);
    return SE.SEFLG_SIDEREAL;
  }

  /**
   * Sets the sidereal mode on the WASM instance unless it is already set. A user-defined ayanamsa (#1407) is
   * `SE_SIDM_USER` with its reference date (0h UT, so `SE_SIDBIT_USER_UT`) and its degrees at that date; Swiss
   * Ephemeris precesses it from there (programmer's documentation, `swe_set_sid_mode`).
   */
  #setSidMode(mode: number, user: UserAyanamsa | undefined): void {
    const key = sidModeKey(mode, user);
    if (this.#sidModeSet === key) return;
    const swe = this.#instance();
    if (mode === SE.SE_SIDM_USER) {
      if (user === undefined)
        throw new EphemerisError('A user-defined ayanamsa needs its reference date and degrees.', {
          call: 'swe_set_sid_mode',
        });
      const [year, month, day] = user.referenceDate.split('-').map(Number);
      if (year === undefined || month === undefined || day === undefined) {
        throw new EphemerisError(`Invalid user ayanamsa reference date: ${user.referenceDate}`, {
          call: 'swe_set_sid_mode',
        });
      }
      const t0 = swe.swe_julday(year, month, day, 0, GREGORIAN);
      swe.swe_set_sid_mode(SE.SE_SIDM_USER | SE.SE_SIDBIT_USER_UT, t0, user.degrees);
    } else {
      swe.swe_set_sid_mode(mode, 0, 0);
    }
    this.#sidModeSet = key;
  }

  #flagsFor(options: PositionOptions | undefined): number {
    let flags = BASE_FLAGS | this.#applyZodiac(options?.zodiac);
    if (options?.equatorial) flags |= SE.SEFLG_EQUATORIAL;
    if (options?.truePositions) flags |= SE.SEFLG_TRUEPOS;
    if (options?.observer) {
      if (options.heliocentric) {
        throw new EphemerisError('heliocentric and observer (topocentric) options are mutually exclusive', {
          call: 'swe_calc_ut',
        });
      }
      const swe = this.#instance();
      swe.swe_set_topo(options.observer.longitude, options.observer.latitude, options.observer.altitude);
      flags |= SE.SEFLG_TOPOCTR;
    }
    if (options?.heliocentric) flags |= SE.SEFLG_HELCTR;
    return flags;
  }

  async julianDay(
    year: number,
    month: number,
    day: number,
    hour: number,
    calendar: CalendarSystem = 'gregorian',
  ): Promise<JulianDayUT> {
    return this.#instance().swe_julday(year, month, day, hour, gregflag(calendar));
  }

  async julianDayFromUtc(
    year: number,
    month: number,
    day: number,
    hour: number,
    minute: number,
    second: number,
  ): Promise<JulianDayUT> {
    // Returns [jd_et, jd_ut]; we want UT. This path is leap-second aware, which
    // swe_julday is not, so it is preferred wherever a real UTC timestamp exists.
    const [, jdUt] = this.#instance().swe_utc_to_jd(year, month, day, hour, minute, second, GREGORIAN);
    if (jdUt === undefined) {
      throw new EphemerisError('swe_utc_to_jd returned no UT value', { call: 'swe_utc_to_jd' });
    }
    return jdUt;
  }

  async position(jd: JulianDayUT, body: BodyId, options?: PositionOptions): Promise<BodyPosition> {
    this.#assertInRange(jd, body);
    if (options?.heliocentric && body === SE.SE_SUN) {
      // The library returns (0, 0, 0) for this rather than an error — its own
      // position as seen from itself. That is not a real position, so refuse
      // rather than hand back a longitude of 0 that looks like Aries.
      throw new EphemerisError('the Sun has no heliocentric position', { call: 'swe_calc_ut', jd, body });
    }
    const flags = this.#flagsFor(options);
    let raw: readonly number[];
    try {
      raw = this.#calcUt(jd, body, flags);
    } catch (cause) {
      throw new EphemerisError(cause instanceof Error ? cause.message : String(cause), {
        call: 'swe_calc_ut',
        jd,
        body,
      });
    }
    const [longitude, latitude, distance, longitudeSpeed, latitudeSpeed, distanceSpeed] = raw as [
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    return {
      body,
      longitude: norm360(longitude),
      latitude,
      distance,
      longitudeSpeed,
      latitudeSpeed,
      distanceSpeed,
      retrograde: longitudeSpeed < 0,
    };
  }

  async positions(
    jd: JulianDayUT,
    bodies: readonly BodyId[],
    options?: PositionOptions,
  ): Promise<readonly BodyPosition[]> {
    // Sequential on purpose: the WASM instance is single-threaded and the
    // topocentric/sidereal setters are global, so concurrent calls would race.
    const out: BodyPosition[] = [];
    for (const body of bodies) out.push(await this.position(jd, body, options));
    return out;
  }

  async houses(jd: JulianDayUT, place: GeoPosition, system: HouseSystem, zodiac?: Zodiac): Promise<HousePositions> {
    const flags = this.#applyZodiac(zodiac);
    return this.#housesWithFallback(system, place.latitude, { call: 'swe_houses_ex2', jd }, (candidate) =>
      this.#housesEx2(jd, flags, place.latitude, place.longitude, candidate),
    );
  }

  async housesFromArmc(
    armc: Degrees,
    latitude: Degrees,
    obliquity: Degrees,
    system: HouseSystem,
  ): Promise<HousePositions> {
    if (system === 'I') {
      throw new EphemerisError(
        "House system 'I' (Sunshine) needs the Sun's declination, which housesFromArmc does not take.",
        { call: 'swe_houses_armc_ex2' },
      );
    }
    return this.#housesWithFallback(system, latitude, { call: 'swe_houses_armc_ex2' }, (candidate) =>
      this.#housesArmcEx2(armc, latitude, obliquity, candidate),
    );
  }

  /**
   * The shared tail of `houses` and `housesFromArmc`: the polar fallback (Placidus and Koch switch to Porphyry inside
   * the polar circle, with a warning), the Horizon system's degeneracy refusal, and the cusp/angle normalisation.
   */
  #housesWithFallback(
    system: HouseSystem,
    latitude: Degrees,
    context: EphemerisErrorContext,
    compute: (candidate: HouseSystem) => { cusps: readonly (number | null)[]; ascmc: readonly number[] },
  ): HousePositions {
    let result: { cusps: readonly (number | null)[]; ascmc: readonly number[] };
    let effectiveSystem = system;
    let warning: string | undefined;
    try {
      result = compute(system);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      const fallbackName = /switched to (.+)$/i.exec(message)?.[1];
      const fallback = fallbackName === undefined ? undefined : POLAR_FALLBACK_BY_NAME[fallbackName];
      if (fallback === undefined) {
        // Not the polar-latitude case we know how to recover from — surfacing
        // it is mandatory either way: rendering unlabelled cusps for whatever
        // the C library fell back to internally would be a silently wrong chart.
        throw new EphemerisError(`${message} (house system '${system}' at latitude ${latitude})`, context);
      }
      try {
        result = compute(fallback);
      } catch (fallbackCause) {
        throw new EphemerisError(
          `${fallbackCause instanceof Error ? fallbackCause.message : String(fallbackCause)} ` +
            `(fallback house system '${fallback}' at latitude ${latitude})`,
          context,
        );
      }
      effectiveSystem = fallback;
      warning = `House system '${system}' is undefined at latitude ${latitude}°: ${message}.`;
    }

    // Index 0 is unused; houses are 1..12. See the note at the top of this file.
    const cusps: Degrees[] = [Number.NaN];
    for (let house = 1; house < result.cusps.length; house += 1) {
      const value = result.cusps[house];
      if (typeof value !== 'number') {
        throw new EphemerisError(`Cusp ${house} missing from ${context.call} result`, context);
      }
      cusps.push(norm360(value));
    }

    // The Horizon system ('H') has no library-flagged failure mode like
    // Placidus/Koch's polar fallback above — Swiss Ephemeris returns
    // successfully even when its cusps are geometrically degenerate (#184).
    // There is no known fallback system to switch to (unlike the polar
    // case), so the only honest option is to refuse rather than silently
    // hand back a chart whose houses don't actually divide the ecliptic once
    // around.
    if (effectiveSystem === 'H') {
      const winding = windingCount(cusps.slice(1));
      if (Math.abs(winding - 1) > 1e-6) {
        throw new EphemerisError(
          `House system 'H' (Horizon) is degenerate at latitude ${latitude}° for this sidereal time: ` +
            `its cusps wind ${winding.toFixed(3)}x around the ecliptic instead of once. Swiss Ephemeris's ` +
            `vertical-circle geometry for this system becomes ill-conditioned very close to the celestial ` +
            `equator, depending on the sidereal time of the moment; there is no fallback house system for it. ` +
            `Choose a different house system for this location and time.`,
          context,
        );
      }
    }

    const at = (index: number): Degrees => {
      const value = result.ascmc[index];
      if (value === undefined) {
        throw new EphemerisError(`ascmc[${index}] missing from ${context.call} result`, context);
      }
      return norm360(value);
    };

    const houses: HousePositions = {
      cusps,
      ascendant: at(ASCMC.ascendant),
      midheaven: at(ASCMC.midheaven),
      armc: at(ASCMC.armc),
      vertex: at(ASCMC.vertex),
      equatorialAscendant: at(ASCMC.equatorialAscendant),
      coAscendantKoch: at(ASCMC.coAscendantKoch),
      coAscendantMunkasey: at(ASCMC.coAscendantMunkasey),
      polarAscendant: at(ASCMC.polarAscendant),
      system: effectiveSystem,
    };
    return warning === undefined ? houses : { ...houses, warning };
  }

  async houseSystemName(system: HouseSystem): Promise<string> {
    return this.#instance().swe_house_name(system);
  }

  async ayanamsa(jd: JulianDayUT, mode: number, options?: { readonly mean?: boolean }): Promise<Degrees> {
    this.#setSidMode(mode, undefined);
    const flags = options?.mean === true ? SE.SEFLG_SWIEPH | SE.SEFLG_NONUT : SE.SEFLG_SWIEPH;
    return this.#instance().swe_get_ayanamsa_ex_ut(jd, flags);
  }

  async ayanamsaName(mode: number): Promise<string> {
    return this.#instance().swe_get_ayanamsa_name(mode);
  }

  async obliquity(jd: JulianDayUT): Promise<Degrees> {
    let raw: readonly number[];
    try {
      // SE_ECL_NUT is a pseudo-body: swe_calc_ut returns [true obliquity, mean
      // obliquity, nutation in longitude, nutation in obliquity] instead of a
      // position. Index 0 is what we want.
      raw = this.#calcUt(jd, SE.SE_ECL_NUT, SE.SEFLG_SWIEPH);
    } catch (cause) {
      throw new EphemerisError(cause instanceof Error ? cause.message : String(cause), {
        call: 'swe_calc_ut',
        jd,
      });
    }
    const [trueObliquity] = raw as [number, number, number, number];
    return trueObliquity;
  }

  async fixedStar(jd: JulianDayUT, name: string, options?: PositionOptions): Promise<FixedStarPosition> {
    const flags = this.#flagsFor(options);
    let result: { star_name: string; data: readonly number[] };
    try {
      result = this.#instance().swe_fixstar2_ut(starNameBuffer(name), jd, flags);
    } catch (cause) {
      throw new EphemerisError(cause instanceof Error ? cause.message : String(cause), {
        call: 'swe_fixstar2_ut',
        jd,
        star: name,
      });
    }
    const [longitude, latitude, distance, longitudeSpeed, latitudeSpeed, distanceSpeed] = result.data as [
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    return {
      name: result.star_name.trim(),
      longitude: norm360(longitude),
      latitude,
      distance,
      longitudeSpeed,
      latitudeSpeed,
      distanceSpeed,
    };
  }

  async fixedStarMagnitude(name: string): Promise<FixedStarMagnitude> {
    let result: { star_name: string; magnitude: number };
    try {
      result = this.#instance().swe_fixstar2_mag(starNameBuffer(name));
    } catch (cause) {
      throw new EphemerisError(cause instanceof Error ? cause.message : String(cause), {
        call: 'swe_fixstar2_mag',
        star: name,
      });
    }
    return { name: result.star_name.trim(), magnitude: result.magnitude };
  }

  async nextSunCrossing(fromJd: JulianDayUT, longitude: Degrees, zodiac?: Zodiac): Promise<JulianDayUT> {
    return this.#crossing('swe_solcross_ut', longitude, fromJd, zodiac);
  }

  async nextMoonCrossing(fromJd: JulianDayUT, longitude: Degrees, zodiac?: Zodiac): Promise<JulianDayUT> {
    return this.#crossing('swe_mooncross_ut', longitude, fromJd, zodiac);
  }

  async nextSolarEclipse(fromJd: JulianDayUT, backwards = false): Promise<SolarEclipse> {
    // Eclipse searches are geometry-only: they take no zodiac or observer, so there is no
    // global state to set first (unlike every longitude-reading call above).
    //
    // sweph-wasm's own declarations promise `{ flag, error, data }` here. The live call returns
    // the bare time array and no type flag at all, so the eclipse's kind is worked out below from
    // the core-shadow sign rather than read off a flag that never arrives.
    const call = 'swe_sol_eclipse_when_glob';
    const swe = this.#instance();
    let times: readonly number[];
    try {
      times = swe.swe_sol_eclipse_when_glob(fromJd, SE.SEFLG_SWIEPH, 0, backwards);
    } catch (cause) {
      throw new EphemerisError(cause instanceof Error ? cause.message : String(cause), { call, jd: fromJd });
    }
    const [maxJd = 0, , startJd = 0, endJd = 0, centralStart = 0, centralEnd = 0] = times;
    if (maxJd === 0) {
      throw new EphemerisError(`${call} found no eclipse from Julian day ${String(fromJd)}`, { call, jd: fromJd });
    }
    // SE reports an absent phase as 0, which is not a Julian day anyone will search for.
    const central = centralStart !== 0 && centralEnd !== 0;
    let kind: SolarEclipseKind = 'partial';
    if (central) {
      // The core shadow's diameter in km (attr[3]): negative where the umbra reaches the ground
      // (a total eclipse), positive where it falls short (annular). Sampled at the exact ends of
      // the central line and at maximum: all negative is total, all positive annular, and a flip
      // along the line — annular at the ends, total in the middle — is a hybrid.
      const coreAt = (jd: JulianDayUT): number => {
        try {
          return swe.swe_sol_eclipse_where(jd, SE.SEFLG_SWIEPH).Array[3] ?? 0;
        } catch (cause) {
          throw new EphemerisError(cause instanceof Error ? cause.message : String(cause), {
            call: 'swe_sol_eclipse_where',
            jd,
          });
        }
      };
      const signs = [coreAt(centralStart), coreAt(maxJd), coreAt(centralEnd)].map((core) => core < 0);
      kind = signs.every(Boolean) ? 'total' : signs.some(Boolean) ? 'hybrid' : 'annular';
    }
    return {
      kind,
      maxJd,
      startJd,
      endJd,
      ...(central ? { centralStartJd: centralStart, centralEndJd: centralEnd } : {}),
    };
  }

  async nextLunarEclipse(fromJd: JulianDayUT, backwards = false): Promise<LunarEclipse> {
    const call = 'swe_lun_eclipse_when';
    let times: readonly number[];
    try {
      times = this.#instance().swe_lun_eclipse_when(fromJd, SE.SEFLG_SWIEPH, 0, backwards);
    } catch (cause) {
      throw new EphemerisError(cause instanceof Error ? cause.message : String(cause), { call, jd: fromJd });
    }
    const [maxJd = 0, , partialStart = 0, partialEnd = 0, totalStart = 0, totalEnd = 0, penStart = 0, penEnd = 0] =
      times;
    if (maxJd === 0) {
      throw new EphemerisError(`${call} found no eclipse from Julian day ${String(fromJd)}`, { call, jd: fromJd });
    }
    // The phases SE fills in are the kind: totality means total, a partial phase without it is
    // partial, and only the penumbral contacts left means the Moon never touched the umbra.
    const kind: LunarEclipseKind = totalStart !== 0 ? 'total' : partialStart !== 0 ? 'partial' : 'penumbral';
    return {
      kind,
      maxJd,
      penumbralStartJd: penStart,
      penumbralEndJd: penEnd,
      ...(partialStart !== 0 ? { partialStartJd: partialStart, partialEndJd: partialEnd } : {}),
      ...(totalStart !== 0 ? { totalStartJd: totalStart, totalEndJd: totalEnd } : {}),
    };
  }

  #crossing(
    call: 'swe_solcross_ut' | 'swe_mooncross_ut',
    x2cross: Degrees,
    fromJd: JulianDayUT,
    zodiac: Zodiac | undefined,
  ): JulianDayUT {
    const flags = this.#applyZodiac(zodiac) | SE.SEFLG_SWIEPH;
    let jd: number;
    try {
      jd = this.#instance()[call](x2cross, fromJd, flags);
    } catch (cause) {
      throw new EphemerisError(cause instanceof Error ? cause.message : String(cause), { call, jd: fromJd });
    }
    // Per the library's own doc comment, a result smaller than the search start
    // signals failure rather than a genuine (impossible) backward crossing.
    if (jd < fromJd) {
      throw new EphemerisError(`${call} found no crossing of ${x2cross}° forward of Julian day ${fromJd}`, {
        call,
        jd: fromJd,
      });
    }
    return jd;
  }

  async riseTransit(
    jd: JulianDayUT,
    body: BodyId,
    place: GeoPosition,
    event: RiseTransitEvent,
    horizon: RiseTransitHorizon,
  ): Promise<JulianDayUT | undefined> {
    this.#assertInRange(jd, body);
    const kind = {
      rise: SE.SE_CALC_RISE,
      set: SE.SE_CALC_SET,
      culminate: SE.SE_CALC_MTRANSIT,
      anticulminate: SE.SE_CALC_ITRANSIT,
    }[event];
    if (horizon === 'visual' || event === 'culminate' || event === 'anticulminate') {
      return this.#riseTrans(jd, body, kind, place);
    }
    // True Altitude (Solar Fire §12.9): the centre on the astronomical horizon, ignoring "atmospheric refraction, the
    // size of the body and parallax effects". Swiss Ephemeris's disc-centre, no-refraction rise measures the
    // topocentric centre (about 0.9° of parallax away for the Moon), so the geocentric crossing is searched here
    // directly instead (astrologer review of PR #1940).
    return this.#trueHorizonCrossing(jd, body, place, event === 'rise');
  }

  /** The geocentric altitude of `body`'s centre at `jd` from `place`, without refraction. */
  async #geocentricAltitude(jd: JulianDayUT, body: BodyId, place: GeoPosition): Promise<Degrees> {
    const position = await this.position(jd, body);
    const horizontal = await this.azimuthAltitude(
      jd,
      { longitude: position.longitude, latitude: position.latitude },
      place,
    );
    return horizontal.altitude;
  }

  /**
   * The first moment after `jd` the geocentric centre of `body` crosses altitude 0 upwards (`rising`) or downwards, with
   * no refraction: sampled every `TRUE_HORIZON_STEP_DAYS` for up to `TRUE_HORIZON_WINDOW_DAYS` and bisected to a second.
   * `undefined` when there is no such crossing in that window: the body does not rise or set that day.
   */
  async #trueHorizonCrossing(
    jd: JulianDayUT,
    body: BodyId,
    place: GeoPosition,
    rising: boolean,
  ): Promise<JulianDayUT | undefined> {
    const at = (t: JulianDayUT): Promise<Degrees> => this.#geocentricAltitude(t, body, place);
    const crosses = (before: Degrees, after: Degrees): boolean =>
      rising ? before < 0 && after >= 0 : before > 0 && after <= 0;
    let low = jd;
    let lowValue = await at(low);
    for (
      let high = jd + TRUE_HORIZON_STEP_DAYS;
      high <= jd + TRUE_HORIZON_WINDOW_DAYS;
      high += TRUE_HORIZON_STEP_DAYS
    ) {
      const highValue = await at(high);
      if (crosses(lowValue, highValue)) {
        let from = low;
        let fromValue = lowValue;
        let to = high;
        while (to - from > 1 / 86400) {
          const mid = (from + to) / 2;
          const midValue = await at(mid);
          if (crosses(fromValue, midValue)) {
            to = mid;
          } else {
            from = mid;
            fromValue = midValue;
          }
        }
        // The upper end of the final bracket: at most a second after the crossing, never before it, so searching again
        // from the result finds the next event rather than this one.
        return to;
      }
      low = high;
      lowValue = highValue;
    }
    return undefined;
  }

  /**
   * `swe_rise_trans` through the raw export with buffers allocated once (#1407). Return code -2 means the body does not
   * rise or set that day (circumpolar or never up), which is an answer, not an error.
   */
  #riseTrans(jd: JulianDayUT, body: BodyId, rsmi: number, place: GeoPosition): JulianDayUT | undefined {
    const { wasm } = this.#instance();
    this.#riseBuffers ??= {
      geopos: wasm._malloc(3 * 8),
      tret: wasm._malloc(8),
      serr: wasm._malloc(SERR_BYTES),
    };
    const buffers = this.#riseBuffers;
    wasm.setValue(buffers.geopos, place.longitude, 'double');
    wasm.setValue(buffers.geopos + 8, place.latitude, 'double');
    wasm.setValue(buffers.geopos + 16, place.altitude, 'double');
    const code = wasm._swe_rise_trans(
      jd,
      body,
      0,
      SE.SEFLG_SWIEPH,
      rsmi,
      buffers.geopos,
      RISE_PRESSURE_HPA,
      RISE_TEMPERATURE_C,
      buffers.tret,
      buffers.serr,
    );
    if (code === CIRCUMPOLAR) return undefined;
    if (code < 0) throw new EphemerisError(wasm.UTF8ToString(buffers.serr), { call: 'swe_rise_trans', jd, body });
    return wasm.getValue(buffers.tret, 'double');
  }

  async azimuthAltitude(
    jd: JulianDayUT,
    point: { readonly longitude: Degrees; readonly latitude: Degrees },
    place: GeoPosition,
    options?: AzimuthAltitudeOptions,
  ): Promise<HorizontalPosition> {
    const calcFlag = options?.equatorial ? SE.SE_EQU2HOR : SE.SE_ECL2HOR;
    const geopos: [number, number, number] = [place.longitude, place.latitude, place.altitude];
    const xin: [number, number, number] = [point.longitude, point.latitude, 0];
    let raw: readonly number[];
    try {
      raw = this.#instance().swe_azalt(
        jd,
        calcFlag,
        geopos,
        options?.pressureHPa ?? 0,
        options?.temperatureC ?? 15,
        xin,
      );
    } catch (cause) {
      throw new EphemerisError(cause instanceof Error ? cause.message : String(cause), { call: 'swe_azalt', jd });
    }
    const [azSouthWest, altitude, apparentAltitude] = raw as [number, number, number];
    return { azimuth: norm360(azSouthWest + 180), altitude, apparentAltitude };
  }

  /** Underlying Swiss Ephemeris version string, for the About page. */
  async version(): Promise<string> {
    return this.#instance().swe_version();
  }

  async dispose(): Promise<void> {
    if (this.#swe !== undefined && this.#calcBuffers !== undefined) {
      this.#swe.wasm._free(this.#calcBuffers.xx);
      this.#swe.wasm._free(this.#calcBuffers.serr);
    }
    if (this.#swe !== undefined && this.#houseBuffers !== undefined) {
      const { cusps, ascmc, cuspSpeed, ascmcSpeed, serr } = this.#houseBuffers;
      for (const pointer of [cusps, ascmc, cuspSpeed, ascmcSpeed, serr]) this.#swe.wasm._free(pointer);
    }
    if (this.#swe !== undefined && this.#riseBuffers !== undefined) {
      const { geopos, tret, serr } = this.#riseBuffers;
      for (const pointer of [geopos, tret, serr]) this.#swe.wasm._free(pointer);
    }
    this.#calcBuffers = undefined;
    this.#houseBuffers = undefined;
    this.#riseBuffers = undefined;
    this.#swe?.swe_close();
    this.#swe = undefined;
    this.#initializing = undefined;
    this.#sidModeSet = undefined;
  }

  /**
   * The shipped `_18` data files cover 1800-2399 CE. Outside that window the
   * library falls back to lower-precision theory without complaint, so refuse
   * instead of returning numbers we cannot stand behind.
   */
  #assertInRange(jd: JulianDayUT, body: BodyId): void {
    const { first, last } = EPHEMERIS_YEAR_RANGE;
    // Julian day at 1800-01-01 and 2400-01-01, computed once rather than guessed.
    const swe = this.#instance();
    const lower = swe.swe_julday(first, 1, 1, 0, GREGORIAN);
    const upper = swe.swe_julday(last + 1, 1, 1, 0, GREGORIAN);
    if (jd < lower || jd >= upper) {
      throw new EphemerisError(
        `Julian day ${jd} is outside the shipped ephemeris range ${first}-${last} CE. ` +
          `Astraya refuses to compute with the reduced-accuracy fallback theory.`,
        { call: 'swe_calc_ut', jd, body },
      );
    }
  }
}
