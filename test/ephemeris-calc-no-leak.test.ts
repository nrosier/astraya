/**
 * The engine's `swe_calc_ut` path must not leak WASM memory (#1856). sweph-wasm 2.6.9's own `swe_calc_ut` frees only
 * its result buffer on success and leaks the 256-byte error buffer on every call: about 2.5 KB per ten-body
 * `positions` call. Measured before the fix: the 16 MB heap reached its 128 MB cap after roughly 60,000 calls, and the
 * next call that needed memory aborted with "Aborted(segmentation fault)", the error reported on the Graphic
 * ephemeris, Event search and Eclipses tools. The engine now calls the raw export with buffers it allocates once.
 *
 * The WASM instance is private to the engine, so this test captures it as the engine creates it, by wrapping
 * `SwissEPH.init`.
 */
import SwissEPH from 'sweph-wasm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SwissEphemerisEngine } from '../src/ephemeris/engine.js';
import { SE } from '../src/ephemeris/generated-constants.js';
import { EphemerisError } from '../src/ephemeris/types.js';
import { localEpheBaseUrl, localWasmUrl } from './engine-harness.js';

interface CapturedInstance {
  readonly wasm: { readonly wasmMemory: { readonly buffer: ArrayBuffer } };
  swe_calc_ut(jd: number, body: number, flags: number): readonly number[];
  swe_houses_ex2(
    jd: number,
    flags: number,
    latitude: number,
    longitude: number,
    hsys: string,
  ): { cusps: readonly (number | null)[]; ascmc: readonly number[] };
}

const BODIES = [
  SE.SE_SUN,
  SE.SE_MOON,
  SE.SE_MERCURY,
  SE.SE_VENUS,
  SE.SE_MARS,
  SE.SE_JUPITER,
  SE.SE_SATURN,
  SE.SE_URANUS,
  SE.SE_NEPTUNE,
  SE.SE_PLUTO,
];
const JD_2024 = 2_460_310.5;

let engine: SwissEphemerisEngine;
let captured: CapturedInstance | undefined;
const sweph = SwissEPH as unknown as { init: (...args: unknown[]) => Promise<CapturedInstance> };
const originalInit = sweph.init.bind(SwissEPH);

beforeAll(async () => {
  sweph.init = async (...args: unknown[]) => {
    captured = await originalInit(...args);
    return captured;
  };
  engine = new SwissEphemerisEngine({ epheBaseUrl: localEpheBaseUrl, wasmUrl: localWasmUrl });
  await engine.initialize();
  sweph.init = originalInit;
});

afterAll(async () => {
  await engine.dispose();
});

function heapBytes(): number {
  if (captured === undefined) throw new Error('the WASM instance was not captured');
  return captured.wasm.wasmMemory.buffer.byteLength;
}

describe('the engine does not leak WASM memory in swe_calc_ut (#1856)', () => {
  it('20,000 ten-body positions calls grow the heap by less than 1 MB (the library wrapper grew it by ~41 MB)', async () => {
    await engine.positions(JD_2024, BODIES);
    const before = heapBytes();
    for (let day = 0; day < 20_000; day += 1) await engine.positions(JD_2024 + day, BODIES);
    expect(heapBytes() - before).toBeLessThan(1024 * 1024);
  }, 120_000);

  it('returns exactly what the library wrapper returns', async () => {
    for (const body of BODIES) {
      const ours = await engine.position(JD_2024, body);
      const theirs = captured?.swe_calc_ut(JD_2024, body, SE.SEFLG_SWIEPH | SE.SEFLG_SPEED) ?? [];
      expect(ours.latitude).toBe(theirs[1]);
      expect(ours.distance).toBe(theirs[2]);
      expect(ours.longitudeSpeed).toBe(theirs[3]);
    }
  });

  it('still reports the library error for a call it rejects', async () => {
    await expect(engine.position(JD_2024, 99_999)).rejects.toBeInstanceOf(EphemerisError);
  });
});

describe('the engine does not leak WASM memory in swe_houses_ex2 (#1859)', () => {
  const POLAR = { latitude: 70, longitude: 20, altitude: 0 };

  it('60,000 polar-latitude Placidus calls (the "switched to Porphyry" path) grow the heap by less than 1 MB', async () => {
    await engine.houses(JD_2024, POLAR, 'P');
    const before = heapBytes();
    for (let step = 0; step < 60_000; step += 1) await engine.houses(JD_2024 + step * 0.01, POLAR, 'P');
    // Through sweph-wasm's wrapper each of these throws and leaks ~700 bytes: 100,000 grew the heap from 16 to 83 MB.
    expect(heapBytes() - before).toBeLessThan(1024 * 1024);
  }, 120_000);

  it('returns the same cusps and angles as the library wrapper, Gauquelin sectors included', async () => {
    const place = { latitude: 52.37, longitude: 4.9, altitude: 0 };
    for (const system of ['P', 'K', 'W', 'E', 'O', 'G'] as const) {
      const ours = await engine.houses(JD_2024, place, system);
      const theirs = captured?.swe_houses_ex2(JD_2024, 0, place.latitude, place.longitude, system);
      expect(ours.cusps.length, system).toBe(theirs?.cusps.length ?? 0);
      expect(ours.ascendant, system).toBeCloseTo((((theirs?.ascmc[0] ?? 0) % 360) + 360) % 360, 12);
    }
  });

  it('still falls back to Porphyry at a polar latitude, with the library message in the warning', async () => {
    const result = await engine.houses(JD_2024, POLAR, 'P');
    expect(result.system).toBe('O');
    expect(result.warning).toContain('switched to Porphyry');
  });
});

describe('the engine does not leak WASM memory in swe_houses_armc_ex2 (#1407)', () => {
  it('60,000 polar-latitude Placidus calls from an ARMC grow the heap by less than 1 MB', async () => {
    await engine.housesFromArmc(100, 70, 23.44, 'P');
    const before = heapBytes();
    for (let step = 0; step < 60_000; step += 1) await engine.housesFromArmc((step * 0.37) % 360, 70, 23.44, 'P');
    // sweph-wasm's own swe_houses_armc_ex2 frees nothing when it throws, which every one of these calls does.
    expect(heapBytes() - before).toBeLessThan(1024 * 1024);
  }, 120_000);
});
