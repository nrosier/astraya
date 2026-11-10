// @vitest-environment jsdom
/**
 * Life events (#1399, slice S1): the atomic reader, the write guard, the order, the person register and its
 * unreadable flag, the purge, and the sync-size guard for the largest valid list (100 events). `jsdom` is only here
 * because the sync engine attaches an `online` listener; the size test drives the real engine with a stubbed `fetch`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LIFE_EVENT_CATEGORIES,
  LIFE_EVENT_LABEL_MAX_CHARACTERS,
  LIFE_EVENTS_MAX,
  lifeEventPickerOptions,
  lifeEventsMutation,
  readLifeEvents,
  sortLifeEvents,
  type LifeEvent,
} from '../src/domain/life-events.js';
import { buildPerson, PERSON_FIELDS, PERSON_TEXT_MAX_CHARACTERS } from '../src/domain/person.js';
import { createSyncEngine, PUSH_BATCH_MAX_BYTES } from '../src/sync/engine.js';
import { BODY_KEYS, OP_VERSION } from '../src/store/ops.js';
import { openStore } from '../src/store/store.js';
import { createClock } from '../src/store/hlc.js';
import { emptyLog, append, purgeEntity } from '../src/store/oplog.js';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

let dbCounter = 0;
function freshDbName(): string {
  dbCounter += 1;
  return `astraya-life-events-test-${String(dbCounter)}`;
}

function event(id: string, date = '2020-05-17', extra: Partial<LifeEvent> = {}): LifeEvent {
  return { id, date, label: `Event ${id}`, ...extra };
}

/** Labels that stress JSON escaping (quote, backslash, control characters) and 4-byte characters. */
function stressLabel(index: number): string {
  const unit = ['"', '\\', '\u0001', '\n', '\u{1F52E}', '\u{20000}'][index % 6] ?? '"';
  return unit.repeat(LIFE_EVENT_LABEL_MAX_CHARACTERS - 1) + 'x';
}

/**
 * The largest valid list: 100 events, 128-character ids, and 199 control characters plus one letter per label (the
 * label is trimmed, so it must not end in whitespace). A control character is the costliest unit: six bytes of JSON
 * (`\u0001`) per code point, against four for a four-byte character. With `mixed` the labels cycle through the other
 * stress units instead, which is smaller but covers escaping of quotes, backslashes, newlines and 4-byte characters.
 */
function largestList(mixed = false): LifeEvent[] {
  return Array.from({ length: LIFE_EVENTS_MAX }, (_, index) => ({
    id: `e${String(index).padStart(3, '0')}`.padEnd(128, 'i'),
    date: '1999-12-31',
    time: '23:59',
    label: mixed ? stressLabel(index) : '\u0001'.repeat(LIFE_EVENT_LABEL_MAX_CHARACTERS - 1) + 'x',
  }));
}

describe('constants', () => {
  it('keeps the cap at 100 and the label limit equal to the person text limit', () => {
    expect(LIFE_EVENTS_MAX).toBe(100);
    expect(LIFE_EVENT_LABEL_MAX_CHARACTERS).toBe(PERSON_TEXT_MAX_CHARACTERS);
  });
});

describe('readLifeEvents', () => {
  it('accepts a valid list, with and without a time, and trims the label', () => {
    expect(
      readLifeEvents([
        { id: 'a', date: '2020-02-29', time: '07:05', label: ' Moved abroad ' },
        { id: 'b', date: '1987-01-01', label: 'Graduated' },
      ]),
    ).toEqual([
      { id: 'a', date: '2020-02-29', time: '07:05', label: 'Moved abroad' },
      { id: 'b', date: '1987-01-01', label: 'Graduated' },
    ]);
  });

  it('accepts an empty list and exactly 100 events and a label of exactly 200 code points', () => {
    expect(readLifeEvents([])).toEqual([]);
    expect(readLifeEvents(Array.from({ length: 100 }, (_, i) => event(`e${String(i)}`)))).toHaveLength(100);
    expect(readLifeEvents([event('a', '2020-01-01', { label: '\u{1F52E}'.repeat(200) })])).toHaveLength(1);
  });

  it.each([
    ['not an array', { id: 'a' }],
    ['a string', 'x'],
    ['101 entries', Array.from({ length: 101 }, (_, i) => event(`e${String(i)}`))],
    ['a duplicate id', [event('a'), event('a', '2021-01-01')]],
    ['an empty id', [event('')]],
    ['a missing id', [{ date: '2020-01-01', label: 'x' }]],
    ['an empty label', [event('a', '2020-01-01', { label: '' })]],
    ['a blank label', [event('a', '2020-01-01', { label: '   ' })]],
    ['a label of 201 code points', [event('a', '2020-01-01', { label: 'x'.repeat(201) })]],
    ['a label of 201 four-byte characters', [event('a', '2020-01-01', { label: '\u{1F52E}'.repeat(201) })]],
    ['an impossible date 2023-02-30', [event('a', '2023-02-30')]],
    ['a non-leap 29 February', [event('a', '2023-02-29')]],
    ['month 13', [event('a', '2023-13-01')]],
    ['a date without zero padding', [event('a', '2023-2-3')]],
    ['year 0000', [event('a', '0000-01-01')]],
    ['a bad time 24:00', [event('a', '2020-01-01', { time: '24:00' })]],
    ['a bad time 12:60', [event('a', '2020-01-01', { time: '12:60' })]],
    ['a bad time 7:05', [event('a', '2020-01-01', { time: '7:05' })]],
    ['a time with seconds', [event('a', '2020-01-01', { time: '07:05:00' })]],
    ['a non-string time', [{ id: 'a', date: '2020-01-01', time: 705, label: 'x' }]],
    ['a non-object row', [event('a'), 'x']],
    ['a null row', [null]],
  ])('rejects the whole read for %s', (_name, value) => {
    expect(readLifeEvents(value)).toBeUndefined();
  });

  it('rejects the whole list when one row is bad among good rows', () => {
    expect(readLifeEvents([event('a'), event('b'), event('c', '2023-02-30'), event('d')])).toBeUndefined();
  });
});

describe('lifeEventsMutation', () => {
  it('writes the normalised list to the person register', () => {
    expect(lifeEventsMutation('p-1', [event('a', '2020-01-01', { label: ' x ', time: '01:02' })])).toEqual({
      entity: 'person',
      entityId: 'p-1',
      field: 'lifeEvents',
      value: [{ id: 'a', date: '2020-01-01', time: '01:02', label: 'x' }],
    });
  });

  it('writes an empty list (clearing the register)', () => {
    expect(lifeEventsMutation('p-1', []).value).toEqual([]);
  });

  it.each([
    ['101 events', Array.from({ length: 101 }, (_, i) => event(`e${String(i)}`))],
    ['a duplicate id', [event('a'), event('a')]],
    ['an empty id', [event('')]],
    ['an empty label', [event('a', '2020-01-01', { label: '' })]],
    ['a label of 201', [event('a', '2020-01-01', { label: 'x'.repeat(201) })]],
    ['2023-02-30', [event('a', '2023-02-30')]],
    ['a bad time', [event('a', '2020-01-01', { time: '25:00' })]],
  ])('throws for %s', (_name, events) => {
    expect(() => lifeEventsMutation('p-1', events)).toThrow(/Life events are not valid/);
  });
});

describe('categories (#1439)', () => {
  it('reads an event with a known category and one without (old stored events stay valid)', () => {
    const read = readLifeEvents([
      { id: 'a', date: '2020-01-01', label: 'Wed', category: 'marriage' },
      { id: 'b', date: '2020-01-02', label: 'Old' },
    ]);
    expect(read?.[0]?.category).toBe('marriage');
    expect(read?.[1]).toEqual({ id: 'b', date: '2020-01-02', label: 'Old' });
    expect(read?.[1] && 'category' in read[1]).toBe(false);
  });

  it('rejects the whole list for an unknown or non-string category', () => {
    expect(readLifeEvents([{ id: 'a', date: '2020-01-01', label: 'x', category: 'holiday' }])).toBeUndefined();
    expect(readLifeEvents([{ id: 'a', date: '2020-01-01', label: 'x', category: 3 }])).toBeUndefined();
  });

  it('writes the category and round-trips every category through the mutation', () => {
    const events = LIFE_EVENT_CATEGORIES.map((category, index) =>
      event(`c${String(index)}`, '2020-05-17', { category }),
    );
    const mutation = lifeEventsMutation('p1', [...events, event('none')]);
    const back = readLifeEvents(mutation.value);
    expect(back).toEqual([...events, event('none')]);
  });

  it('refuses to write an unknown category', () => {
    expect(() =>
      lifeEventsMutation('p1', [{ id: 'a', date: '2020-01-01', label: 'x', category: 'nope' as 'other' }]),
    ).toThrow();
  });

  it('carries the category onto picker options', () => {
    expect(lifeEventPickerOptions([event('a', '2020-01-01', { category: 'career' })])[0]?.category).toBe('career');
  });
});

describe('sortLifeEvents', () => {
  it('orders by date, then time, with untimed events after timed ones on the same day, then by id', () => {
    const sorted = sortLifeEvents([
      event('untimed-b', '2020-05-17'),
      event('late', '2020-05-17', { time: '18:00' }),
      event('later-day', '2020-05-18', { time: '00:01' }),
      event('untimed-a', '2020-05-17'),
      event('early', '2020-05-17', { time: '06:30' }),
      event('first', '1999-12-31'),
      event('tie-b', '2001-01-01', { time: '10:00' }),
      event('tie-a', '2001-01-01', { time: '10:00' }),
    ]);
    expect(sorted.map((e) => e.id)).toEqual([
      'first',
      'tie-a',
      'tie-b',
      'early',
      'late',
      'untimed-a',
      'untimed-b',
      'later-day',
    ]);
  });

  it('returns a new array and leaves the input alone', () => {
    const input = [event('b', '2021-01-01'), event('a', '2020-01-01')];
    const sorted = sortLifeEvents(input);
    expect(sorted).not.toBe(input);
    expect(input.map((e) => e.id)).toEqual(['b', 'a']);
  });
});

describe('the person register', () => {
  it('is one of the person fields and reads onto the person', () => {
    expect(PERSON_FIELDS).toContain('lifeEvents');
    const person = buildPerson('p', new Map([['lifeEvents', [event('a')]]]));
    expect(person.lifeEvents).toEqual([event('a')]);
    expect(person.lifeEventsUnreadable).toBeUndefined();
  });

  it('has neither events nor the flag when nothing was saved', () => {
    const person = buildPerson('p', new Map());
    expect('lifeEvents' in person).toBe(false);
    expect('lifeEventsUnreadable' in person).toBe(false);
  });

  it('keeps an empty saved list as an empty list, not as unreadable', () => {
    const person = buildPerson('p', new Map([['lifeEvents', []]]));
    expect(person.lifeEvents).toEqual([]);
    expect(person.lifeEventsUnreadable).toBeUndefined();
  });

  it.each([
    ['not an array', 'x'],
    ['null', null],
    ['one bad row', [event('a'), event('b', '2023-02-30')]],
    ['over the cap', Array.from({ length: 101 }, (_, i) => event(`e${String(i)}`))],
  ])('leaves lifeEvents absent and sets the flag for an unreadable register (%s)', (_name, value) => {
    const person = buildPerson('p', new Map([['lifeEvents', value]]));
    expect('lifeEvents' in person).toBe(false);
    expect(person.lifeEventsUnreadable).toBe(true);
    expect(person.calculationSettingsUnreadable).toBeUndefined();
  });
});

describe('purge', () => {
  it('removes the lifeEvents register records with the person, leaving other people alone', () => {
    let log = emptyLog(createClock('aaaaaaaaaaaaaaaa'));
    for (const mutation of [
      lifeEventsMutation('p-1', [event('a')]),
      lifeEventsMutation('p-1', [event('a'), event('b')]),
      lifeEventsMutation('p-2', [event('c')]),
    ]) {
      log = append(log, mutation, 1_700_000_000_000).log;
    }
    const { log: purged, removed } = purgeEntity(log, 'person', 'p-1');
    expect(removed).toHaveLength(2);
    expect(purged.records.map((record) => record.entityId)).toEqual(['p-2']);
  });

  it('leaves no register behind in a store: the purged person is gone from the state and the log', async () => {
    const store = await openStore({ name: freshDbName() });
    try {
      await store.mutate([
        { entity: 'person', entityId: 'p-1', field: 'displayName', value: 'Ada' },
        lifeEventsMutation('p-1', [event('a')]),
      ]);
      expect(store.state.people.get('p-1')?.lifeEvents).toEqual([event('a')]);
      await store.purge('person', 'p-1');
      expect(store.state.people.has('p-1')).toBe(false);
      const lifeRecords = store.outgoing().filter((record) => record.field === 'lifeEvents');
      expect(lifeRecords).toEqual([]);
    } finally {
      store.close();
    }
  });
});

/** The wire form of one record, as `toWire` in `src/sync/engine.ts` builds it (private there, so repeated here). */
function toWireForTest(record: Record<string, unknown>): {
  hlc: unknown;
  deviceId: unknown;
  opVersion: unknown;
  payload: string;
} {
  const { opVersion, hlc, deviceId, ...body } = record;
  const bytes = new TextEncoder().encode(JSON.stringify(body));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return { opVersion, hlc, deviceId, payload: btoa(binary) };
}

/** The wire size of the op the production mutation path writes for `events`, by the engine's own formula. */
async function wireBytesFor(events: readonly LifeEvent[]): Promise<number> {
  const store = await openStore({ name: freshDbName() });
  try {
    await store.mutate([lifeEventsMutation('p-1', events)]);
    const [record] = store.outgoing();
    if (record === undefined) throw new Error('expected one outgoing record');
    const op = toWireForTest(record);
    return new TextEncoder().encode(JSON.stringify(op)).byteLength;
  } finally {
    store.close();
  }
}

describe('sync size (largest valid list)', () => {
  it('both stress lists fit PUSH_BATCH_MAX_BYTES, the all-control-character list being the larger', async () => {
    const worst = await wireBytesFor(largestList());
    const mixed = await wireBytesFor(largestList(true));
    console.info(
      `largest life-event op: ${String(worst)} bytes (mixed stress ${String(mixed)}) of ${String(PUSH_BATCH_MAX_BYTES)}`,
    );
    expect(mixed).toBeLessThan(worst);
    expect(worst).toBeLessThanOrEqual(PUSH_BATCH_MAX_BYTES);
  });

  it('the largest list fits PUSH_BATCH_MAX_BYTES and goes out as one op in one batch', async () => {
    const events = largestList();
    expect(readLifeEvents(events)).toHaveLength(LIFE_EVENTS_MAX);

    const store = await openStore({ name: freshDbName() });
    const posts: { ops: { hlc: string }[] }[] = [];
    globalThis.fetch = (_input, init) => {
      if (init?.method === 'POST' && typeof init.body === 'string') {
        posts.push(JSON.parse(init.body) as { ops: { hlc: string }[] });
        return Promise.resolve(new Response(JSON.stringify({ seqs: [1], skipped: [] }), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ ops: [] }), { status: 200 }));
    };
    try {
      // The production mutation path: the write guard, then the store.
      await store.mutate([lifeEventsMutation('p-1', events)]);
      const [record, ...rest] = store.outgoing();
      expect(rest).toHaveLength(0);
      if (record === undefined) throw new Error('expected one outgoing record');

      // `encodedBytes` in src/sync/engine.ts is private, so its formula is repeated here: the UTF-8 length of the
      // JSON of the wire op ({ hlc, deviceId, opVersion, payload }), with the body base64-encoded in `payload`.
      const op = toWireForTest(record);
      const bytes = new TextEncoder().encode(JSON.stringify(op)).byteLength;
      expect(bytes).toBeLessThanOrEqual(PUSH_BATCH_MAX_BYTES);

      const engine = await createSyncEngine({ store, accountId: 'a-test' });
      try {
        await vi.waitFor(() => {
          expect(engine.status.kind).toBe('synced');
        });
        expect(engine.pending()).toBe(0);
        expect(posts).toHaveLength(1);
        expect(posts[0]?.ops).toHaveLength(1);
        expect(posts[0]?.ops[0]).toEqual(op);
      } finally {
        engine.close();
      }
    } finally {
      store.close();
    }
  });
});

describe('the op format is unchanged', () => {
  it('keeps OP_VERSION and BODY_KEYS as they were', () => {
    expect(OP_VERSION).toBe(1);
    expect(BODY_KEYS).toEqual(['entity', 'entityId', 'field', 'value']);
  });
});
