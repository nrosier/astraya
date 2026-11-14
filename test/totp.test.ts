/**
 * #1500 S1: TOTP engine. RFC 6238 Appendix B SHA-1 vectors (6-digit form, the last six digits of the 8-digit RFC values), the +/-1 step window, replay rejection, malformed-code rejection, and secret generation with base32 encoding.
 */
import { describe, expect, it } from 'vitest';
import { encodeBase32, generateSecret, totpAt, verifyTotp } from '../server/auth/totp.ts';

const RFC_SECRET = new TextEncoder().encode('12345678901234567890');
const STEP = 30;

describe('totpAt (RFC 6238 Appendix B, SHA-1)', () => {
  it.each([
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
    [20000000000, '353130'],
  ])('time %i yields %s', (time, expected) => {
    expect(totpAt(RFC_SECRET, time)).toBe(expected);
  });
});

describe('verifyTotp window and replay', () => {
  const now = 1111111109;
  const nowStep = Math.floor(now / STEP);
  const codeAt = (step: number) => totpAt(RFC_SECRET, step * STEP);

  it('accepts the code at step -1, 0 and +1', () => {
    expect(verifyTotp(RFC_SECRET, codeAt(nowStep - 1), now)).toEqual({ ok: true, step: nowStep - 1 });
    expect(verifyTotp(RFC_SECRET, codeAt(nowStep), now)).toEqual({ ok: true, step: nowStep });
    expect(verifyTotp(RFC_SECRET, codeAt(nowStep + 1), now)).toEqual({ ok: true, step: nowStep + 1 });
  });

  it('rejects the code at step -2 and +2', () => {
    expect(verifyTotp(RFC_SECRET, codeAt(nowStep - 2), now)).toEqual({ ok: false });
    expect(verifyTotp(RFC_SECRET, codeAt(nowStep + 2), now)).toEqual({ ok: false });
  });

  it('rejects a match at or before lastAcceptedStep (replay)', () => {
    expect(verifyTotp(RFC_SECRET, codeAt(nowStep), now, nowStep)).toEqual({ ok: false });
    expect(verifyTotp(RFC_SECRET, codeAt(nowStep - 1), now, nowStep)).toEqual({ ok: false });
  });

  it('accepts a match later than lastAcceptedStep', () => {
    expect(verifyTotp(RFC_SECRET, codeAt(nowStep + 1), now, nowStep)).toEqual({ ok: true, step: nowStep + 1 });
  });

  it('rejects a wrong code', () => {
    const correct = codeAt(nowStep);
    const wrong = correct === '000000' ? '000001' : '000000';
    expect(verifyTotp(RFC_SECRET, wrong, now)).toEqual({ ok: false });
  });

  it('rejects codes of the wrong length or non-digit form', () => {
    const correct = codeAt(nowStep);
    expect(verifyTotp(RFC_SECRET, correct.slice(0, 5), now)).toEqual({ ok: false });
    expect(verifyTotp(RFC_SECRET, `${correct}0`, now)).toEqual({ ok: false });
    expect(verifyTotp(RFC_SECRET, '', now)).toEqual({ ok: false });
    expect(verifyTotp(RFC_SECRET, `${correct.slice(0, 5)} `, now)).toEqual({ ok: false });
  });
});

describe('generateSecret', () => {
  it('returns 20 bytes and a 32-character unpadded base32 string', () => {
    const secret = generateSecret();
    expect(secret.bytes).toHaveLength(20);
    expect(secret.base32).toHaveLength(32);
    expect(secret.base32).toMatch(/^[A-Z2-7]{32}$/);
  });

  it('produces different secrets on each call', () => {
    expect(generateSecret().base32).not.toBe(generateSecret().base32);
  });

  it('encodes the RFC 4648 test vector for the 20-byte ASCII secret', () => {
    expect(encodeBase32(RFC_SECRET)).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  });
});
