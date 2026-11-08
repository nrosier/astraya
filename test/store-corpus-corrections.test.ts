/**
 * A reader's own interpretation corrections (#1338, slice 1): the entity id, the deterministic fold, the write guard
 * and validation, and the live store round trip over fake IndexedDB.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  CORRECTION_ENTITY,
  CorrectionRefusedError,
  assertCorrectionMutation,
  checkCorrectionText,
  correctionId,
  correctionReset,
  correctionWrite,
  parseCorrectionId,
} from '../src/store/corpus-corrections.js';
import { fold } from '../src/store/fold.js';
import { createClock } from '../src/store/hlc.js';
import { append, emptyLog, type Mutation } from '../src/store/oplog.js';
import type { OpRecord } from '../src/store/ops.js';
import { openStore, type Store } from '../src/store/store.js';

const T0 = 1_780_963_200_000;
const KEY = 'planet-in-sign:sun:0';
const TEXT_A = 'Your Sun in Aries reads, in my own words, as a steady and warm drive to begin things.';
const TEXT_B = 'Your Sun in Aries is, to my mind, a quiet courage that shows up when it is needed.';

/** Records written by one device, each stamped at a fixed millisecond so two devices can be interleaved. */
function writeAll(device: string, steps: readonly (readonly [Mutation, number])[]): OpRecord[] {
  let log = emptyLog(createClock(device));
  const out: OpRecord[] = [];
  for (const [mutation, at] of steps) {
    const appended = append(log, mutation, T0 + at);
    log = appended.log;
    out.push(appended.record);
  }
  return out;
}

describe('correction entity id', () => {
  it('joins locale and key with a delimiter no corpus key contains, and parses back', () => {
    const id = correctionId('nl', KEY);
    expect(id).toBe(`nl|${KEY}`);
    expect(parseCorrectionId(id)).toEqual({ locale: 'nl', key: KEY });
    expect(KEY.includes('|')).toBe(false);
  });

  it('refuses an id with an unknown locale, an empty key or a second delimiter', () => {
    expect(parseCorrectionId('xx|planet-in-sign:sun:0')).toBeUndefined();
    expect(parseCorrectionId('en|')).toBeUndefined();
    expect(parseCorrectionId('en|a|b')).toBeUndefined();
    expect(parseCorrectionId('nodelimiter')).toBeUndefined();
  });
});

describe('correction fold', () => {
  it('an edit shows the correction; a reset removes it; a later edit brings it back', () => {
    const id = correctionId('en', KEY);
    const writes = correctionWrite('en', KEY, TEXT_A, 'abc123');
    const edited = writeAll(
      'a1b2c3d4e5f60718',
      writes.map((mutation, index) => [mutation, index] as const),
    );
    expect(fold(edited).corrections.get(id)).toEqual({ locale: 'en', key: KEY, text: TEXT_A, baseHash: 'abc123' });

    const reset = writeAll('a1b2c3d4e5f60718', [
      ...writes.map((mutation, index) => [mutation, index] as const),
      [correctionReset('en', KEY), 10],
    ]);
    expect(fold(reset).corrections.size).toBe(0);

    const again = writeAll('a1b2c3d4e5f60718', [
      ...writes.map((mutation, index) => [mutation, index] as const),
      [correctionReset('en', KEY), 10],
      ...correctionWrite('en', KEY, TEXT_B, 'abc123').map((mutation, index) => [mutation, 20 + index] as const),
    ]);
    expect(fold(again).corrections.get(id)?.text).toBe(TEXT_B);
  });

  it('two devices converge to the same state whatever order the records arrive in', () => {
    const deviceA = writeAll(
      'a1b2c3d4e5f60718',
      correctionWrite('en', KEY, TEXT_A, 'aaa').map((mutation, index) => [mutation, index] as const),
    );
    const deviceB = writeAll('b1b2c3d4e5f60718', [
      ...correctionWrite('en', KEY, TEXT_B, 'bbb').map((mutation, index) => [mutation, 100 + index] as const),
      [correctionReset('en', KEY), 200],
    ]);
    const forward = fold([...deviceA, ...deviceB]);
    const backward = fold([...deviceB, ...deviceA].reverse());
    const interleaved = fold([deviceB[0], deviceA[0], deviceB[3], deviceA[1], deviceB[1], deviceA[2], deviceB[2]]);
    expect(JSON.stringify([...forward.corrections])).toBe(JSON.stringify([...backward.corrections]));
    expect(JSON.stringify([...forward.corrections])).toBe(JSON.stringify([...interleaved.corrections]));
    // B's reset is the newest write on the tombstone, so no correction is live.
    expect(forward.corrections.size).toBe(0);
  });

  it('a concurrent edit on another device keeps the newest text', () => {
    const deviceA = writeAll(
      'a1b2c3d4e5f60718',
      correctionWrite('en', KEY, TEXT_A, 'aaa').map((mutation, index) => [mutation, index] as const),
    );
    const deviceB = writeAll(
      'b1b2c3d4e5f60718',
      correctionWrite('en', KEY, TEXT_B, 'bbb').map((mutation, index) => [mutation, 100 + index] as const),
    );
    expect(fold([...deviceA, ...deviceB]).corrections.get(correctionId('en', KEY))?.text).toBe(TEXT_B);
    expect(fold([...deviceB, ...deviceA]).corrections.get(correctionId('en', KEY))?.text).toBe(TEXT_B);
  });

  it('keeps one correction per locale for the same key', () => {
    const records = writeAll('a1b2c3d4e5f60718', [
      ...correctionWrite('en', KEY, TEXT_A, 'aaa').map((mutation, index) => [mutation, index] as const),
      ...correctionWrite(
        'nl',
        KEY,
        'Jouw Zon in Ram is, in mijn eigen woorden, een warme en vaste drang om te beginnen.',
        'bbb',
      ).map((mutation, index) => [mutation, 10 + index] as const),
    ]);
    expect(fold(records).corrections.size).toBe(2);
  });

  it('stores only the locale, key, text and base hash', () => {
    const writes = correctionWrite('en', KEY, TEXT_A, 'abc123');
    expect(writes.every((mutation) => mutation.entity === CORRECTION_ENTITY)).toBe(true);
    expect(writes.map((mutation) => mutation.field).sort()).toEqual(['baseHash', 'deleted', 'text']);
    expect(JSON.stringify(writes)).not.toMatch(/person|birth|note|name/i);
  });
});

describe('correction validation', () => {
  it('refuses an empty text', () => {
    expect(checkCorrectionText('en', KEY, '')).toBe('empty');
    expect(checkCorrectionText('en', KEY, '   \n ')).toBe('empty');
  });

  it('refuses a text over the corpus length bound', () => {
    expect(checkCorrectionText('en', KEY, `Your Sun is the ${'x'.repeat(1700)}`)).toBe('too-long');
  });

  it('refuses a text under the corpus minimum', () => {
    expect(checkCorrectionText('en', KEY, 'Too short.')).toBe('too-short');
  });

  it('refuses HTML and links', () => {
    expect(checkCorrectionText('en', KEY, `${TEXT_A} <b>bold</b>`)).toBe('markup');
    expect(checkCorrectionText('en', KEY, `${TEXT_A} <script>alert(1)</script>`)).toBe('markup');
    expect(checkCorrectionText('en', KEY, `${TEXT_A} See https://example.com for more.`)).toBe('link');
    expect(checkCorrectionText('en', KEY, `${TEXT_A} See www.example.com for more.`)).toBe('link');
  });

  it('accepts a plain text of a fair length', () => {
    expect(checkCorrectionText('en', KEY, TEXT_A)).toBeUndefined();
  });

  it('builds no mutation for a refused text', () => {
    expect(() => correctionWrite('en', KEY, `${TEXT_A} <i>x</i>`, 'abc')).toThrow(CorrectionRefusedError);
  });

  it('the write guard refuses a purge marker, an unknown field, a bad key and a bad text', () => {
    const entityId = correctionId('en', KEY);
    const base = { entity: CORRECTION_ENTITY, entityId };
    expect(() => {
      assertCorrectionMutation({ ...base, field: 'purged', value: true });
    }).toThrow(CorrectionRefusedError);
    expect(() => {
      assertCorrectionMutation({ ...base, field: 'personId', value: 'p-aaaaaaaaaaaaaaaa' });
    }).toThrow(CorrectionRefusedError);
    expect(() => {
      assertCorrectionMutation({ ...base, entityId: 'en|nonsense:key', field: 'text', value: TEXT_A });
    }).toThrow(CorrectionRefusedError);
    expect(() => {
      assertCorrectionMutation({ ...base, field: 'text', value: 'x'.repeat(2000) });
    }).toThrow(CorrectionRefusedError);
    expect(() => {
      assertCorrectionMutation({ ...base, field: 'text', value: TEXT_A });
    }).not.toThrow();
    expect(() => {
      assertCorrectionMutation({ entity: 'pin', entityId: 'x', field: 'y', value: 1 });
    }).not.toThrow();
  });
});

describe('correction store round trip', () => {
  const open: Store[] = [];
  let counter = 0;
  afterEach(() => {
    for (const store of open.splice(0)) store.close();
  });

  async function fresh(name = `astraya-correction-test-${String((counter += 1))}`): Promise<Store> {
    let millis = T0;
    const store = await openStore({
      name,
      now: () => {
        millis += 1000;
        return millis;
      },
    });
    open.push(store);
    return store;
  }

  it('saves a correction, keeps it across a reopen, and resets it', async () => {
    const name = `astraya-correction-reopen-${String((counter += 1))}`;
    const first = await fresh(name);
    await first.mutate(correctionWrite('en', KEY, TEXT_A, 'abc123'));
    expect(first.state.corrections.get(correctionId('en', KEY))?.text).toBe(TEXT_A);
    first.close();
    open.pop();

    const second = await fresh(name);
    expect(second.state.corrections.get(correctionId('en', KEY))?.text).toBe(TEXT_A);
    await second.mutate([correctionReset('en', KEY)]);
    expect(second.state.corrections.size).toBe(0);
  });

  it('writes nothing for a refused text', async () => {
    const store = await fresh();
    await expect(
      store.mutate([
        { entity: CORRECTION_ENTITY, entityId: correctionId('en', KEY), field: 'text', value: `${TEXT_A} <b>x</b>` },
      ]),
    ).rejects.toBeInstanceOf(CorrectionRefusedError);
    expect(store.state.corrections.size).toBe(0);
    expect(store.outgoing(undefined)).toEqual([]);
  });

  it('refuses to seed an over-length or markup correction, and writes nothing', async () => {
    const store = await fresh();
    const entityId = correctionId('en', KEY);
    for (const value of ['x'.repeat(2000), `${TEXT_A} <b>x</b>`]) {
      await expect(store.seed([{ entity: CORRECTION_ENTITY, entityId, field: 'text', value }])).rejects.toBeInstanceOf(
        CorrectionRefusedError,
      );
    }
    expect(store.state.corrections.size).toBe(0);
    expect(store.outgoing(undefined)).toEqual([]);
  });

  it('refuses a purge of a correction', async () => {
    const store = await fresh();
    await expect(store.purge(CORRECTION_ENTITY, correctionId('en', KEY))).rejects.toBeInstanceOf(
      CorrectionRefusedError,
    );
  });

  it('exposes a correction to the sync push as an ordinary record', async () => {
    const store = await fresh();
    await store.mutate(correctionWrite('en', KEY, TEXT_A, 'abc123'));
    const outgoing = store.outgoing(undefined);
    expect(outgoing.length).toBe(3);
    expect(outgoing.every((record) => record.entity === CORRECTION_ENTITY)).toBe(true);
  });
});
