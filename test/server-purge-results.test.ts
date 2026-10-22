/**
 * Purging a person also erases that person's saved Tier 2 results (#768): `recordPurgeAndErase`
 * (`server/ops/purge.ts`) against an in-memory `openDatabase(':memory:')`, the same pattern as
 * `test/server-interpretation-results.test.ts`. The op-log half of a purge is covered through the
 * route in `test/server-ops.test.ts`; this file only checks the results cascade.
 */
import { describe, expect, it } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { openDatabase, type Database } from '../server/db.ts';
import { recordPurgeAndErase } from '../server/ops/purge.ts';
import { listInterpretationResults, saveInterpretationResult } from '../server/interpretation/results.ts';
import type { Tier2Section } from '../src/interpretation/tier2-contract.ts';

const SECTIONS: readonly Tier2Section[] = [{ heading: 'Overview', body: 'A restyled interpretation.' }];
const PERSON_A = 'p-aaaaaaaaaaaaaaaa';
const PERSON_B = 'p-bbbbbbbbbbbbbbbb';

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

function save(db: Database, userId: string, key: Buffer, personId?: string): string {
  return saveInterpretationResult(
    db,
    { userId, mode: 'grounded', locale: 'en', sections: SECTIONS, ...(personId === undefined ? {} : { personId }) },
    key,
  );
}

function ids(db: Database, userId: string, filter: { personId: string } | { unlinked: true }): string[] {
  return listInterpretationResults(db, userId, filter).map((result) => result.id);
}

describe('purging a person erases their saved results (#768)', () => {
  it('deletes person A’s results and leaves person B’s and the unlinked ones for the same user', () => {
    const db = openDatabase(':memory:');
    const key = randomBytes(32);
    const userId = makeUser(db, 'alice');
    save(db, userId, key, PERSON_A);
    save(db, userId, key, PERSON_A);
    const forB = save(db, userId, key, PERSON_B);
    const unlinked = save(db, userId, key);

    recordPurgeAndErase(db, userId, 'person', PERSON_A, new Date().toISOString(), 'marker-hlc', key);

    expect(ids(db, userId, { personId: PERSON_A })).toEqual([]);
    expect(ids(db, userId, { personId: PERSON_B })).toEqual([forB]);
    expect(ids(db, userId, { unlinked: true })).toEqual([unlinked]);
    db.close();
  });

  it('leaves another user’s results for the same person id in place', () => {
    const db = openDatabase(':memory:');
    const key = randomBytes(32);
    const alice = makeUser(db, 'alice');
    const bob = makeUser(db, 'bob');
    const bobs = save(db, bob, key, PERSON_A);

    recordPurgeAndErase(db, alice, 'person', PERSON_A, new Date().toISOString(), 'marker-hlc', key);

    expect(ids(db, bob, { personId: PERSON_A })).toEqual([bobs]);
    db.close();
  });

  it('does not touch results when the purged entity is not a person', () => {
    const db = openDatabase(':memory:');
    const key = randomBytes(32);
    const userId = makeUser(db, 'alice');
    const kept = save(db, userId, key, PERSON_A);

    recordPurgeAndErase(db, userId, 'chart', PERSON_A, new Date().toISOString(), 'marker-hlc', key);

    expect(ids(db, userId, { personId: PERSON_A })).toEqual([kept]);
    db.close();
  });
});
