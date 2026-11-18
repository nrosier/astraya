/**
 * Key rotation (#340, and saved interpretation results #1680), against a real temp SQLite file rather than a mock — the whole point
 * of the function is that the rows are still readable afterwards, and only the database can
 * say whether they are.
 *
 * The failure case matters more than the happy one. A partial rotation leaves a log in which
 * neither key decrypts every row, with no key version distinguishing them, so "nothing was
 * written" is the only acceptable outcome of a wrong current key.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { openDatabase, type Database } from '../server/db.ts';
import { CURRENT_KEY_VERSION, decryptPayload, encryptPayload } from '../server/ops/crypto.ts';
import { rotateEncryptionKey } from '../server/ops/rotate-key.ts';
import {
  getInterpretationResult,
  listInterpretationResults,
  saveInterpretationResult,
} from '../server/interpretation/results.ts';
import { createClock, randomNodeId, tick } from '../src/store/hlc.ts';

const OLD_KEY = randomBytes(32);
const NEW_KEY = randomBytes(32);

let dir: string;
let db: Database;
let userId = '';
let clock = createClock(randomNodeId());

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'astraya-rotate-test-'));
  db = openDatabase(join(dir, 'astraya.db'));
  const id = randomUUID();
  db.prepare('INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)').run(
    id,
    'alice',
    'not-a-real-hash',
    new Date().toISOString(),
  );
  userId = id;
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

/** Writes one encrypted row exactly as `server/ops/routes.ts` does, and returns its plaintext. */
function insertOp(key: Buffer, body: string): string {
  const stamped = tick(clock, Date.now());
  clock = stamped.clock;
  const { ciphertext, iv } = encryptPayload(Buffer.from(body, 'utf8'), key);
  db.prepare(
    'INSERT INTO ops (user_id, hlc, device_id, op_version, payload, key_version, iv, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(userId, stamped.hlc, clock.nodeId, 1, ciphertext, CURRENT_KEY_VERSION, iv, new Date().toISOString());
  return body;
}

function payloads(key: Buffer): string[] {
  const rows = db.prepare('SELECT payload, iv FROM ops ORDER BY seq').all() as unknown as {
    payload: Buffer;
    iv: Buffer | null;
  }[];
  return rows.map((row) => (row.iv ? decryptPayload(row.payload, row.iv, key).toString('utf8') : '<plaintext>'));
}

describe('rotateEncryptionKey', () => {
  it('makes every row readable under the new key and unreadable under the old one', () => {
    const written = [insertOp(OLD_KEY, '{"field":"one"}'), insertOp(OLD_KEY, '{"field":"two"}')];

    expect(rotateEncryptionKey(db, OLD_KEY, NEW_KEY)).toEqual({ rotated: 2, plaintext: 0, interpretationResults: 0 });

    expect(payloads(NEW_KEY)).toEqual(written);
    // The reason rotation is a remediation at all: the leaked key stops working.
    expect(() => payloads(OLD_KEY)).toThrow();
  });

  it('gives every row a fresh IV', () => {
    // Reusing an IV across two keys is safe; reusing one across two encryptions under the
    // same key is the one mistake GCM does not forgive. A fresh IV per row keeps this
    // function from being one edit away from that.
    insertOp(OLD_KEY, '{"field":"one"}');
    const before = (db.prepare('SELECT iv FROM ops').get() as unknown as { iv: Buffer }).iv.toString('base64');

    rotateEncryptionKey(db, OLD_KEY, NEW_KEY);

    const after = (db.prepare('SELECT iv FROM ops').get() as unknown as { iv: Buffer }).iv.toString('base64');
    expect(after).not.toBe(before);
  });

  it('is a no-op on an empty log', () => {
    expect(rotateEncryptionKey(db, OLD_KEY, NEW_KEY)).toEqual({ rotated: 0, plaintext: 0, interpretationResults: 0 });
  });

  it('leaves pre-encryption rows alone rather than failing on them', () => {
    // `iv` is nullable because at-rest encryption landed after the schema did. A null one
    // means plaintext, which has no key to rotate.
    const stamped = tick(clock, Date.now());
    clock = stamped.clock;
    db.prepare(
      'INSERT INTO ops (user_id, hlc, device_id, op_version, payload, received_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(userId, stamped.hlc, clock.nodeId, 1, Buffer.from('{}', 'utf8'), new Date().toISOString());
    insertOp(OLD_KEY, '{"field":"one"}');

    expect(rotateEncryptionKey(db, OLD_KEY, NEW_KEY)).toEqual({ rotated: 1, plaintext: 1, interpretationResults: 0 });
  });

  it('writes nothing at all when the current key is wrong', () => {
    const written = [insertOp(OLD_KEY, '{"field":"one"}'), insertOp(OLD_KEY, '{"field":"two"}')];
    const wrongKey = randomBytes(32);

    expect(() => rotateEncryptionKey(db, wrongKey, NEW_KEY)).toThrow(/does not decrypt under the current key/);

    // Still entirely readable under the key it was actually written with — a half-rotated
    // log would need trial decryption row by row to recover.
    expect(payloads(OLD_KEY)).toEqual(written);
  });

  it('does not bump the scheme version, which describes the format and not the key', () => {
    insertOp(OLD_KEY, '{"field":"one"}');
    rotateEncryptionKey(db, OLD_KEY, NEW_KEY);
    const row = db.prepare('SELECT key_version FROM ops').get() as unknown as { key_version: number };
    expect(row.key_version).toBe(CURRENT_KEY_VERSION);
  });
});

describe('rotateEncryptionKey and saved interpretation results (#1680)', () => {
  const SECTIONS = [{ heading: 'Overview', body: 'A restyled interpretation.' }];
  const save = (key: Buffer, description?: string): string =>
    saveInterpretationResult(
      db,
      {
        userId,
        mode: 'grounded',
        locale: 'en',
        sections: SECTIONS,
        ...(description === undefined ? {} : { description }),
      },
      key,
    );
  const rawResult = (id: string): unknown =>
    db
      .prepare('SELECT sections_json, iv, description_json, description_iv FROM interpretation_results WHERE id = ?')
      .get(id);

  it('re-encrypts every result, sections and label, so they read under the new key and not the old one', () => {
    insertOp(OLD_KEY, '{"field":"one"}');
    const labelled = save(OLD_KEY, 'Short and warm');
    const plain = save(OLD_KEY);

    expect(rotateEncryptionKey(db, OLD_KEY, NEW_KEY)).toEqual({ rotated: 1, plaintext: 0, interpretationResults: 2 });

    expect(getInterpretationResult(db, userId, labelled, NEW_KEY)?.sections).toEqual(SECTIONS);
    expect(getInterpretationResult(db, userId, plain, NEW_KEY)?.sections).toEqual(SECTIONS);
    const listed = listInterpretationResults(db, userId, { unlinked: true }, 'en', NEW_KEY);
    expect(listed.find((r) => r.id === labelled)?.description).toBe('Short and warm');
    expect(listed.find((r) => r.id === plain)?.description).toBeNull();
    expect(() => getInterpretationResult(db, userId, labelled, OLD_KEY)).toThrow();
    // The label moved too: under the old key it no longer reads.
    expect(
      listInterpretationResults(db, userId, { unlinked: true }, 'en', OLD_KEY).find((r) => r.id === labelled)
        ?.description,
    ).toBeNull();
  });

  it('gives each result a fresh IV for its sections and its label', () => {
    const id = save(OLD_KEY, 'Short and warm');
    const before = rawResult(id) as { iv: Uint8Array; description_iv: Uint8Array };
    rotateEncryptionKey(db, OLD_KEY, NEW_KEY);
    const after = rawResult(id) as { iv: Uint8Array; description_iv: Uint8Array };
    expect(Buffer.from(after.iv).equals(Buffer.from(before.iv))).toBe(false);
    expect(Buffer.from(after.description_iv).equals(Buffer.from(before.description_iv))).toBe(false);
    expect(Buffer.from(after.iv).equals(Buffer.from(after.description_iv))).toBe(false);
  });

  it('writes nothing at all when a result does not decrypt under the current key', () => {
    const op = insertOp(OLD_KEY, '{"field":"one"}');
    const good = save(OLD_KEY, 'Short and warm');
    const foreign = save(randomBytes(32));
    const goodBefore = rawResult(good);
    const foreignBefore = rawResult(foreign);

    expect(() => rotateEncryptionKey(db, OLD_KEY, NEW_KEY)).toThrow(
      new RegExp(`interpretation result ${foreign} does not decrypt under the current key`),
    );

    expect(payloads(OLD_KEY)).toEqual([op]);
    expect(rawResult(good)).toEqual(goodBefore);
    expect(rawResult(foreign)).toEqual(foreignBefore);
  });

  it('refuses to rotate when only a result label does not decrypt, so no label is lost silently', () => {
    const op = insertOp(OLD_KEY, '{"field":"one"}');
    const id = save(OLD_KEY);
    const stray = encryptPayload(Buffer.from('Written under another key', 'utf8'), randomBytes(32));
    db.prepare('UPDATE interpretation_results SET description_json = ?, description_iv = ? WHERE id = ?').run(
      stray.ciphertext,
      stray.iv,
      id,
    );
    const before = rawResult(id);

    let message = '';
    try {
      rotateEncryptionKey(db, OLD_KEY, NEW_KEY);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toMatch(/the label of interpretation result/);
    // The error names the row, never the label text.
    expect(message).not.toContain('Written under another key');
    expect(rawResult(id)).toEqual(before);
    expect(payloads(OLD_KEY)).toEqual([op]);
  });
});
