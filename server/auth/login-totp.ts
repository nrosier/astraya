/**
 * @module login-totp
 * @purpose The TOTP second step of `POST /api/auth/login` (#1500, slice 4): after the password has been verified, decides whether the account needs a code and checks the one sent with it, a current TOTP code or a single-use recovery code.
 * @conventions Called only once the password is valid. An account whose stored TOTP state is all NULL is decided from the row alone, without loading `ASTRAYA_ENCRYPTION_KEY`, so a password-only account signs in exactly as before. Only `isTotpEnabled` makes a code required; a pending enrolment is not challenged. A TOTP code goes through `verifyTotp` (the engine's own window) with the stored replay step and is then recorded with `recordAcceptedStep`; any other input is tried as a recovery code through `consumeRecoveryCode`, which spends it. Fails closed: a missing key, a malformed key or a stored state that will not read throws to the caller (the shared error handler answers a generic 500), never "not required". Nothing here logs, and no error carries the code, secret or key.
 * @exports LoginSecondStep, checkLoginSecondStep
 */
import type { Database } from '../db.ts';
import { loadEncryptionKey } from '../ops/crypto.ts';
import { verifyTotp } from './totp.ts';
import {
  TotpKeyMissingError,
  consumeRecoveryCode,
  isTotpEnabled,
  readTotpState,
  recordAcceptedStep,
} from './totp-store.ts';
import type { TotpState } from './totp-store.ts';

/** `not-required`: no TOTP enabled, sign in on the password. `accepted`: a valid code was spent. `refused`: no or wrong code. */
export type LoginSecondStep = 'not-required' | 'accepted' | 'refused';

interface LoginTotpState {
  readonly state: TotpState;
  readonly key: Buffer | null;
}

/**
 * Reads the state without the key first: an all-NULL row is 'off' and needs no key, so a password-only account never
 * depends on `ASTRAYA_ENCRYPTION_KEY`. A stored secret throws `TotpKeyMissingError` there, and only then is the key
 * loaded (a malformed key throws) and the state read again (an unset key throws again).
 */
function readLoginTotpState(db: Database, userId: string): LoginTotpState {
  try {
    return { state: readTotpState(db, null, userId), key: null };
  } catch (error) {
    if (!(error instanceof TotpKeyMissingError)) throw error;
  }
  const key = loadEncryptionKey();
  return { state: readTotpState(db, key, userId), key };
}

/** The second step for a user whose password was just verified. `code` is whatever the client sent, or undefined. */
export function checkLoginSecondStep(db: Database, userId: string, code: string | undefined): LoginSecondStep {
  const { state, key } = readLoginTotpState(db, userId);
  if (!isTotpEnabled(state)) {
    if (state.status === 'pending') state.secret.fill(0);
    return 'not-required';
  }
  if (code === undefined || code === '') {
    state.secret.fill(0);
    return 'refused';
  }
  let result: ReturnType<typeof verifyTotp>;
  try {
    result = verifyTotp(state.secret, code, Math.floor(Date.now() / 1000), state.lastStep ?? undefined);
  } finally {
    state.secret.fill(0);
  }
  if (result.ok) return recordAcceptedStep(db, userId, result.step) ? 'accepted' : 'refused';
  // An enabled state always came through the keyed read, so the key is set here.
  if (key === null) throw new TotpKeyMissingError();
  return consumeRecoveryCode(db, key, userId, code) ? 'accepted' : 'refused';
}
