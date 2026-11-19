/**
 * Identity lookups select explicit user columns (#1782, finding f): the TOTP secret ciphertext
 * (`totp_secret`, `totp_secret_iv`) must never load on an authenticated request. Runs against a real
 * temp SQLite file, with an enrolled TOTP user, and records the SQL text and raw rows each lookup reads.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { openDatabase, type Database } from '../server/db.ts';
import {
  getUserById,
  getUserByOidcIdentity,
  getUserByPasswordSetToken,
  getUserByUsername,
  getUserCredentialsByUsername,
} from '../server/auth/identity.ts';
import { hashBearerToken } from '../server/auth/token-hash.ts';

const ISSUER = 'https://idp.example.test';
const SUBJECT = 'subject-1';
const TOKEN = 'one-time-token';

let dir: string;
let db: Database;
let userId = '';
let sqlSeen: string[] = [];
let rowsSeen: unknown[] = [];

/** Wraps `db.prepare` so every lookup's SQL text and the raw row it returned are recorded. */
function recordingDb(inner: Database): Database {
  return new Proxy(inner, {
    get(target, prop, receiver) {
      if (prop !== 'prepare') {
        const value: unknown = Reflect.get(target, prop, receiver);
        return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
      }
      return (sql: string) => {
        sqlSeen.push(sql);
        const statement = target.prepare(sql);
        return new Proxy(statement, {
          get(stmt, key, r) {
            const value: unknown = Reflect.get(stmt, key, r);
            if (key === 'get' && typeof value === 'function') {
              return (...args: unknown[]) => {
                const row: unknown = (value as (...a: unknown[]) => unknown).apply(stmt, args);
                rowsSeen.push(row);
                return row;
              };
            }
            return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(stmt) : value;
          },
        });
      };
    },
  });
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'astraya-identity-columns-test-'));
  db = openDatabase(join(dir, 'astraya.db'));
  userId = randomUUID();
  db.prepare(
    `INSERT INTO users (id, username, password_hash, created_at, oidc_issuer, oidc_subject,
       password_set_token, password_set_token_expires_at, totp_secret, totp_secret_iv, totp_enabled_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    userId,
    'alice',
    'not-a-real-hash',
    new Date().toISOString(),
    ISSUER,
    SUBJECT,
    hashBearerToken(TOKEN),
    new Date(Date.now() + 60_000).toISOString(),
    randomBytes(36),
    randomBytes(12),
    new Date().toISOString(),
  );
  sqlSeen = [];
  rowsSeen = [];
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

function runEveryLookup(target: Database): unknown[] {
  return [
    getUserById(target, userId),
    getUserByUsername(target, 'alice'),
    getUserCredentialsByUsername(target, 'alice')?.user,
    getUserByOidcIdentity(target, ISSUER, SUBJECT),
    getUserByPasswordSetToken(target, TOKEN)?.user,
  ];
}

describe('server/auth/identity.ts user lookups (#1782)', () => {
  it('uses SQL with no SELECT * and no totp_ column name', () => {
    runEveryLookup(recordingDb(db));
    expect(sqlSeen).toHaveLength(5);
    for (const sql of sqlSeen) {
      expect(sql).not.toMatch(/SELECT\s+\*/i);
      expect(sql).not.toMatch(/totp_/i);
    }
  });

  it('for an enrolled TOTP user, neither the raw rows nor the returned users carry the TOTP secret', () => {
    const users = runEveryLookup(recordingDb(db));
    expect(rowsSeen).toHaveLength(5);
    for (const row of rowsSeen) {
      expect(row).toBeTypeOf('object');
      expect(row).not.toHaveProperty('totp_secret');
      expect(row).not.toHaveProperty('totp_secret_iv');
      expect(row).not.toHaveProperty('totp_enabled_at');
    }
    for (const user of users) {
      expect(user).toMatchObject({ id: userId, username: 'alice' });
      expect(user).not.toHaveProperty('totp_secret');
      expect(user).not.toHaveProperty('totp_secret_iv');
    }
    expect(getUserByPasswordSetToken(db, TOKEN)?.expiresAt).toEqual(expect.any(String));
  });
});
