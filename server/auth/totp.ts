/**
 * @module totp
 * @purpose Pure TOTP primitives for two-factor sign-in: RFC 6238 time steps over RFC 4226 HOTP with SHA-1, base32 secret encoding, and replay-checked verification. Stores nothing and performs no I/O.
 * @conventions Codes are 6-digit strings with a 30-second step and a +/-1 step window. Verification fails closed: any malformed input yields { ok: false }. Codes are compared with timingSafeEqual. Callers persist the returned step as lastAcceptedStep to block replay.
 * @exports TotpSecret, generateSecret, encodeBase32, totpAt, verifyTotp, TotpVerifyResult
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const STEP_SECONDS = 30;
const DIGITS = 6;
const SECRET_BYTES = 20;
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** A freshly generated shared secret: the raw bytes and their RFC 4648 base32 form (no padding). */
export interface TotpSecret {
  bytes: Uint8Array;
  base32: string;
}

/** Result of verifying a submitted code; `step` is the matched time step to persist as lastAcceptedStep. */
export type TotpVerifyResult = { ok: true; step: number } | { ok: false };

/** Generates a 160-bit secret from the system CSPRNG, returned as raw bytes and unpadded base32. */
export function generateSecret(): TotpSecret {
  const bytes = randomBytes(SECRET_BYTES);
  return { bytes, base32: encodeBase32(bytes) };
}

/** RFC 4648 base32 encoding (alphabet A-Z, 2-7) without padding. */
export function encodeBase32(bytes: Uint8Array): string {
  let out = '';
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += BASE32_ALPHABET.charAt((buffer >> bits) & 0x1f);
    }
  }
  if (bits > 0) {
    out += BASE32_ALPHABET.charAt((buffer << (5 - bits)) & 0x1f);
  }
  return out;
}

/** The 6-digit code for the 30-second step containing unixSeconds (RFC 6238 with SHA-1, RFC 4226 truncation). */
export function totpAt(secretBytes: Uint8Array, unixSeconds: number): string {
  const counter = Math.floor(unixSeconds / STEP_SECONDS);
  const counterBytes = Buffer.alloc(8);
  counterBytes.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', secretBytes).update(counterBytes).digest();
  const offset = (hmac[hmac.length - 1] ?? 0) & 0x0f;
  const binary =
    ((hmac[offset] ?? 0) & 0x7f) * 0x1000000 +
    ((hmac[offset + 1] ?? 0) & 0xff) * 0x10000 +
    ((hmac[offset + 2] ?? 0) & 0xff) * 0x100 +
    ((hmac[offset + 3] ?? 0) & 0xff);
  return String(binary % 10 ** DIGITS).padStart(DIGITS, '0');
}

/**
 * Checks a submitted code against the steps at -1, 0 and +1 around nowSeconds.
 * A match at or before lastAcceptedStep is rejected so a code cannot be replayed.
 * Malformed codes (not exactly six ASCII digits) fail closed without comparison.
 */
export function verifyTotp(
  secretBytes: Uint8Array,
  code: string,
  nowSeconds: number,
  lastAcceptedStep?: number,
): TotpVerifyResult {
  if (!/^[0-9]{6}$/.test(code)) {
    return { ok: false };
  }
  const submitted = Buffer.from(code, 'ascii');
  const nowStep = Math.floor(nowSeconds / STEP_SECONDS);
  let matched: number | null = null;
  for (const delta of [-1, 0, 1]) {
    const step = nowStep + delta;
    if (step < 0) continue;
    if (lastAcceptedStep !== undefined && step <= lastAcceptedStep) continue;
    const expected = Buffer.from(totpAt(secretBytes, step * STEP_SECONDS), 'ascii');
    if (timingSafeEqual(submitted, expected) && matched === null) {
      matched = step;
    }
  }
  return matched === null ? { ok: false } : { ok: true, step: matched };
}
