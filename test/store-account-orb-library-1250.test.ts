/**
 * The orb library as one register per profile (#1250, ADR 0004 section 11).
 *
 * Against real `openStore` stores that exchange their records, as two devices of one account do: concurrent additions
 * both survive, a profile id minted twice resolves per profile and never costs another profile, a value written by a
 * build before #1250 (the whole library in one register) is the base the per-profile registers layer on, and the fold
 * does not depend on arrival order.
 */
import { describe, expect, it } from 'vitest';
import type { OrbProfileRecord } from '../src/astrology/orb-library.js';
import {
  foldOrbLibrary,
  orbLibraryRegister,
  orbLibraryWrites,
  serializeAccountValue,
  serializeOrbProfile,
} from '../src/domain/account-preferences.js';
import {
  ACCOUNT_ENTITY,
  ACCOUNT_ENTITY_ID,
  foldAccount,
  isOrbProfileField,
  orbProfileField,
  orbProfileIdOf,
} from '../src/store/account.js';
import { applyRecords, EMPTY_REGISTERS, fold } from '../src/store/fold.js';
import { createClock } from '../src/store/hlc.js';
import { append, emptyLog, type Log, type Mutation } from '../src/store/oplog.js';
import type { OpRecord } from '../src/store/ops.js';
import { openStore } from '../src/store/store.js';

const A = 'a1b2c3d4e5f60718';
const B = 'b0000000000000ff';
const T0 = 1_780_963_200_000;

const profile = (id: string, name = id, revision = 1): OrbProfileRecord => ({
  id,
  name,
  revision,
  scalePercent: 0,
  aspectOrbs: {},
  bodyOrbs: {},
});

function pref(field: string, value: Mutation['value']): Mutation {
  return { entity: ACCOUNT_ENTITY, entityId: ACCOUNT_ENTITY_ID, field, value };
}

/** Write mutations as one device, one per millisecond. */
function write(nodeId: string, mutations: readonly Mutation[], from = T0): readonly OpRecord[] {
  let log: Log = emptyLog(createClock(nodeId));
  mutations.forEach((mutation, index) => {
    log = append(log, mutation, from + index).log;
  });
  return log.records;
}

function libraryOf(records: readonly OpRecord[]): readonly string[] {
  const folded = foldOrbLibrary(fold(records).account);
  if (folded.kind !== 'value') throw new Error(`library is ${folded.kind}`);
  return folded.library.profiles.map((entry) => `${entry.id}:${entry.name}:${String(entry.revision)}`);
}

const put = (entry: OrbProfileRecord): Mutation => pref(orbProfileField(entry.id), serializeOrbProfile(entry));

describe('the per-profile field names', () => {
  it('accepts only well-formed ids', () => {
    expect(orbProfileField('house-style')).toBe('orbProfile.house-style');
    expect(orbProfileIdOf('orbProfile.house-style')).toBe('house-style');
    expect(isOrbProfileField('orbProfile.')).toBe(false);
    expect(isOrbProfileField('orbProfile.a b')).toBe(false);
    expect(isOrbProfileField(`orbProfile.${'x'.repeat(65)}`)).toBe(false);
    expect(isOrbProfileField('orbLibrary')).toBe(false);
  });

  it('materialises the well-formed profile fields and keeps the others in the log only', () => {
    const records = write(A, [put(profile('p-1')), pref('orbProfile.bad id', 1), pref('orbProfile.', 1)]);
    expect(Object.keys(fold(records).account)).toEqual(['orbProfile.p-1']);
    const raw = applyRecords(EMPTY_REGISTERS, records).registers.account?.preferences ?? {};
    expect(Object.keys(raw).sort()).toEqual(['orbProfile.', 'orbProfile.bad id', 'orbProfile.p-1']);
  });
});

describe('concurrent edits (#1250 symptom A)', () => {
  it('keeps a profile added offline on each of two devices, in whatever order the records arrive', () => {
    const base = write(A, [put(profile('shared', 'Shared'))]);
    const onA = write(A, [put(profile('from-a', 'From A'))], T0 + 1_000);
    const onB = write(B, [put(profile('from-b', 'From B'))], T0 + 2_000);
    const forward = libraryOf([...base, ...onA, ...onB]);
    const backward = libraryOf([...onB, ...onA, ...base]);
    expect(forward).toEqual(backward);
    expect(forward).toEqual(['from-a:From A:1', 'from-b:From B:1', 'shared:Shared:1']);
  });

  it('merges through two real stores that exchange their records', async () => {
    const one = await openStore({ name: 'astraya-1250-one' });
    const two = await openStore({ name: 'astraya-1250-two' });
    try {
      await one.mutate([put(profile('from-one', 'From one'))]);
      await two.mutate([put(profile('from-two', 'From two'))]);
      await one.receive(two.outgoing());
      await two.receive(one.outgoing());
      for (const store of [one, two]) {
        const folded = foldOrbLibrary(store.state.account);
        expect(folded.kind === 'value' ? folded.library.profiles.map((entry) => entry.id) : []).toEqual([
          'from-one',
          'from-two',
        ]);
      }
    } finally {
      one.close();
      two.close();
    }
  });

  it('lets an edit of one profile and a removal of another both stand', () => {
    const base = write(A, [put(profile('keep', 'Keep')), put(profile('drop', 'Drop'))]);
    const edit = write(A, [put(profile('keep', 'Keep renamed', 2))], T0 + 1_000);
    const remove = write(B, [pref(orbProfileField('drop'), null)], T0 + 2_000);
    expect(libraryOf([...base, ...edit, ...remove])).toEqual(['keep:Keep renamed:2']);
  });

  it('resolves an edit and a removal of the same profile by timestamp, in both orders', () => {
    const base = write(A, [put(profile('same', 'Same'))]);
    // Removal newer than the edit: the profile stays gone.
    const edit = write(A, [put(profile('same', 'Edited', 2))], T0 + 1_000);
    const removeLater = write(B, [pref(orbProfileField('same'), null)], T0 + 2_000);
    expect(libraryOf([...base, ...edit, ...removeLater])).toEqual([]);
    expect(libraryOf([...removeLater, ...edit, ...base])).toEqual([]);
    // Edit newer than the removal: the profile comes back with the edit.
    const removeEarlier = write(B, [pref(orbProfileField('same'), null)], T0 + 1_000);
    const editLater = write(A, [put(profile('same', 'Edited', 2))], T0 + 2_000);
    expect(libraryOf([...base, ...removeEarlier, ...editLater])).toEqual(['same:Edited:2']);
    expect(libraryOf([...editLater, ...removeEarlier, ...base])).toEqual(['same:Edited:2']);
  });

  it('can exceed 50 profiles when two devices each add some, and stays readable', () => {
    const many = (prefix: string): readonly Mutation[] =>
      Array.from({ length: 30 }, (_, index) => put(profile(`${prefix}-${String(index)}`)));
    const records = [...write(A, many('a')), ...write(B, many('b'), T0 + 5_000)];
    expect(libraryOf(records)).toHaveLength(60);
    expect(orbLibraryRegister(fold(records).account)?.value).toMatchObject({ version: 1 });
  });
});

describe('profile id collisions (#1250 symptom B)', () => {
  it('resolves a repeated id per profile by timestamp and costs no other profile', () => {
    const records = [
      ...write(A, [put(profile('profile-3', 'Mine')), put(profile('other', 'Other'))]),
      ...write(B, [put(profile('profile-3', 'Yours'))], T0 + 3_000),
    ];
    // The later write wins that one profile; the other profile is untouched.
    expect(libraryOf(records)).toEqual(['other:Other:1', 'profile-3:Yours:1']);
    expect(libraryOf([...records].reverse())).toEqual(libraryOf(records));
  });

  it('refuses a profile whose id differs from its field', () => {
    const records = write(A, [pref(orbProfileField('one'), serializeOrbProfile(profile('two')))]);
    expect(foldOrbLibrary(fold(records).account)).toEqual({ kind: 'unreadable' });
  });
});

describe('values written before #1250 (legacy shape)', () => {
  const whole = (...profiles: OrbProfileRecord[]): Mutation =>
    pref('orbLibrary', serializeAccountValue('orbLibrary', { profiles }));

  it('reads a whole-library value as the base', () => {
    expect(libraryOf(write(A, [whole(profile('old-1'), profile('old-2'))]))).toEqual([
      'old-1:old-1:1',
      'old-2:old-2:1',
    ]);
  });

  it('layers a newer per-profile register on a whole-library base', () => {
    const old = write(A, [whole(profile('old'))]);
    const added = write(B, [put(profile('new', 'New'))], T0 + 1_000);
    const removed = write(B, [pref(orbProfileField('old'), null)], T0 + 2_000);
    expect(libraryOf([...old, ...added])).toEqual(['new:New:1', 'old:old:1']);
    expect(libraryOf([...removed, ...added, ...old])).toEqual(['new:New:1']);
  });

  it('lets a newer whole-library write replace the profiles older registers added', () => {
    const records = [
      ...write(A, [put(profile('stale', 'Stale'))]),
      ...write(B, [whole(profile('chosen', 'Chosen'))], T0 + 1_000),
    ];
    expect(libraryOf(records)).toEqual(['chosen:Chosen:1']);
  });

  it('reports an unreadable base or part as unreadable, never as an empty library', () => {
    const bad = write(A, [pref('orbLibrary', { version: 2, profiles: [] })]);
    expect(foldOrbLibrary(fold(bad).account)).toEqual({ kind: 'unreadable' });
    const badPart = write(A, [pref(orbProfileField('p'), { version: 2, id: 'p' })]);
    expect(foldOrbLibrary(fold(badPart).account)).toEqual({ kind: 'unreadable' });
    expect(foldOrbLibrary(foldAccount(undefined))).toEqual({ kind: 'unset' });
  });
});

describe('the writes a save produces', () => {
  it('writes only the changed, new and removed profiles', () => {
    const current = { profiles: [profile('a'), profile('b'), profile('c')] };
    const next = { profiles: [profile('a'), profile('b', 'Renamed', 2), profile('d')] };
    expect(orbLibraryWrites(next, current).map((m) => [m.field, m.value === null])).toEqual([
      ['orbProfile.b', false],
      ['orbProfile.d', false],
      ['orbProfile.c', true],
    ]);
    expect(orbLibraryWrites(current, current)).toEqual([]);
  });
});
