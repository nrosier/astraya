/**
 * @module token-hash
 * @purpose One hashing helper for bearer secrets stored at rest (session cookie values, admin-issued set-password tokens), so a database read alone never yields a usable credential.
 * @conventions Plain unsalted SHA-256 hex is enough because the inputs are 122+ bits of random UUID, not user-chosen secrets; callers hash the raw value on the way in and store/compare only the hash, with no fallback that also tries the raw value.
 * @exports hashBearerToken
 */
import { createHash } from 'node:crypto';

/** Hex SHA-256 of a raw bearer secret; the only form that is stored or compared in the database. */
export function hashBearerToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}
