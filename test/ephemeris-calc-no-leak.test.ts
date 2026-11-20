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
