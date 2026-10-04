/**
 * `server/interpretation/results.ts` (#392): saved Tier 2 generations, encrypted at rest the
 * same way `ops.payload` is. Against an in-memory `openDatabase(':memory:')`, same pattern as
 * `test/server-interpretation-usage.test.ts` — no Fastify app needed since these are plain
 * functions over `Database`.
 */
import { describe, expect, it } from 'vitest';
import { randomUUID, randomBytes } from 'node:crypto';
import { openDatabase, type Database } from '../server/db.ts';
import {
  saveInterpretationResult,
  listInterpretationResults,
  getInterpretationResult,
} from '../server/interpretation/results.ts';
import type { Tier2Section } from '../server/interpretation/llm-client.ts';

function makeUser(db: Database, username: string): string {
  const id = randomUUID();
  db.prepare("INSERT INTO users (id, username, password_hash, role, created_at) VALUES (?, ?, ?, 'user', ?)").run(
    id,
    username,
    'irrelevant-hash',
    new Date().toISOString(),
  );
  return id;
}

const SECTIONS: readonly Tier2Section[] = [{ heading: 'Overview', body: 'A restyled interpretation.' }];

describe('saveInterpretationResult / getInterpretationResult (#392)', () => {
  it('round-trips the exact sections through encryption', () => {
    const db = openDatabase(':memory:');
    const key = randomBytes(32);
    const userId = makeUser(db, 'alice');

    const id = saveInterpretationResult(db, { userId, mode: 'grounded', locale: 'en', sections: SECTIONS }, key);
    const found = getInterpretationResult(db, userId, id, key);

    expect(found).toMatchObject({ id, mode: 'grounded', locale: 'en', sections: SECTIONS });
    expect(found?.createdAt).toBeTypeOf('string');
    db.close();
  });

  it('stores the ciphertext, not the plaintext, in the raw row', () => {
    const db = openDatabase(':memory:');
    const key = randomBytes(32);
    const userId = makeUser(db, 'alice');

    saveInterpretationResult(db, { userId, mode: 'grounded', locale: 'en', sections: SECTIONS }, key);

    const row = db.prepare('SELECT sections_json FROM interpretation_results').get() as { sections_json: Buffer };
    expect(row.sections_json.toString('utf8')).not.toContain('A restyled interpretation');
    db.close();
  });

  it('returns undefined for a result that belongs to a different user', () => {
    const db = openDatabase(':memory:');
    const key = randomBytes(32);
    const alice = makeUser(db, 'alice');
    const bob = makeUser(db, 'bob');

    const id = saveInterpretationResult(db, { userId: alice, mode: 'grounded', locale: 'en', sections: SECTIONS }, key);

    expect(getInterpretationResult(db, bob, id, key)).toBeUndefined();
    db.close();
  });

  it('returns undefined for an id that does not exist', () => {
    const db = openDatabase(':memory:');
    const key = randomBytes(32);
    const userId = makeUser(db, 'alice');

    expect(getInterpretationResult(db, userId, 'not-a-real-id', key)).toBeUndefined();
    db.close();
  });

  it('throws (fails closed) when decrypting with the wrong key, rather than returning garbage', () => {
    const db = openDatabase(':memory:');
    const userId = makeUser(db, 'alice');
    const id = saveInterpretationResult(
      db,
      { userId, mode: 'grounded', locale: 'en', sections: SECTIONS },
      randomBytes(32),
    );

    expect(() => getInterpretationResult(db, userId, id, randomBytes(32))).toThrow();
    db.close();
  });
});

describe('listInterpretationResults (#392)', () => {
  it('returns an empty array when the user has nothing saved', () => {
    const db = openDatabase(':memory:');
    const userId = makeUser(db, 'alice');
    expect(listInterpretationResults(db, userId)).toEqual([]);
    db.close();
  });

  it('lists only this user’s own results, metadata only (no sections)', () => {
    const db = openDatabase(':memory:');
    const key = randomBytes(32);
    const alice = makeUser(db, 'alice');
    const bob = makeUser(db, 'bob');

    const first = saveInterpretationResult(
      db,
      { userId: alice, mode: 'grounded', locale: 'en', sections: SECTIONS },
      key,
    );
    const second = saveInterpretationResult(
      db,
      { userId: alice, mode: 'synthesis', locale: 'nl', sections: SECTIONS },
      key,
    );
    saveInterpretationResult(db, { userId: bob, mode: 'grounded', locale: 'en', sections: SECTIONS }, key);

    const results = listInterpretationResults(db, alice);
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.id)).toEqual(expect.arrayContaining([first, second]));
    expect(results.every((r) => !('sections' in r))).toBe(true);
  });
});

describe('the short description of an interpretation (#423)', () => {
  const DESCRIPTION = 'Short and warm with focus on family';

  it('round-trips through the list and the detail with the right key', () => {
    const db = openDatabase(':memory:');
    const key = randomBytes(32);
    const userId = makeUser(db, 'alice');
    const id = saveInterpretationResult(
      db,
      { userId, mode: 'grounded', locale: 'en', sections: SECTIONS, description: DESCRIPTION },
      key,
    );
    expect(listInterpretationResults(db, userId, key)[0]).toMatchObject({ id, description: DESCRIPTION });
    expect(getInterpretationResult(db, userId, id, key)).toMatchObject({ id, description: DESCRIPTION });
    db.close();
  });

  it('is stored encrypted: neither the prose nor the label appears in any raw column', () => {
    const db = openDatabase(':memory:');
    const key = randomBytes(32);
    const userId = makeUser(db, 'alice');
    saveInterpretationResult(
      db,
      { userId, mode: 'grounded', locale: 'en', sections: SECTIONS, description: DESCRIPTION },
      key,
    );
    const row = db.prepare('SELECT * FROM interpretation_results').get() as Record<string, unknown>;
    expect(row.description_json).toBeInstanceOf(Uint8Array);
    expect(row.description_iv).toBeInstanceOf(Uint8Array);
    for (const value of Object.values(row)) {
      if (value instanceof Uint8Array) expect(Buffer.from(value).toString('utf8')).not.toContain('warm');
      else expect(String(value)).not.toContain('warm');
    }
    db.close();
  });

  it('is null when none was given, and the entry still opens (an entry from before descriptions)', () => {
    const db = openDatabase(':memory:');
    const key = randomBytes(32);
    const userId = makeUser(db, 'alice');
    const withNone = saveInterpretationResult(db, { userId, mode: 'grounded', locale: 'en', sections: SECTIONS }, key);
    const withNull = saveInterpretationResult(
      db,
      { userId, mode: 'grounded', locale: 'en', sections: SECTIONS, description: null },
      key,
    );
    const rows = db.prepare('SELECT description_json, description_iv FROM interpretation_results').all();
    expect(rows).toEqual([
      { description_json: null, description_iv: null },
      { description_json: null, description_iv: null },
    ]);
    expect(listInterpretationResults(db, userId, key).map((r) => r.description)).toEqual([null, null]);
    expect(getInterpretationResult(db, userId, withNone, key)?.description).toBeNull();
    expect(getInterpretationResult(db, userId, withNull, key)?.sections).toEqual(SECTIONS);
    db.close();
  });

  it('is null, not an error, when the list is read without the key or with a different one', () => {
    const db = openDatabase(':memory:');
    const key = randomBytes(32);
    const userId = makeUser(db, 'alice');
    saveInterpretationResult(
      db,
      { userId, mode: 'grounded', locale: 'en', sections: SECTIONS, description: DESCRIPTION },
      key,
    );
    expect(listInterpretationResults(db, userId)[0]?.description).toBeNull();
    expect(listInterpretationResults(db, userId, randomBytes(32))[0]?.description).toBeNull();
    // The entry itself is still listed, so it can be told apart by its time and kind.
    expect(listInterpretationResults(db, userId)).toHaveLength(1);
    db.close();
  });

  it('reads a row written before the columns existed, as null', () => {
    const db = openDatabase(':memory:');
    const key = randomBytes(32);
    const userId = makeUser(db, 'alice');
    // An old row: written the way migration 10 alone allowed, with no description columns set.
    db.prepare(
      'INSERT INTO interpretation_results (id, user_id, mode, locale, sections_json, key_version, iv, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run('old', userId, 'synthesis', 'en', Buffer.from('x'), 1, Buffer.from('y'), '2026-01-01T00:00:00.000Z');
    expect(listInterpretationResults(db, userId, key)).toEqual([
      {
        id: 'old',
        mode: 'synthesis',
        locale: 'en',
        createdAt: '2026-01-01T00:00:00.000Z',
        description: null,
        kind: 'whole-chart',
        basis: null,
      },
    ]);
    db.close();
  });
});

describe('what an interpretation was based on (#423)', () => {
  it('stores the kind and basis, and returns them in the list and when reopened', () => {
    const db = openDatabase(':memory:');
    const key = randomBytes(32);
    const userId = makeUser(db, 'alice');
    const basis = { kind: 'focus', body: 'mars', perspective: 'transit' } as const;
    const id = saveInterpretationResult(db, { userId, mode: 'focus', locale: 'en', sections: SECTIONS, basis }, key);
    expect(listInterpretationResults(db, userId, key)[0]).toMatchObject({ id, kind: 'focus', basis });
    expect(getInterpretationResult(db, userId, id, key)).toMatchObject({ kind: 'focus', basis });
    db.close();
  });

  it('keeps the basis readable without the encryption key: it is metadata, like the mode', () => {
    const db = openDatabase(':memory:');
    const userId = makeUser(db, 'alice');
    saveInterpretationResult(
      db,
      { userId, mode: 'freeform', locale: 'en', sections: SECTIONS, basis: { kind: 'whole-chart' } },
      randomBytes(32),
    );
    expect(listInterpretationResults(db, userId)[0]).toMatchObject({
      kind: 'whole-chart',
      basis: { kind: 'whole-chart' },
    });
    db.close();
  });

  it('derives the kind from the mode for a save with no basis, and reports no basis', () => {
    const db = openDatabase(':memory:');
    const userId = makeUser(db, 'alice');
    saveInterpretationResult(db, { userId, mode: 'grounded', locale: 'en', sections: SECTIONS }, randomBytes(32));
    expect(listInterpretationResults(db, userId)[0]).toMatchObject({ kind: 'placements', basis: null });
    db.close();
  });

  it('ignores a stored basis it does not understand rather than failing', () => {
    const db = openDatabase(':memory:');
    const userId = makeUser(db, 'alice');
    db.prepare(
      'INSERT INTO interpretation_results (id, user_id, mode, locale, sections_json, key_version, iv, created_at, kind, basis_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(
      'x',
      userId,
      'focus',
      'en',
      Buffer.from('x'),
      1,
      Buffer.from('y'),
      '2026-01-01T00:00:00.000Z',
      'focus',
      '{"kind":"from-the-future"}',
    );
    expect(listInterpretationResults(db, userId)[0]).toMatchObject({ kind: 'focus', basis: null });
    db.close();
  });
});
