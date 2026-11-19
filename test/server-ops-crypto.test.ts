/**
 * The payload cipher (`server/ops/crypto.ts`) on its own, below the database (#1782).
 *
 * Rotation and the relay test it through SQLite; this file pins the primitive's own
 * contract: the round trip, a wrong key failing closed without echoing plaintext, the
 * returned buffer being the caller's own copy, and the intermediate plaintext chunks
 * being zeroed on success and on failure. The last is observed by wrapping
 * `Buffer.prototype.fill` for the duration of one call, so no test seam is added to the public API.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { decryptPayload, encryptPayload } from '../server/ops/crypto.ts';

const KEY = randomBytes(32);
const OTHER_KEY = randomBytes(32);
const MARKER = 'astraya-plaintext-marker-1782';

function plaintextOf(size: number): Buffer {
  const marker = Buffer.from(MARKER, 'utf8');
  const out = Buffer.alloc(size);
  for (let i = 0; i < size; i += marker.length) marker.copy(out, i);
  return out;
}

interface FillTarget {
  fill: (this: Buffer, ...args: unknown[]) => Buffer;
}
const fillTarget = Buffer.prototype as unknown as FillTarget;
const originalFill = fillTarget.fill;

/** Records every buffer `fill(0)` is called on, without changing what `fill` does. */
function captureZeroFills(): Buffer[] {
  const zeroed: Buffer[] = [];
  fillTarget.fill = function (this: Buffer, ...args: unknown[]): Buffer {
    if (args[0] === 0) zeroed.push(this);
    return originalFill.apply(this, args);
  };
  return zeroed;
}

function restoreFill(): void {
  fillTarget.fill = originalFill;
}

afterEach(restoreFill);

describe('payload cipher', () => {
  it('round-trips the same bytes, small and large', () => {
    for (const size of [0, 1, 31, 4096, 70_000]) {
      const plaintext = plaintextOf(size);
      const { ciphertext, iv } = encryptPayload(plaintext, KEY);
      expect(decryptPayload(ciphertext, iv, KEY).equals(plaintext)).toBe(true);
    }
  });

  it('throws on the wrong key and leaks no plaintext in the error', () => {
    const { ciphertext, iv } = encryptPayload(plaintextOf(200), KEY);
    let caught: unknown;
    try {
      decryptPayload(ciphertext, iv, OTHER_KEY);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    const error = caught as Error;
    const surface = `${error.message}\n${error.stack ?? ''}\n${JSON.stringify(error)}`;
    expect(surface).not.toContain(MARKER);
    expect(surface).not.toContain('astraya-plaintext');
  });

  it('returns an independent buffer: mutating it does not change a second decrypt', () => {
    const plaintext = plaintextOf(128);
    const { ciphertext, iv } = encryptPayload(plaintext, KEY);
    const first = decryptPayload(ciphertext, iv, KEY);
    first.fill(0xff);
    const second = decryptPayload(ciphertext, iv, KEY);
    expect(second.equals(plaintext)).toBe(true);
    expect(second.buffer).not.toBe(first.buffer);
  });

  it('zeroes the intermediate plaintext chunks but not the returned buffer', () => {
    const plaintext = plaintextOf(5000);
    const { ciphertext, iv } = encryptPayload(plaintext, KEY);
    const zeroed = captureZeroFills();
    const result = decryptPayload(ciphertext, iv, KEY);
    restoreFill();

    expect(result.equals(plaintext)).toBe(true);
    expect(zeroed).not.toContain(result);
    expect(zeroed.some((chunk) => chunk.buffer === result.buffer)).toBe(false);
    // update() and final() each yield one chunk; together they held the whole plaintext.
    expect(zeroed.length).toBeGreaterThanOrEqual(1);
    expect(zeroed.reduce((sum, chunk) => sum + chunk.length, 0)).toBe(plaintext.length);
    for (const chunk of zeroed) expect(chunk.every((byte) => byte === 0)).toBe(true);
  });

  it('zeroes the unauthenticated update() chunk when the tag check fails', () => {
    const plaintext = plaintextOf(300);
    const { ciphertext, iv } = encryptPayload(plaintext, KEY);
    const tampered = Buffer.from(ciphertext);
    tampered[tampered.length - 1] = (tampered.at(-1) ?? 0) ^ 0x01;
    const zeroed = captureZeroFills();
    expect(() => decryptPayload(tampered, iv, KEY)).toThrow();
    restoreFill();

    // With the right key and a bad tag, update() still produced the real plaintext.
    expect(zeroed.reduce((sum, chunk) => sum + chunk.length, 0)).toBe(plaintext.length);
    for (const chunk of zeroed) expect(chunk.every((byte) => byte === 0)).toBe(true);
  });
});
