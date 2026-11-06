/**
 * The account preferences entity in the op log (#1066, ADR 0004 section 6, tests 1 to 3).
 *
 * Fold: each allowlisted field folds by HLC in any arrival order, reapplying is idempotent, `deleted`/`purged` and any
 * other entity id are ignored, unknown fields stay in the log, an older build counts the records as unknown, and its
 * snapshot is rebuilt once. Store: `account` can never be removed, restored or purged; `mutate` and `seed` refuse a
 * reserved field or a wrong id for the whole batch; a peer's account purge marker erases nothing and appends nothing.
 */
import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_ENTITY,
  ACCOUNT_ENTITY_ID,
  ACCOUNT_FIELDS,
  AccountRefusedError,
  assertAccountMutation,
  foldAccount,
  newerHlc,
  readAccountReconcileState,
  withoutAccountRecords,
} from '../src/store/account.js';
import { applyRecords, EMPTY_REGISTERS, fold, materialise, resume, snapshotOf } from '../src/store/fold.js';
import { createClock } from '../src/store/hlc.js';
import { append, emptyLog, type Log, type Mutation } from '../src/store/oplog.js';
import { OP_VERSION, decode, type OpRecord } from '../src/store/ops.js';
import { openStore, type Store } from '../src/store/store.js';
import { allRecords, openDatabase } from '../src/store/db.js';

const A = 'a1b2c3d4e5f60718';
const B = 'b0000000000000ff';
const T0 = 1_780_963_200_000;

function pref(field: string, value: Mutation['value'], entityId = ACCOUNT_ENTITY_ID): Mutation {
  return { entity: ACCOUNT_ENTITY, entityId, field, value };
}

/** Write mutations as one device, one per millisecond. */
function write(nodeId: string, mutations: readonly Mutation[], from = T0): readonly OpRecord[] {
  let log: Log = emptyLog(createClock(nodeId));
  mutations.forEach((mutation, index) => {
    log = append(log, mutation, from + index).log;
  });
  return log.records;
}

describe('the account fold (#1066, test 1)', () => {
  it('folds each field by HLC, whatever the arrival order, and reapplying changes nothing', () => {
    const early = write(A, [pref('locale', 'en'), pref('defaultRulership', 'modern')]);
    const late = write(B, [pref('locale', 'nl')], T0 + 10_000);
    const forward = fold([...early, ...late]).account;
    const backward = fold([...late, ...early]).account;
    expect(forward).toEqual(backward);
    expect(forward.locale?.value).toBe('nl');
    expect(forward.defaultRulership?.value).toBe('modern');

    const once = applyRecords(EMPTY_REGISTERS, [...early, ...late]).registers;
    const twice = applyRecords(once, [...late, ...early]);
    expect(twice.registers).toEqual(once);
    expect(materialise(twice.registers).account).toEqual(forward);
  });

  it('ignores deleted, purged, unknown fields and any other entity id, but keeps them in the log', () => {
    const records = write(A, [
      pref('locale', 'nl'),
      pref('deleted', true),
      pref('purged', true),
      pref('futureField', 'x'),
      pref('locale', 'en', 'someone-else'),
    ]);
    const folded = fold(records);
    expect(folded.account).toEqual({ locale: { value: 'nl', hlc: records[0]?.hlc } });
    expect(folded.skips.unknownEntity).toBe(0);
    // The raw registers still hold every field; only the materialised view drops them.
    const registers = applyRecords(EMPTY_REGISTERS, records).registers;
    expect(Object.keys(registers.account?.preferences ?? {}).sort()).toEqual([
      'deleted',
      'futureField',
      'locale',
      'purged',
    ]);
  });

  it('is counted as an unknown entity by an older build, and its snapshot is rebuilt once on upgrade', () => {
    const OLD_KINDS = ['person', 'chart', 'birthNote', 'consultationNote', 'savedQuery'];
    const person = write(A, [{ entity: 'person', entityId: 'p-abcdefghijklmnop', field: 'displayName', value: 'Ada' }]);
    const prefs = write(B, [pref('locale', 'nl')], T0 + 5_000);
    const later = write(
      A,
      [{ entity: 'person', entityId: 'p-abcdefghijklmnop', field: 'placeLabel', value: 'X' }],
      T0 + 9_000,
    );
    const all = [...person, ...prefs, ...later];

    const old = applyRecords(EMPTY_REGISTERS, all, OLD_KINDS);
    expect(old.skips.unknownEntity).toBe(1);
    const oldSnapshot = snapshotOf(old.registers, all, OLD_KINDS);
    const resumed = resume(oldSnapshot, all);
    expect(resumed.rebuilt).toBe(true);
    expect(materialise(resumed.registers).account.locale?.value).toBe('nl');

    // Once rebuilt with this build's kinds, the next launch resumes without rebuilding.
    const fresh = snapshotOf(resumed.registers, all);
    expect(resume(fresh, all).rebuilt).toBe(false);
  });

  it('keeps only allowlisted fields', () => {
    const hlc = String(write(A, [pref('locale', 'nl')])[0]?.hlc);
    expect(foldAccount(undefined)).toEqual({});
    expect(
      foldAccount({ locale: { value: 'nl', hlc }, purged: { value: true, hlc }, other: { value: 1, hlc } }),
    ).toEqual({ locale: { value: 'nl', hlc } });
  });
});

describe('the account envelope (#1066, test 2)', () => {
  it('is an ordinary operation at OP_VERSION 1', () => {
    expect(OP_VERSION).toBe(1);
    const [record] = write(A, [pref('locale', 'nl')]);
    expect(record?.opVersion).toBe(1);
    expect(decode(record).kind).toBe('known');
  });
});

describe('the account write guard (#1066)', () => {
  it('refuses deleted, purged and a wrong entity id, and passes everything else', () => {
    expect(() => {
      assertAccountMutation(pref('deleted', true));
    }).toThrow(AccountRefusedError);
    expect(() => {
      assertAccountMutation(pref('purged', true));
    }).toThrow(AccountRefusedError);
    expect(() => {
      assertAccountMutation(pref('locale', 'nl', 'other'));
    }).toThrow(AccountRefusedError);
    expect(() => {
      assertAccountMutation(pref('locale', null));
    }).not.toThrow();
    expect(() => {
      assertAccountMutation({ entity: 'person', entityId: 'x', field: 'purged', value: true });
    }).not.toThrow();
  });

  it('separates account records out for adoption', () => {
    const records = [{ entity: 'person' }, { entity: ACCOUNT_ENTITY }, { entity: 'chart' }];
    expect(withoutAccountRecords(records)).toEqual([{ entity: 'person' }, { entity: 'chart' }]);
  });

  it('reads the reconcile state leniently and orders timestamps', () => {
    const [first, second] = write(A, [pref('locale', 'nl'), pref('locale', 'en')]).map((record) => String(record.hlc));
    expect(readAccountReconcileState(undefined)).toEqual({});
    expect(readAccountReconcileState({ marker: 'nope', pending: { locale: { value: 'nl' } } })).toEqual({});
    expect(
      readAccountReconcileState({ marker: first, pending: { locale: { value: 'nl', hlc: second }, junk: 1 } }),
    ).toEqual({ marker: first, pending: { locale: { value: 'nl', hlc: second } } });
    expect(newerHlc(first, second)).toBe(second);
    expect(newerHlc(undefined, first)).toBe(first);
  });
});

let counter = 0;
async function withStore(body: (store: Store, name: string) => Promise<void>): Promise<void> {
  counter += 1;
  const name = `astraya-account-test-${String(counter)}`;
  let millis = T0;
  const store = await openStore({
    name,
    now: () => {
      millis += 1000;
      return millis;
    },
  });
  try {
    await body(store, name);
  } finally {
    store.close();
  }
}

async function storedRecords(name: string): Promise<readonly OpRecord[]> {
  const db = await openDatabase(name);
  try {
    return await allRecords(db);
  } finally {
    db.close();
  }
}

describe('the store and the account entity (#1066, test 3)', () => {
  it('refuses remove, restore and purge for account', async () => {
    await withStore(async (store) => {
      await expect(store.remove(ACCOUNT_ENTITY, ACCOUNT_ENTITY_ID)).rejects.toThrow(AccountRefusedError);
      await expect(store.restore(ACCOUNT_ENTITY, ACCOUNT_ENTITY_ID)).rejects.toThrow(AccountRefusedError);
      await expect(store.purge(ACCOUNT_ENTITY, ACCOUNT_ENTITY_ID)).rejects.toThrow(AccountRefusedError);
      expect(store.outgoing()).toHaveLength(0);
    });
  });

  it('refuses a reserved field or wrong id in mutate and seed for the whole batch, leaving the log untouched', async () => {
    await withStore(async (store, name) => {
      const good = pref('locale', 'nl');
      for (const bad of [pref('purged', true), pref('deleted', true), pref('locale', 'nl', 'other')]) {
        await expect(store.mutate([good, bad])).rejects.toThrow(AccountRefusedError);
        await expect(store.seed([good, bad])).rejects.toThrow(AccountRefusedError);
      }
      expect(store.outgoing()).toHaveLength(0);
      expect(await storedRecords(name)).toHaveLength(0);
      await store.mutate([good]);
      expect(store.state.account.locale?.value).toBe('nl');
    });
  });

  it('ignores a peer’s account purge marker: nothing is erased and no marker of its own is appended', async () => {
    await withStore(async (store, name) => {
      await store.mutate([pref('locale', 'nl')]);
      const peer = write(B, [pref('purged', true)], T0 + 60_000);
      await store.receive(peer);
      expect(store.state.account.locale?.value).toBe('nl');
      const stored = await storedRecords(name);
      expect(stored).toHaveLength(2);
      // The only account purge record is the peer's; this device wrote none of its own.
      expect(stored.filter((record) => record.field === 'purged' && record.deviceId === store.deviceId)).toHaveLength(
        0,
      );
    });
  });

  it('is durable before listeners hear of it', async () => {
    await withStore(async (store, name) => {
      let seen = -1;
      store.subscribe(() => {
        void storedRecords(name).then((records) => {
          seen = records.length;
        });
      });
      await store.mutate([pref('defaultRulership', 'traditional')]);
      await expect.poll(() => seen).toBe(1);
    });
  });

  it('keeps the reconcile state in its own meta', async () => {
    await withStore(async (store) => {
      expect(await store.getAccountReconcile()).toEqual({});
      const hlc = String(write(A, [pref('locale', 'nl')])[0]?.hlc);
      await store.setAccountReconcile({ marker: hlc, pending: { locale: { value: 'nl', hlc } } });
      expect(await store.getAccountReconcile()).toEqual({ marker: hlc, pending: { locale: { value: 'nl', hlc } } });
    });
  });
});

describe('the allowlist grew by four fields (#1220)', () => {
  it('materialises the orb library, its source and the two saved transit filters, and still ignores any other field', () => {
    expect([...ACCOUNT_FIELDS]).toEqual([
      'locale',
      'defaultRulership',
      'defaultCalculationProfile',
      'orbLibrary',
      'orbContextSource',
      'transitFilterDaily',
      'transitFilterYearly',
    ]);
    const hlc = '0000000000001-0000-a1b2c3d4e5f60718';
    const register = { value: { preset: 'outer' }, hlc };
    const registers = {
      transitFilterDaily: register,
      orbLibrary: { value: { profiles: [] }, hlc },
      notAField: register,
    };
    const folded = foldAccount(registers);
    expect(Object.keys(folded).sort()).toEqual(['orbLibrary', 'transitFilterDaily']);
  });
});
