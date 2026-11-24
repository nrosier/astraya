/**
 * UI-thread client for the ephemeris worker.
 *
 * `WorkerEphemerisProvider` implements the same `EphemerisProvider` interface as
 * `SwissEphemerisEngine`, so `src/astrology/**` and the UI cannot tell which one
 * they hold. That is why every method on the interface is async: the worker is
 * invisible rather than special-cased, and tests can swap in the direct engine.
 */

/**
 * @module ephemeris/client
 * @purpose Provides the UI-thread client that talks to the ephemeris Web Worker over a message-based protocol, implementing the same EphemerisProvider interface as the direct engine.
 * @conventions Every provider method is async and routed through a single `#call` helper that tracks pending requests by id and times them out. An engine abort (an Emscripten `Aborted(...)` reply, or the worker dying) leaves the WASM instance unusable, so when a `spawn` factory is available the client discards that worker, starts and re-initialises a new one, and rejects only the requests queued on the dead one with `EphemerisEngineRestartedError` (#1856); without a factory, or after `MAX_RESTARTS` within `RESTART_WINDOW_MS`, the failure latches and every call rejects.
 * @exports EphemerisTransport, workerTransport, spawnEphemerisWorker, WorkerEphemerisOptions, WorkerEphemerisProvider, EphemerisEngineRestartedError, isEngineAbort, MAX_RESTARTS, RESTART_WINDOW_MS
 */

import {
  deserializeError,
  type EphemerisMethod,
  type EphemerisRequest,
  type EphemerisResponse,
  type EphemerisResult,
} from './protocol.js';
import type {
  AzimuthAltitudeOptions,
  BodyId,
  BodyPosition,
  CalendarSystem,
  Degrees,
  EphemerisProvider,
  FixedStarMagnitude,
  FixedStarPosition,
  GeoPosition,
  RiseTransitEvent,
  RiseTransitHorizon,
  HorizontalPosition,
  HousePositions,
  HouseSystem,
  JulianDayUT,
  LunarEclipse,
  PositionOptions,
  SolarEclipse,
  UserAyanamsa,
  Zodiac,
} from './types.js';

/**
 * The transport the client talks over.
 *
 * An interface rather than a hard dependency on `Worker` so the protocol can be
 * tested end to end in Node — including error round-tripping — without pulling in
 * a Worker polyfill. The production implementation is `workerTransport`.
 */
export interface EphemerisTransport {
  send(request: EphemerisRequest): void;
  onMessage(handler: (response: EphemerisResponse) => void): void;
  /** Reports transport-level failure: the worker died or failed to load. */
  onError(handler: (error: Error) => void): void;
  close(): void;
}

/** Wrap a real `Worker` as a transport. */
export function workerTransport(worker: Worker): EphemerisTransport {
  return {
    send: (request) => {
      worker.postMessage(request);
    },
    onMessage: (handler) => {
      worker.addEventListener('message', (event: MessageEvent<EphemerisResponse>) => {
        handler(event.data);
      });
    },
    onError: (handler) => {
      worker.addEventListener('error', (event: ErrorEvent) => {
        handler(new Error(`Ephemeris worker failed: ${event.message || 'unknown error'}`));
      });
    },
    close: () => {
      worker.terminate();
    },
  };
}

/** Spawn the bundled ephemeris worker. Vite rewrites this URL at build time. */
export function spawnEphemerisWorker(): EphemerisTransport {
  return workerTransport(new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }));
}

interface Pending {
  resolve(value: unknown): void;
  reject(error: Error): void;
  readonly timer: ReturnType<typeof setTimeout>;
}

/**
 * How long a single worker call may take before it is failed.
 *
 * Sized against `initialize`, which fetches the WASM engine and the ephemeris data files
 * over the network on a cold cache and is by far the slowest legitimate call — every
 * calculation after it is milliseconds. The bound exists for the case `#fail` cannot
 * cover: `nextSunCrossing`/`nextMoonCrossing` search iteratively, and a non-converging
 * search leaves the worker neither replying nor erroring, so without a timeout the
 * promise never settles and the UI shows the spinner-forever state this class exists to
 * prevent (#332).
 */
const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;

export interface WorkerEphemerisOptions {
  /** Overridable so a test can assert the timeout without waiting a minute for it. */
  readonly requestTimeoutMs?: number;
  /**
   * Starts a fresh transport after an engine abort (#1856). The default provider (no transport passed) uses
   * `spawnEphemerisWorker`; a caller that passes its own transport and no `spawn` keeps the old latch-on-failure
   * behaviour.
   */
  readonly spawn?: () => EphemerisTransport;
}

/**
 * The request that met an engine abort, or was queued on the engine when it aborted (#1856). The engine has been
 * restarted, so the same request can simply be tried again. `name` lets the UI show its own localised sentence.
 */
export class EphemerisEngineRestartedError extends Error {
  constructor() {
    super('The calculation engine stopped unexpectedly and has been restarted. Try again.');
    this.name = 'EphemerisEngineRestartedError';
  }
}

/**
 * Whether an error is an Emscripten abort: the WASM instance hit a fatal fault (`Aborted(segmentation fault)`, an
 * out-of-memory abort, ...). After one, every later call into the same instance fails the same way (#1856).
 */
export function isEngineAbort(error: Error): boolean {
  return error.message.startsWith('Aborted(') || (error.name === 'RuntimeError' && error.message.includes('Aborted'));
}

/** At most this many restarts within `RESTART_WINDOW_MS`; one more latches the failure, so a crash loop stops. */
export const MAX_RESTARTS = 3;
export const RESTART_WINDOW_MS = 5 * 60_000;

export class WorkerEphemerisProvider implements EphemerisProvider {
  #transport: EphemerisTransport;
  readonly #spawn: (() => EphemerisTransport) | undefined;
  readonly #pending = new Map<number, Pending>();
  readonly #requestTimeoutMs: number;
  #nextId = 1;
  #fatal: Error | undefined;
  /** Bumped on every restart; replies and errors from an older transport are ignored. */
  #generation = 0;
  /** Set once `initialize` has succeeded, so a restarted engine is initialised again before any other call. */
  #initialized = false;
  /** While a restarted engine initialises, calls wait on this before they are sent. */
  #ready: Promise<void> | undefined;
  readonly #restartTimes: number[] = [];

  constructor(transport?: EphemerisTransport, options: WorkerEphemerisOptions = {}) {
    this.#spawn = options.spawn ?? (transport === undefined ? spawnEphemerisWorker : undefined);
    this.#requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.#transport = transport ?? spawnEphemerisWorker();
    this.#wire(this.#transport);
  }

  #wire(transport: EphemerisTransport): void {
    const generation = this.#generation;
    transport.onMessage((response) => {
      if (generation === this.#generation) this.#settle(response);
    });
    transport.onError((error) => {
      if (generation === this.#generation) this.#engineDied(error);
    });
  }

  #settle(response: EphemerisResponse): void {
    const pending = this.#pending.get(response.id);
    // An unknown id means a reply arrived for a call we already failed or a
    // duplicate response. Dropping it is correct; throwing would be unhandled.
    if (pending === undefined) return;
    this.#pending.delete(response.id);
    clearTimeout(pending.timer);
    if (response.ok) {
      pending.resolve(response.value);
      return;
    }
    const error = deserializeError(response.error);
    if (isEngineAbort(error) && this.#spawn !== undefined) {
      this.#engineDied(error, pending);
      return;
    }
    pending.reject(error);
  }

  /**
   * The WASM instance aborted or the worker died (#1856). With a `spawn` factory, and fewer than `MAX_RESTARTS` in the
   * last `RESTART_WINDOW_MS`, the dead transport is dropped and a fresh one started and re-initialised; the call that
   * met the abort (`aborted`) and the calls queued on the dead engine are rejected with `EphemerisEngineRestartedError`
   * (they would only meet the same abort). Otherwise the failure latches, and those calls get the engine's own error:
   * no request is told "restarted" when no restart happened.
   */
  #engineDied(error: Error, aborted?: Pending): void {
    const now = Date.now();
    while (this.#restartTimes.length > 0 && now - (this.#restartTimes[0] ?? now) > RESTART_WINDOW_MS) {
      this.#restartTimes.shift();
    }
    if (this.#spawn === undefined || this.#restartTimes.length >= MAX_RESTARTS) {
      aborted?.reject(error);
      this.#fail(error);
      return;
    }
    this.#restartTimes.push(now);
    this.#generation += 1;
    aborted?.reject(new EphemerisEngineRestartedError());
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new EphemerisEngineRestartedError());
    }
    this.#pending.clear();
    try {
      this.#transport.close();
    } catch {
      // A transport that cannot even close is already gone; the new one replaces it either way.
    }
    this.#transport = this.#spawn();
    this.#wire(this.#transport);
    if (this.#initialized) {
      const ready: Promise<void> = this.#send('initialize', []).then(
        () => {
          if (this.#ready === ready) this.#ready = undefined;
        },
        (initError: unknown) => {
          this.#fail(initError instanceof Error ? initError : new Error(String(initError)));
        },
      );
      this.#ready = ready;
    }
  }

  /**
   * A dead worker is unrecoverable, so every in-flight call is rejected and the
   * failure is latched. Without this, calls would hang forever and the UI would
   * show a spinner instead of an error — the failure mode this project exists to
   * avoid.
   */
  #fail(error: Error): void {
    this.#fatal ??= error;
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.#pending.clear();
  }

  /**
   * A timed-out call fails only itself, unlike `#fail`: the worker is unresponsive for
   * this request, which is not the same as dead, and latching the whole provider fatal
   * would turn one stuck search into a permanently broken ephemeris. A real transport
   * failure still latches, via `onError`.
   */
  #expire(id: number, method: EphemerisMethod): void {
    const pending = this.#pending.get(id);
    if (pending === undefined) return;
    this.#pending.delete(id);
    pending.reject(new Error(`Ephemeris worker did not answer ${method} within ${String(this.#requestTimeoutMs)}ms.`));
  }

  #call<M extends EphemerisMethod>(method: M, args: Parameters<EphemerisProvider[M]>): Promise<EphemerisResult<M>> {
    if (this.#fatal !== undefined) return Promise.reject(this.#fatal);
    const ready = this.#ready;
    if (ready !== undefined) {
      return ready.then(() => (this.#fatal === undefined ? this.#send(method, args) : Promise.reject(this.#fatal)));
    }
    return this.#send(method, args);
  }

  #send<M extends EphemerisMethod>(method: M, args: Parameters<EphemerisProvider[M]>): Promise<EphemerisResult<M>> {
    const id = this.#nextId++;
    return new Promise<EphemerisResult<M>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#expire(id, method);
      }, this.#requestTimeoutMs);
      this.#pending.set(id, { resolve, reject, timer });
      try {
        this.#transport.send({ id, method, args } as EphemerisRequest);
      } catch (error) {
        this.#pending.delete(id);
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  async initialize(): Promise<void> {
    await this.#call('initialize', []);
    this.#initialized = true;
  }

  julianDay(year: number, month: number, day: number, hour: number, calendar?: CalendarSystem): Promise<JulianDayUT> {
    return this.#call('julianDay', [year, month, day, hour, calendar]);
  }

  julianDayFromUtc(
    year: number,
    month: number,
    day: number,
    hour: number,
    minute: number,
    second: number,
  ): Promise<JulianDayUT> {
    return this.#call('julianDayFromUtc', [year, month, day, hour, minute, second]);
  }

  position(jd: JulianDayUT, body: BodyId, options?: PositionOptions): Promise<BodyPosition> {
    return this.#call('position', [jd, body, options]);
  }

  positions(jd: JulianDayUT, bodies: readonly BodyId[], options?: PositionOptions): Promise<readonly BodyPosition[]> {
    return this.#call('positions', [jd, bodies, options]);
  }

  houses(jd: JulianDayUT, place: GeoPosition, system: HouseSystem, zodiac?: Zodiac): Promise<HousePositions> {
    return this.#call('houses', [jd, place, system, zodiac]);
  }

  housesFromArmc(
    armc: Degrees,
    latitude: Degrees,
    obliquity: Degrees,
    system: HouseSystem,
    sunDeclination?: Degrees,
  ): Promise<HousePositions> {
    return this.#call(
      'housesFromArmc',
      sunDeclination === undefined
        ? [armc, latitude, obliquity, system]
        : [armc, latitude, obliquity, system, sunDeclination],
    );
  }

  houseSystemName(system: HouseSystem): Promise<string> {
    return this.#call('houseSystemName', [system]);
  }

  ayanamsa(
    jd: JulianDayUT,
    mode: number,
    options?: { readonly mean?: boolean; readonly user?: UserAyanamsa },
  ): Promise<Degrees> {
    return this.#call('ayanamsa', options === undefined ? [jd, mode] : [jd, mode, options]);
  }

  ayanamsaName(mode: number): Promise<string> {
    return this.#call('ayanamsaName', [mode]);
  }

  obliquity(jd: JulianDayUT): Promise<Degrees> {
    return this.#call('obliquity', [jd]);
  }

  fixedStar(jd: JulianDayUT, name: string, options?: PositionOptions): Promise<FixedStarPosition> {
    return this.#call('fixedStar', [jd, name, options]);
  }

  fixedStarMagnitude(name: string): Promise<FixedStarMagnitude> {
    return this.#call('fixedStarMagnitude', [name]);
  }

  nextSunCrossing(fromJd: JulianDayUT, longitude: Degrees, zodiac?: Zodiac): Promise<JulianDayUT> {
    return this.#call('nextSunCrossing', [fromJd, longitude, zodiac]);
  }

  nextMoonCrossing(fromJd: JulianDayUT, longitude: Degrees, zodiac?: Zodiac): Promise<JulianDayUT> {
    return this.#call('nextMoonCrossing', [fromJd, longitude, zodiac]);
  }

  nextSolarEclipse(fromJd: JulianDayUT, backwards?: boolean): Promise<SolarEclipse> {
    return this.#call('nextSolarEclipse', [fromJd, backwards]);
  }

  nextLunarEclipse(fromJd: JulianDayUT, backwards?: boolean): Promise<LunarEclipse> {
    return this.#call('nextLunarEclipse', [fromJd, backwards]);
  }

  riseTransit(
    jd: JulianDayUT,
    body: BodyId,
    place: GeoPosition,
    event: RiseTransitEvent,
    horizon: RiseTransitHorizon,
  ): Promise<JulianDayUT | undefined> {
    return this.#call('riseTransit', [jd, body, place, event, horizon]);
  }

  azimuthAltitude(
    jd: JulianDayUT,
    point: { readonly longitude: Degrees; readonly latitude: Degrees },
    place: GeoPosition,
    options?: AzimuthAltitudeOptions,
  ): Promise<HorizontalPosition> {
    return this.#call('azimuthAltitude', [jd, point, place, options]);
  }

  version(): Promise<string> {
    return this.#call('version', []);
  }

  async dispose(): Promise<void> {
    if (this.#fatal !== undefined) return;
    try {
      await this.#call('dispose', []);
    } finally {
      this.#fail(new Error('Ephemeris worker has been disposed.'));
      this.#transport.close();
    }
  }
}
