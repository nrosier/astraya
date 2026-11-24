/**
 * Saved horary judgments (#1960, record version 2): the pure fold and guard rules, the fold into the person-store
 * state, the older-build behaviour, and the live store round trip over fake IndexedDB (save, reopen, delete with
 * Undo, purge, determinism across merge order).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { HORARY_HOUSE_SYSTEMS } from '../src/domain/horary.js';
import {
  HORARY_PRACTITIONER_KEYS,
  HORARY_PRACTITIONER_REASONS,
  HORARY_PRACTITIONER_REASON_MAX_CHARACTERS,
} from '../src/domain/horary-judgment.js';
import { isId, newId } from '../src/domain/id.js';
import { MAX_CUSTOM_PROMPT_LENGTH } from '../src/interpretation/prompt-guardrail.js';
import { applyRecords, EMPTY_REGISTERS, fold, materialise, resume, snapshotOf } from '../src/store/fold.js';
import { createClock } from '../src/store/hlc.js';
import {
  HORARY_JUDGMENT_ENTITY,
  HORARY_QUESTION_MAX_CHARACTERS,
  HORARY_RECORD_VERSION,
  HoraryJudgmentRefusedError,
  assertHoraryJudgmentMutation,
  foldHoraryJudgment,
  horaryJudgmentCreate,
  horaryQuestionEdit,
  readHoraryJudgmentRecord,
  sortedHoraryJudgments,
  type HoraryJudgmentRecord,
} from '../src/store/horary-judgments.js';
import type { NoteFieldRegister } from '../src/store/notes.js';
import { append, emptyLog, type Mutation } from '../src/store/oplog.js';
import { allRecords, openDatabase } from '../src/store/db.js';
import { newRecord, type JsonValue } from '../src/store/ops.js';
import { openStore, type Store } from '../src/store/store.js';

const T0 = 1_780_963_200_000;
const JUDGMENT_ID = 'h-abcdefghijklmnop';
const OTHER_ID = 'h-bcdefghijklmnopq';
const CHART_SEARCH_ID = 's-abcdefghijklmnop';

const RECORD: HoraryJudgmentRecord = {
  version: 2,
  civil: { year: 2026, month: 11, day: 24, hour: 20, minute: 15, second: 0 },
  coordinates: { latitude: 52.3676, longitude: 4.9041 },
  witness: { offsetMinutes: 60, zone: 'Europe/Amsterdam', tzdbFingerprint: 'tzdb-2026a' },
  placeLabel: 'Amsterdam',
  houseSystem: 'R',
  rulershipScheme: 'traditional',
  summary: {
    querent: { house: 1, rulerKey: 'venus' },
    quesited: { house: 7, rulerKey: 'mars' },
    perfection: { kind: 'translation', thirdBodyKey: 'mercury', timeToPerfectDays: 12.5 },
    reception: { kind: 'oneWay', sameDignityType: false },
    receptionAidsPerfection: false,
    considerations: [
      { key: 'ascendant-too-early', applies: false, softened: false },
      { key: 'ascendant-too-late', applies: false, softened: false },
      { key: 'moon-void-of-course', applies: true, softened: true },
      { key: 'moon-via-combusta', applies: false, softened: false },
      { key: 'saturn-in-seventh', applies: false, softened: false },
    ],
    radical: true,
  },
  practitionerInput: [],
};

/** The same record as version 1 wrote it: no practitioner list at all. */
const { practitionerInput: _none, ...RECORD_V1_BODY } = RECORD;
const RECORD_V1: HoraryJudgmentRecord = { ...RECORD_V1_BODY, version: 1 };

/** A record as a plain JSON value, for the cases that need to break one field of it. */
function recordJson(): Record<string, JsonValue> {
  const mutation = horaryJudgmentCreate(JUDGMENT_ID, 'q', RECORD)[1];
  if (mutation === undefined || typeof mutation.value !== 'object' || Array.isArray(mutation.value)) {
    throw new Error('fixture');
  }
  return JSON.parse(JSON.stringify(mutation.value)) as Record<string, JsonValue>;
}

function withSummary(patch: (summary: Record<string, JsonValue>) => void): JsonValue {
  const value = recordJson();
  const summary = value.summary as Record<string, JsonValue>;
  patch(summary);
  return value;
}

function register(value: unknown, millis = T0): NoteFieldRegister {
  return { value, hlc: `${String(millis).padStart(18, '0')}-00000-a1b2c3d4e5f60718` };
}

function fieldsOf(question: unknown, record: unknown, deleted?: boolean): Record<string, NoteFieldRegister> {
  return {
    ...(question === undefined ? {} : { question: register(question) }),
    ...(record === undefined ? {} : { record: register(record) }),
    ...(deleted === undefined ? {} : { deleted: register(deleted) }),
  };
}

function recordsOf(mutations: readonly Mutation[], node = 'a1b2c3d4e5f60718', from = T0) {
  let log = emptyLog(createClock(node));
  mutations.forEach((mutation, index) => {
    log = append(log, mutation, from + index).log;
  });
  return log.records;
}

function refusal(mutation: Mutation): string | undefined {
  try {
    assertHoraryJudgmentMutation(mutation);
    return undefined;
  } catch (error) {
    if (error instanceof HoraryJudgmentRefusedError) return error.refusal;
    throw error;
  }
}

describe('the id prefix and the shared house-system list', () => {
  it('mints an h- id that the id pattern accepts, and keeps the other prefixes', () => {
    expect(isId(newId('h'))).toBe(true);
    expect(newId('h')).toMatch(/^h-[a-z2-7]{16}$/);
    expect(isId('s-abcdefghijklmnop')).toBe(true);
    expect(isId('x-abcdefghijklmnop')).toBe(false);
  });

  it('offers Regiomontanus first, from the domain module the store may import', () => {
    expect(HORARY_HOUSE_SYSTEMS).toEqual(['R', 'P', 'W']);
  });

  it('caps the question at the saved-query name cap, not the note cap', () => {
    expect(HORARY_QUESTION_MAX_CHARACTERS).toBe(MAX_CUSTOM_PROMPT_LENGTH);
    expect(HORARY_QUESTION_MAX_CHARACTERS).toBe(500);
    expect(HORARY_RECORD_VERSION).toBe(2);
  });
});

describe('round trip in the fold', () => {
  it('create, fold, ready with every field equal to the input', () => {
    const state = fold(recordsOf(horaryJudgmentCreate(JUDGMENT_ID, 'Will the ship return?', RECORD)));
    const judgment = state.horaryJudgments.get(JUDGMENT_ID);
    expect(judgment).toMatchObject({ status: 'ready', id: JUDGMENT_ID, question: 'Will the ship return?' });
    if (judgment?.status !== 'ready') throw new Error('expected ready');
    expect(judgment.record).toEqual(RECORD);
  });

  it('writes two field writes and no other body key, in one batch', () => {
    const writes = horaryJudgmentCreate(JUDGMENT_ID, 'q', RECORD);
    expect(writes.map((write) => write.field)).toEqual(['question', 'record']);
    for (const write of writes) {
      expect(Object.keys(write).sort()).toEqual(['entity', 'entityId', 'field', 'value']);
      expect(write.entity).toBe(HORARY_JUDGMENT_ENTITY);
    }
  });

  it('copies its input, so a later edit of the caller cannot change a queued write', () => {
    const summary = { ...RECORD.summary, considerations: [...RECORD.summary.considerations] };
    const writes = horaryJudgmentCreate(JUDGMENT_ID, 'q', { ...RECORD, summary });
    summary.considerations.length = 0;
    const value = writes[1]?.value as { summary: { considerations: unknown[] } };
    expect(value.summary.considerations).toHaveLength(5);
  });

  it('leaves optional keys out rather than writing undefined, so an absent place label stays absent', () => {
    const { placeLabel: _label, ...withoutLabel } = RECORD;
    const state = fold(recordsOf(horaryJudgmentCreate(JUDGMENT_ID, 'q', withoutLabel)));
    const judgment = state.horaryJudgments.get(JUDGMENT_ID);
    if (judgment?.status !== 'ready') throw new Error('expected ready');
    expect('placeLabel' in judgment.record).toBe(false);
    expect(judgment.record).toEqual(withoutLabel);
  });

  it('keeps an empty question, a Dutch question and a CJK question exactly', () => {
    for (const question of ['', 'Komt mijn broer terug uit Zürich?', '我的船会回来吗？']) {
      const state = fold(recordsOf(horaryJudgmentCreate(JUDGMENT_ID, question, RECORD)));
      expect(state.horaryJudgments.get(JUDGMENT_ID)).toMatchObject({ status: 'ready', question });
    }
  });

  it('reads a record back into only the keys this build knows', () => {
    const value = { ...recordJson(), future: 'x', civil: { ...RECORD.civil, extra: 1 } };
    const read = readHoraryJudgmentRecord(value);
    expect(read).toEqual(RECORD);
    expect(read !== undefined && 'future' in read).toBe(false);
  });
});

describe('foldHoraryJudgment', () => {
  it('is undefined for an entity with neither register', () => {
    expect(foldHoraryJudgment(JUDGMENT_ID, {})).toBeUndefined();
    expect(foldHoraryJudgment(JUDGMENT_ID, { deleted: register(true) })).toBeUndefined();
  });

  it('keeps an incomplete entity (question only, or record only), listed and not defaulted', () => {
    expect(foldHoraryJudgment(JUDGMENT_ID, fieldsOf('Only a question', undefined))).toMatchObject({
      status: 'unreadable',
      reason: 'incomplete',
      question: 'Only a question',
    });
    expect(foldHoraryJudgment(JUDGMENT_ID, fieldsOf(undefined, recordJson()))).toMatchObject({
      status: 'unreadable',
      reason: 'incomplete',
      question: '',
    });
  });

  it('folds a non-string question to the empty string', () => {
    expect(foldHoraryJudgment(JUDGMENT_ID, fieldsOf(42, recordJson()))).toMatchObject({
      status: 'ready',
      question: '',
    });
  });

  it('keeps a version above 2 as future-version, even when the rest is unreadable', () => {
    for (const version of [3, 99]) {
      expect(foldHoraryJudgment(JUDGMENT_ID, fieldsOf('q', { ...recordJson(), version }))).toMatchObject({
        status: 'unreadable',
        reason: 'future-version',
      });
    }
    expect(foldHoraryJudgment(JUDGMENT_ID, fieldsOf('q', { version: 3, anything: 'else' }))).toMatchObject({
      reason: 'future-version',
    });
  });

  it('keeps an unknown perfection kind, reception kind, consideration key and body as unknown-value', () => {
    const cases: readonly JsonValue[] = [
      withSummary((s) => (s.perfection = { kind: 'mutation-of-light' })),
      withSummary((s) => (s.reception = { kind: 'triple', sameDignityType: false })),
      withSummary((s) => (s.considerations = [{ key: 'moon-in-fall', applies: true, softened: false }] as JsonValue)),
      withSummary((s) => (s.querent = { house: 1, rulerKey: 'uranus' })),
      withSummary((s) => (s.perfection = { kind: 'translation', thirdBodyKey: 'chiron' })),
    ];
    for (const value of cases) {
      expect(foldHoraryJudgment(JUDGMENT_ID, fieldsOf('q', value))).toMatchObject({
        status: 'unreadable',
        reason: 'unknown-value',
      });
    }
  });

  it('marks wrong types, out-of-range and non-finite values invalid', () => {
    const cases: readonly unknown[] = [
      'not a record',
      null,
      [],
      { ...recordJson(), version: 0 },
      { ...recordJson(), version: 1.5 },
      { ...recordJson(), version: '1' },
      { ...recordJson(), civil: { ...RECORD.civil, month: 13 } },
      { ...recordJson(), civil: undefined },
      { ...recordJson(), coordinates: { latitude: 91, longitude: 0 } },
      { ...recordJson(), coordinates: { latitude: 'x', longitude: 0 } },
      { ...recordJson(), witness: { offsetMinutes: 60, zone: 'Europe/Amsterdam', tzdbFingerprint: '' } },
      { ...recordJson(), houseSystem: '' },
      { ...recordJson(), houseSystem: 7 },
      { ...recordJson(), placeLabel: 7 },
      withSummary((s) => (s.querent = { house: 0, rulerKey: 'venus' })),
      withSummary((s) => (s.quesited = { house: 13, rulerKey: 'mars' })),
      withSummary((s) => (s.quesited = { house: 7.5, rulerKey: 'mars' })),
      withSummary((s) => (s.perfection = { kind: 'translation', timeToPerfectDays: -1 })),
      withSummary((s) => (s.perfection = { kind: 'translation', timeToPerfectDays: 'soon' })),
      withSummary((s) => (s.radical = 'yes')),
      withSummary((s) => (s.receptionAidsPerfection = 1)),
      withSummary((s) => (s.considerations = 'none')),
      withSummary(
        (s) =>
          (s.considerations = [
            { key: 'moon-void-of-course', applies: true, softened: false },
            { key: 'moon-void-of-course', applies: false, softened: false },
          ]),
      ),
      withSummary((s) => (s.perfection = 'translation')),
    ];
    for (const value of cases) {
      expect(foldHoraryJudgment(JUDGMENT_ID, fieldsOf('q', value))).toMatchObject({
        status: 'unreadable',
        reason: 'invalid',
      });
    }
  });

  it('lets invalid outrank unknown, so a broken record is never mistaken for a newer build', () => {
    const value = withSummary((s) => {
      s.perfection = { kind: 'mutation-of-light' };
      s.radical = 'yes';
    });
    expect(foldHoraryJudgment(JUDGMENT_ID, fieldsOf('q', value))).toMatchObject({ reason: 'invalid' });
  });

  it('keeps a house-system code this build does not offer as unknown-value, never read with a default', () => {
    expect(foldHoraryJudgment(JUDGMENT_ID, fieldsOf('q', { ...recordJson(), houseSystem: 'K' }))).toMatchObject({
      status: 'unreadable',
      reason: 'unknown-value',
    });
  });

  it('still reads each house system this build offers as ready', () => {
    for (const code of HORARY_HOUSE_SYSTEMS) {
      const judgment = foldHoraryJudgment(JUDGMENT_ID, fieldsOf('q', { ...recordJson(), houseSystem: code }));
      expect(judgment).toMatchObject({ status: 'ready', record: { houseSystem: code } });
    }
  });

  it('lets invalid outrank an unknown house system', () => {
    const value = { ...(withSummary((s) => (s.radical = 'yes')) as Record<string, JsonValue>), houseSystem: 'K' };
    expect(foldHoraryJudgment(JUDGMENT_ID, fieldsOf('q', value))).toMatchObject({ reason: 'invalid' });
  });

  it('never throws, whatever the registers hold', () => {
    const odd: readonly unknown[] = [
      undefined,
      null,
      0,
      '',
      [],
      [[]],
      { version: {} },
      { version: 2, summary: [] },
      { version: 2, practitionerInput: [{}] },
    ];
    for (const value of odd) {
      expect(() => foldHoraryJudgment(JUDGMENT_ID, fieldsOf(value, value))).not.toThrow();
    }
  });

  it('stamps savedAt from the record register', () => {
    const fields = { question: register('q', T0 + 5), record: register(recordJson(), T0) };
    const judgment = foldHoraryJudgment(JUDGMENT_ID, fields);
    expect(judgment?.savedAt).toBe(fields.record.hlc);
  });
});

describe('the guard (assertHoraryJudgmentMutation)', () => {
  const [questionWrite, recordWrite] = horaryJudgmentCreate(JUDGMENT_ID, 'Will the ship return?', RECORD);
  if (questionWrite === undefined || recordWrite === undefined) throw new Error('fixture');
  const write = (field: string, value: JsonValue, entityId = JUDGMENT_ID): Mutation => ({
    entity: HORARY_JUDGMENT_ENTITY,
    entityId,
    field,
    value,
  });

  it('passes the writes a save, an edit, a delete and a restore make', () => {
    expect(() => {
      assertHoraryJudgmentMutation(questionWrite);
      assertHoraryJudgmentMutation(recordWrite);
      assertHoraryJudgmentMutation(horaryQuestionEdit(JUDGMENT_ID, 'Edited'));
      assertHoraryJudgmentMutation(write('deleted', true));
      assertHoraryJudgmentMutation(write('deleted', false));
    }).not.toThrow();
  });

  it('refuses a wrong id prefix and a malformed id', () => {
    expect(refusal(write('question', 'q', CHART_SEARCH_ID))).toBe('invalid');
    expect(refusal(write('question', 'q', 'p-abcdefghijklmnop'))).toBe('invalid');
    expect(refusal(write('question', 'q', 'h-short'))).toBe('invalid');
    expect(refusal(write('question', 'q', ''))).toBe('invalid');
  });

  it('refuses a question over 500 code points and accepts exactly 500', () => {
    expect(refusal(write('question', 'a'.repeat(500)))).toBeUndefined();
    expect(refusal(write('question', 'a'.repeat(501)))).toBe('question-too-long');
    // 500 astral code points are 1000 UTF-16 units: the cap counts code points, like the saved-query name.
    expect(refusal(write('question', '\u{1F52D}'.repeat(500)))).toBeUndefined();
    expect(refusal(write('question', '\u{1F52D}'.repeat(501)))).toBe('question-too-long');
    // A note-sized question is far over the cap: the 50,000-character note limit does not apply.
    expect(refusal(write('question', 'a'.repeat(50_000)))).toBe('question-too-long');
  });

  it('refuses a non-string question', () => {
    expect(refusal(write('question', 42))).toBe('invalid');
    expect(refusal(write('question', null))).toBe('invalid');
  });

  it('refuses a purged field, an unknown field and a non-boolean deleted', () => {
    expect(refusal(write('purged', true))).toBe('invalid');
    expect(refusal(write('summary', 'x'))).toBe('invalid');
    expect(refusal(write('practitionerInput', true))).toBe('invalid');
    expect(refusal(write('deleted', 'yes'))).toBe('invalid');
    expect(refusal(write('deleted', 1))).toBe('invalid');
  });

  it('refuses a record at a version other than 2, including version 1 and a future one', () => {
    for (const version of [0, 1, 3]) {
      expect(refusal(write('record', { ...recordJson(), version }))).toBe('invalid');
    }
    expect(refusal(write('record', { ...recordJson(), version: '2' }))).toBe('invalid');
  });

  it('refuses an unreadable record: unknown perfection kind, bad coordinates, not a record', () => {
    expect(
      refusal(
        write(
          'record',
          withSummary((s) => (s.perfection = { kind: 'mutation-of-light' })),
        ),
      ),
    ).toBe('invalid');
    expect(refusal(write('record', { ...recordJson(), coordinates: { latitude: 99, longitude: 0 } }))).toBe('invalid');
    expect(refusal(write('record', 'text'))).toBe('invalid');
    expect(refusal(write('record', null))).toBe('invalid');
  });

  it('refuses an unknown house system and accepts each one the screen offers', () => {
    expect(refusal(write('record', { ...recordJson(), houseSystem: 'K' }))).toBe('invalid');
    expect(refusal(write('record', { ...recordJson(), houseSystem: '' }))).toBe('invalid');
    for (const code of HORARY_HOUSE_SYSTEMS) {
      expect(refusal(write('record', { ...recordJson(), houseSystem: code }))).toBeUndefined();
    }
  });

  it('refuses an over-long place label, keeping the record under the relay op size', () => {
    expect(refusal(write('record', { ...recordJson(), placeLabel: 'a'.repeat(200) }))).toBeUndefined();
    expect(refusal(write('record', { ...recordJson(), placeLabel: 'a'.repeat(201) }))).toBe('invalid');
  });

  it('ignores other entity kinds, chart searches included', () => {
    expect(() => {
      assertHoraryJudgmentMutation({ entity: 'chartSearch', entityId: CHART_SEARCH_ID, field: 'name', value: 'x' });
      assertHoraryJudgmentMutation({ entity: 'person', entityId: 'p-abcdefghijklmnop', field: 'purged', value: true });
    }).not.toThrow();
  });

  it('refuses NaN and Infinity at the log, so a non-finite day count cannot be written', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
      const value = withSummary((s) => (s.perfection = { kind: 'translation', timeToPerfectDays: bad }));
      expect(refusal(write('record', value))).toBe('invalid');
      const fields = {
        ...write('record', value),
        hlc: `${String(T0).padStart(18, '0')}-00000-a1b2c3d4e5f60718`,
        deviceId: 'a1b2c3d4e5f60718',
      };
      expect(() => newRecord(fields)).toThrow();
    }
  });
});

describe('materialise', () => {
  const create = horaryJudgmentCreate(JUDGMENT_ID, 'Live', RECORD);

  it('lists a live judgment and keeps a tombstoned one in deleted.horaryJudgments', () => {
    const live = fold(recordsOf(create));
    expect(live.horaryJudgments.get(JUDGMENT_ID)).toMatchObject({ status: 'ready' });
    const gone = fold(
      recordsOf([...create, { entity: HORARY_JUDGMENT_ENTITY, entityId: JUDGMENT_ID, field: 'deleted', value: true }]),
    );
    expect(gone.horaryJudgments.has(JUDGMENT_ID)).toBe(false);
    expect(gone.deleted.horaryJudgments.get(JUDGMENT_ID)).toMatchObject({ status: 'ready', question: 'Live' });
  });

  it('keeps a judgment deleted when its question is edited afterwards, and restores it by writing deleted false', () => {
    const deleted: Mutation = { entity: HORARY_JUDGMENT_ENTITY, entityId: JUDGMENT_ID, field: 'deleted', value: true };
    const edited = fold(recordsOf([...create, deleted, horaryQuestionEdit(JUDGMENT_ID, 'Edited after delete')]));
    expect(edited.horaryJudgments.has(JUDGMENT_ID)).toBe(false);
    expect(edited.deleted.horaryJudgments.get(JUDGMENT_ID)).toMatchObject({ question: 'Edited after delete' });
    const restored = fold(recordsOf([...create, deleted, { ...deleted, value: false }]));
    expect(restored.horaryJudgments.get(JUDGMENT_ID)).toMatchObject({ status: 'ready', question: 'Live' });
    expect(restored.deleted.horaryJudgments.has(JUDGMENT_ID)).toBe(false);
  });

  const put = (entityId: string, field: string, value: JsonValue): Mutation => ({
    entity: HORARY_JUDGMENT_ENTITY,
    entityId,
    field,
    value,
  });

  it('skips a purged entity, checked before incomplete, and records it as erased', () => {
    // What a purge leaves behind: the marker alone, which on its own would fold as an incomplete judgment.
    const state = fold(recordsOf([put(JUDGMENT_ID, 'purged', true)]));
    expect(state.horaryJudgments.size).toBe(0);
    expect(state.deleted.horaryJudgments.size).toBe(0);
    expect(state.erased.horaryJudgments.has(JUDGMENT_ID)).toBe(true);
  });

  it('skips a purged entity that is also tombstoned and complete', () => {
    const state = fold(recordsOf([...create, put(JUDGMENT_ID, 'deleted', true), put(JUDGMENT_ID, 'purged', true)]));
    expect(state.horaryJudgments.size + state.deleted.horaryJudgments.size).toBe(0);
    expect(state.erased.horaryJudgments.has(JUDGMENT_ID)).toBe(true);
  });

  it('lists unreadable and incomplete judgments rather than hiding them', () => {
    const state = fold(
      recordsOf([
        put(JUDGMENT_ID, 'question', 'Newer'),
        put(JUDGMENT_ID, 'record', { ...recordJson(), version: 3 }),
        put(OTHER_ID, 'question', 'Half'),
      ]),
    );
    expect(state.horaryJudgments.get(JUDGMENT_ID)).toMatchObject({ status: 'unreadable', reason: 'future-version' });
    expect(state.horaryJudgments.get(OTHER_ID)).toMatchObject({ status: 'unreadable', reason: 'incomplete' });
  });

  it('leaves a chart search with the same entity-shaped fields unaffected', () => {
    const state = fold(
      recordsOf([...create, { entity: 'chartSearch', entityId: CHART_SEARCH_ID, field: 'name', value: 'A search' }]),
    );
    expect(state.horaryJudgments.size).toBe(1);
    expect(state.chartSearches.size).toBe(1);
  });

  it('sorts newest save first, then by id by code unit', () => {
    const a = recordsOf(horaryJudgmentCreate(JUDGMENT_ID, 'First', RECORD), 'a1b2c3d4e5f60718', T0);
    const b = recordsOf(horaryJudgmentCreate(OTHER_ID, 'Second', RECORD), 'a1b2c3d4e5f60718', T0 + 10_000);
    const state = fold([...a, ...b]);
    expect(sortedHoraryJudgments(state.horaryJudgments).map((j) => j.id)).toEqual([OTHER_ID, JUDGMENT_ID]);
  });
});

describe('determinism', () => {
  it('two logs merged in either order give the same state and the same sorted list', () => {
    const one = recordsOf(horaryJudgmentCreate(JUDGMENT_ID, 'From one', RECORD), 'a1b2c3d4e5f60718', T0);
    const two = recordsOf(
      [
        ...horaryJudgmentCreate(OTHER_ID, 'From two', { ...RECORD, houseSystem: 'P' }),
        horaryQuestionEdit(JUDGMENT_ID, 'Edited on two'),
      ],
      'b0000000000000ff',
      T0 + 5_000,
    );
    const forward = fold([...one, ...two]);
    const backward = fold([...two, ...one]);
    expect(backward.horaryJudgments).toEqual(forward.horaryJudgments);
    expect(sortedHoraryJudgments(backward.horaryJudgments)).toEqual(sortedHoraryJudgments(forward.horaryJudgments));
    expect(forward.horaryJudgments.get(JUDGMENT_ID)).toMatchObject({ question: 'Edited on two' });
  });

  it('applying the same batch twice changes nothing', () => {
    const records = recordsOf(horaryJudgmentCreate(JUDGMENT_ID, 'Twice', RECORD));
    const once = applyRecords(EMPTY_REGISTERS, records);
    const twice = applyRecords(once.registers, records);
    expect(twice.registers).toEqual(once.registers);
  });

  it('a snapshot resume and a full rebuild give identical registers', () => {
    const all = recordsOf(horaryJudgmentCreate(JUDGMENT_ID, 'Resumed', RECORD));
    const registers = applyRecords(EMPTY_REGISTERS, all).registers;
    const resumed = resume(snapshotOf(registers, all), all);
    expect(resumed.rebuilt).toBe(false);
    expect(JSON.stringify(resumed.registers)).toBe(JSON.stringify(applyRecords(EMPTY_REGISTERS, all).registers));
  });

  it('a record round-trips through JSON byte for byte, as the wire carries it', () => {
    const [, recordWrite] = horaryJudgmentCreate(JUDGMENT_ID, 'q', RECORD);
    const once = JSON.stringify(recordWrite?.value);
    expect(JSON.stringify(JSON.parse(once))).toBe(once);
  });
});

describe('an older build', () => {
  const OLD_KINDS: readonly string[] = [
    'person',
    'chart',
    'birthNote',
    'consultationNote',
    'savedQuery',
    'chartSearch',
  ];
  const all = recordsOf(horaryJudgmentCreate(JUDGMENT_ID, 'Seen by newer', RECORD));

  it('counts the horaryJudgment records as unknownEntity and folds none of them', () => {
    const applied = applyRecords(EMPTY_REGISTERS, all, OLD_KINDS);
    expect(applied.skips.unknownEntity).toBe(2);
    expect(applied.skips.corrupt).toBe(0);
    expect(applied.registers[HORARY_JUDGMENT_ENTITY]).toBeUndefined();
  });

  it('a snapshot from the older build is rebuilt once, so the judgment appears after the upgrade', () => {
    const oldSnapshot = snapshotOf(applyRecords(EMPTY_REGISTERS, all, OLD_KINDS).registers, all, OLD_KINDS);
    const resumed = resume(oldSnapshot, all);
    expect(resumed.rebuilt).toBe(true);
    expect(materialise(resumed.registers).horaryJudgments.get(JUDGMENT_ID)).toMatchObject({ status: 'ready' });
  });

  it('a snapshot written by this build is resumed, not rebuilt', () => {
    const registers = applyRecords(EMPTY_REGISTERS, all).registers;
    expect(resume(snapshotOf(registers, all), all).rebuilt).toBe(false);
  });

  it('this build keeps a version-3 record from a newer one, listed and unread', () => {
    const newer = recordsOf([
      { entity: HORARY_JUDGMENT_ENTITY, entityId: JUDGMENT_ID, field: 'question', value: 'Newer' },
      {
        entity: HORARY_JUDGMENT_ENTITY,
        entityId: JUDGMENT_ID,
        field: 'record',
        value: { ...recordJson(), version: 3, practitionerInput: true },
      },
    ]);
    const applied = applyRecords(EMPTY_REGISTERS, newer);
    expect(applied.skips.future).toBe(0);
    expect(materialise(applied.registers).horaryJudgments.get(JUDGMENT_ID)).toMatchObject({
      status: 'unreadable',
      reason: 'future-version',
      question: 'Newer',
    });
  });
});

describe('the horary-judgment store round trip', () => {
  let open: Store[] = [];
  let counter = 0;

  afterEach(() => {
    for (const store of open) store.close();
    open = [];
  });

  function ticking(): () => number {
    let millis = T0;
    return () => {
      millis += 1000;
      return millis;
    };
  }

  async function openFresh(name: string): Promise<Store> {
    const store = await openStore({ name, now: ticking() });
    open.push(store);
    return store;
  }

  function freshName(): string {
    counter += 1;
    return `astraya-horary-judgment-test-${String(counter)}`;
  }

  it('saves a judgment and shows the same stored summary after a reopen', async () => {
    const name = freshName();
    const id = newId('h');
    const store = await openFresh(name);
    await store.mutate(horaryJudgmentCreate(id, 'Will the ship return?', RECORD));
    const saved = store.state.horaryJudgments.get(id);
    expect(saved).toMatchObject({ status: 'ready', id, question: 'Will the ship return?' });
    if (saved?.status !== 'ready') throw new Error('expected ready');
    expect(saved.record).toEqual(RECORD);
    store.close();
    open = [];

    const reopened = await openFresh(name);
    const again = reopened.state.horaryJudgments.get(id);
    expect(again).toEqual(saved);
  });

  it('edits the question without touching the record, and keeps both across a reopen', async () => {
    const name = freshName();
    const id = newId('h');
    const store = await openFresh(name);
    await store.mutate(horaryJudgmentCreate(id, 'First', RECORD));
    const before = store.state.horaryJudgments.get(id);
    await store.mutate([horaryQuestionEdit(id, 'Second')]);
    store.close();
    open = [];
    const reopened = await openFresh(name);
    const after = reopened.state.horaryJudgments.get(id);
    expect(after).toMatchObject({ status: 'ready', question: 'Second' });
    expect(after?.status === 'ready' && before?.status === 'ready' ? after.record : undefined).toEqual(RECORD);
    expect(after?.savedAt).toBe(before?.savedAt);
  });

  it('deletes with a tombstone, and Undo brings it back exactly', async () => {
    const id = newId('h');
    const store = await openFresh(freshName());
    await store.mutate(horaryJudgmentCreate(id, 'Undoable', RECORD));
    const before = store.state.horaryJudgments.get(id);
    await store.remove(HORARY_JUDGMENT_ENTITY, id);
    expect(store.state.horaryJudgments.has(id)).toBe(false);
    expect(store.state.deleted.horaryJudgments.get(id)).toMatchObject({ status: 'ready', question: 'Undoable' });
    await store.restore(HORARY_JUDGMENT_ENTITY, id);
    expect(store.state.horaryJudgments.get(id)).toEqual(before);
    expect(store.state.deleted.horaryJudgments.has(id)).toBe(false);
  });

  it('a delete survives a reopen, and an edit after it does not undelete', async () => {
    const name = freshName();
    const id = newId('h');
    const store = await openFresh(name);
    await store.mutate(horaryJudgmentCreate(id, 'Deleted', RECORD));
    await store.remove(HORARY_JUDGMENT_ENTITY, id);
    await store.mutate([horaryQuestionEdit(id, 'Still deleted')]);
    store.close();
    open = [];
    const reopened = await openFresh(name);
    expect(reopened.state.horaryJudgments.has(id)).toBe(false);
    expect(reopened.state.deleted.horaryJudgments.get(id)).toMatchObject({ question: 'Still deleted' });
  });

  it('refuses Store.purge of a judgment, which is only ever deleted, and keeps it', async () => {
    const id = newId('h');
    const store = await openFresh(freshName());
    await store.mutate(horaryJudgmentCreate(id, 'Kept', RECORD));
    await store.remove(HORARY_JUDGMENT_ENTITY, id);
    await expect(store.purge(HORARY_JUDGMENT_ENTITY, id)).rejects.toBeInstanceOf(HoraryJudgmentRefusedError);
    expect(store.state.deleted.horaryJudgments.get(id)).toMatchObject({ status: 'ready', question: 'Kept' });
    expect(store.state.erased.horaryJudgments.has(id)).toBe(false);
    expect(store.outgoing().some((record) => JSON.stringify(record).includes('"purged"'))).toBe(false);
  });

  it('purges: the id is erased, in neither list, the marker is kept and the other records are stripped', async () => {
    const name = freshName();
    const id = newId('h');
    const keep = newId('h');
    const store = await openFresh(name);
    await store.mutate(horaryJudgmentCreate(id, 'Gone', RECORD));
    await store.mutate(horaryJudgmentCreate(keep, 'Kept', RECORD));
    await store.remove(HORARY_JUDGMENT_ENTITY, id);
    // Store.purge refuses a judgment, so the marker arrives the way a developer erase reaches a device: from a peer.
    const marker: Mutation = { entity: HORARY_JUDGMENT_ENTITY, entityId: id, field: 'purged', value: true };
    await store.receive(recordsOf([marker], 'b1b2c3d4e5f60718', T0 + 60_000));
    expect(store.state.erased.horaryJudgments.has(id)).toBe(true);
    expect(store.state.horaryJudgments.has(id)).toBe(false);
    expect(store.state.deleted.horaryJudgments.has(id)).toBe(false);
    expect(store.state.horaryJudgments.get(keep)).toMatchObject({ status: 'ready', question: 'Kept' });

    const observer = await openDatabase(name);
    const rows = (await allRecords(observer)).filter((record) => record.entityId === id);
    observer.close();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ entity: HORARY_JUDGMENT_ENTITY, field: 'purged', value: true });
    // The question text is gone from the database, not only hidden.
    expect(JSON.stringify(await readAll(name))).not.toContain('Gone');

    store.close();
    open = [];
    const reopened = await openFresh(name);
    expect(reopened.state.horaryJudgments.has(id)).toBe(false);
    expect(reopened.state.deleted.horaryJudgments.has(id)).toBe(false);
    expect(reopened.state.erased.horaryJudgments.has(id)).toBe(true);
  });

  async function readAll(name: string): Promise<unknown> {
    const observer = await openDatabase(name);
    const rows = await allRecords(observer);
    observer.close();
    return rows;
  }

  it('refuses an over-long question and a bad record before anything is written', async () => {
    const id = newId('h');
    const store = await openFresh(freshName());
    await expect(store.mutate(horaryJudgmentCreate(id, 'a'.repeat(501), RECORD))).rejects.toBeInstanceOf(
      HoraryJudgmentRefusedError,
    );
    await expect(store.mutate(horaryJudgmentCreate(id, 'ok', { ...RECORD, houseSystem: 'K' }))).rejects.toBeInstanceOf(
      HoraryJudgmentRefusedError,
    );
    await expect(
      store.mutate([{ entity: HORARY_JUDGMENT_ENTITY, entityId: id, field: 'record', value: { version: 3 } }]),
    ).rejects.toBeInstanceOf(HoraryJudgmentRefusedError);
    expect(store.state.horaryJudgments.size).toBe(0);
    expect(store.state.deleted.horaryJudgments.size).toBe(0);
    expect(store.outgoing()).toHaveLength(0);
  });

  it('writes nothing of a batch when its second write is refused', async () => {
    const id = newId('h');
    const store = await openFresh(freshName());
    const [question] = horaryJudgmentCreate(id, 'Half', RECORD);
    if (question === undefined) throw new Error('fixture');
    await expect(
      store.mutate([question, { entity: HORARY_JUDGMENT_ENTITY, entityId: id, field: 'purged', value: true }]),
    ).rejects.toBeInstanceOf(HoraryJudgmentRefusedError);
    expect(store.outgoing()).toHaveLength(0);
    expect(store.state.horaryJudgments.size).toBe(0);
  });

  it('leaves a chart search alone when a judgment is saved beside it', async () => {
    const store = await openFresh(freshName());
    await store.mutate([{ entity: 'chartSearch', entityId: CHART_SEARCH_ID, field: 'name', value: 'Search' }]);
    await store.mutate(horaryJudgmentCreate(JUDGMENT_ID, 'Judgment', RECORD));
    await store.remove(HORARY_JUDGMENT_ENTITY, JUDGMENT_ID);
    expect(store.state.chartSearches.get(CHART_SEARCH_ID)).toMatchObject({ name: 'Search' });
    expect(store.state.horaryJudgments.size).toBe(0);
  });

  it('lists and keeps a peer judgment with an unknown house system as unreadable, with its id and question', async () => {
    const name = freshName();
    const id = newId('h');
    const store = await openFresh(name);
    const peer = recordsOf(
      [
        { entity: HORARY_JUDGMENT_ENTITY, entityId: id, field: 'question', value: 'From a newer build' },
        { entity: HORARY_JUDGMENT_ENTITY, entityId: id, field: 'record', value: { ...recordJson(), houseSystem: 'K' } },
      ],
      'b1b2c3d4e5f60718',
    );
    expect((await store.receive(peer)).rejected).toHaveLength(0);
    const expected = { status: 'unreadable', reason: 'unknown-value', id, question: 'From a newer build' };
    expect(store.state.horaryJudgments.get(id)).toMatchObject(expected);
    expect(sortedHoraryJudgments(store.state.horaryJudgments).map((j) => j.id)).toEqual([id]);
    expect(store.state.deleted.horaryJudgments.has(id)).toBe(false);
    store.close();
    open = [];
    const reopened = await openFresh(name);
    expect(reopened.state.horaryJudgments.get(id)).toMatchObject(expected);
  });

  it('folds a peer judgment whose place label is over 200 characters as ready, with the label intact', async () => {
    const id = newId('h');
    const store = await openFresh(freshName());
    const longLabel = 'Amsterdam, '.repeat(20) + 'Noord-Holland';
    expect(Array.from(longLabel).length).toBeGreaterThan(200);
    // The write guard refuses this label on this device; a peer can still send it, and reading must not throw.
    const local: Mutation = {
      entity: HORARY_JUDGMENT_ENTITY,
      entityId: id,
      field: 'record',
      value: { ...recordJson(), placeLabel: longLabel },
    };
    expect(refusal(local)).toBe('invalid');
    const peer = recordsOf(
      [
        { entity: HORARY_JUDGMENT_ENTITY, entityId: id, field: 'question', value: 'From a peer' },
        {
          entity: HORARY_JUDGMENT_ENTITY,
          entityId: id,
          field: 'record',
          value: { ...recordJson(), placeLabel: longLabel },
        },
      ],
      'b1b2c3d4e5f60718',
    );
    expect((await store.receive(peer)).rejected).toHaveLength(0);
    const saved = store.state.horaryJudgments.get(id);
    expect(saved).toMatchObject({ status: 'ready', id, question: 'From a peer' });
    expect(saved?.status === 'ready' ? saved.record.placeLabel : undefined).toBe(longLabel);
  });

  it('syncs between two devices in either order and agrees on the list', async () => {
    const one = await openFresh(freshName());
    const two = await openFresh(freshName());
    const idOne = newId('h');
    const idTwo = newId('h');
    await one.mutate(horaryJudgmentCreate(idOne, 'On one', RECORD));
    await two.mutate(horaryJudgmentCreate(idTwo, 'On two', { ...RECORD, houseSystem: 'W' }));
    const fromOne = one.outgoing();
    const fromTwo = two.outgoing();
    expect((await two.receive(fromOne)).rejected).toHaveLength(0);
    expect((await one.receive(fromTwo)).rejected).toHaveLength(0);
    expect(sortedHoraryJudgments(one.state.horaryJudgments)).toEqual(sortedHoraryJudgments(two.state.horaryJudgments));
    expect(one.state.horaryJudgments.size).toBe(2);
  });
});

describe('record version 2: the practitioner list (#1960)', () => {
  const REASON = HORARY_PRACTITIONER_REASONS['sign-change'];
  const v2 = (practitionerInput: JsonValue): Record<string, JsonValue> => ({ ...recordJson(), practitionerInput });
  const fold2 = (value: unknown) => foldHoraryJudgment(JUDGMENT_ID, fieldsOf('q', value));
  const write = (value: JsonValue): Mutation => ({
    entity: HORARY_JUDGMENT_ENTITY,
    entityId: JUDGMENT_ID,
    field: 'record',
    value,
  });

  describe('the upgrade path', () => {
    const v1Json = (): Record<string, JsonValue> => {
      const { practitionerInput: _dropped, ...rest } = recordJson();
      return { ...rest, version: 1 };
    };

    it('folds a version 1 record ready, with the list absent and not defaulted', () => {
      const judgment = fold2(v1Json());
      if (judgment?.status !== 'ready') throw new Error('expected ready');
      expect(judgment.record.version).toBe(1);
      expect(judgment.record.practitionerInput).toBeUndefined();
      expect('practitionerInput' in judgment.record).toBe(false);
      expect(judgment.record).toEqual(RECORD_V1);
    });

    it('folds a version 1 record carrying the list as invalid', () => {
      expect(fold2({ ...v1Json(), practitionerInput: [] })).toMatchObject({ status: 'unreadable', reason: 'invalid' });
    });

    it('folds a version 2 record without the list as invalid, never defaulted to an empty list', () => {
      const { practitionerInput: _dropped, ...rest } = recordJson();
      expect(fold2(rest)).toMatchObject({ status: 'unreadable', reason: 'invalid' });
    });

    it('folds a version 2 record with an empty list ready', () => {
      expect(fold2(v2([]))).toMatchObject({ status: 'ready', record: { version: 2, practitionerInput: [] } });
    });

    it('reads a version 3 record as future-version, as a version 1 build reads version 2', () => {
      expect(fold2({ ...v2([]), version: 3 })).toMatchObject({ reason: 'future-version' });
    });

    it('refuses to write a version 1 record, and the version 2 round trip keeps its list', () => {
      expect(refusal(write(JSON.parse(JSON.stringify(v1Json())) as JsonValue))).toBe('invalid');
      const input = [{ key: 'sign-change', reason: REASON }] as const;
      const state = fold(recordsOf(horaryJudgmentCreate(JUDGMENT_ID, 'q', { ...RECORD, practitionerInput: input })));
      const judgment = state.horaryJudgments.get(JUDGMENT_ID);
      if (judgment?.status !== 'ready') throw new Error('expected ready');
      expect(judgment.record.practitionerInput).toEqual(input);
    });
  });

  describe('the closed key list', () => {
    it('accepts every key with its own reason', () => {
      for (const key of HORARY_PRACTITIONER_KEYS) {
        const value = v2([{ key, reason: HORARY_PRACTITIONER_REASONS[key] }]);
        expect(fold2(value)).toMatchObject({ status: 'ready' });
        expect(refusal(write(value))).toBeUndefined();
      }
    });

    it('accepts all six keys at once', () => {
      const all = HORARY_PRACTITIONER_KEYS.map((key) => ({ key, reason: HORARY_PRACTITIONER_REASONS[key] }));
      expect(fold2(v2(all))).toMatchObject({ status: 'ready' });
    });

    it('folds an unknown key to unknown-value and refuses to write it', () => {
      const value = v2([{ key: 'moiety-of-the-moon', reason: REASON }]);
      expect(fold2(value)).toMatchObject({ status: 'unreadable', reason: 'unknown-value' });
      expect(refusal(write(value))).toBe('invalid');
    });

    it('folds a duplicate key to invalid and refuses to write it', () => {
      const entry = { key: 'sign-change', reason: REASON };
      expect(fold2(v2([entry, entry]))).toMatchObject({ status: 'unreadable', reason: 'invalid' });
      expect(refusal(write(v2([entry, entry])))).toBe('invalid');
    });

    it('folds an empty or non-string key to invalid, and lets invalid outrank unknown', () => {
      expect(fold2(v2([{ key: '', reason: REASON }]))).toMatchObject({ reason: 'invalid' });
      expect(fold2(v2([{ key: 7, reason: REASON }]))).toMatchObject({ reason: 'invalid' });
      const mixed = v2([
        { key: 'moiety-of-the-moon', reason: REASON },
        { key: 'sign-change', reason: 7 },
      ]);
      expect(fold2(mixed)).toMatchObject({ reason: 'invalid' });
    });

    it('folds and refuses a list that is not an array, or holds a non-record', () => {
      for (const bad of [true, 'sign-change', { key: 'sign-change' }, null, [null], ['sign-change']] as const) {
        expect(fold2(v2(bad as JsonValue))).toMatchObject({ reason: 'invalid' });
        expect(refusal(write(v2(bad as JsonValue)))).toBe('invalid');
      }
    });
  });

  describe('the reason', () => {
    const key = 'sign-change';
    const long = (count: number): string => REASON.slice(0, 10) + 'x'.repeat(count - 10);

    it('keeps the cap at 120 code points and every canonical reason within it', () => {
      expect(HORARY_PRACTITIONER_REASON_MAX_CHARACTERS).toBe(120);
      for (const k of HORARY_PRACTITIONER_KEYS) {
        expect(Array.from(HORARY_PRACTITIONER_REASONS[k]).length).toBeLessThanOrEqual(120);
      }
    });

    it('folds 120 code points ready and 121 invalid', () => {
      expect(fold2(v2([{ key, reason: long(120) }]))).toMatchObject({ status: 'ready' });
      expect(fold2(v2([{ key, reason: long(121) }]))).toMatchObject({ status: 'unreadable', reason: 'invalid' });
    });

    it('counts code points, not UTF-16 units', () => {
      const astral = '\u{1F52D}'.repeat(120);
      expect(astral.length).toBe(240);
      expect(fold2(v2([{ key, reason: astral }]))).toMatchObject({ status: 'ready' });
      expect(fold2(v2([{ key, reason: astral + '\u{1F52D}' }]))).toMatchObject({ reason: 'invalid' });
      const marks = '°′'.repeat(60);
      expect(fold2(v2([{ key, reason: marks }]))).toMatchObject({ status: 'ready' });
      expect(fold2(v2([{ key, reason: marks + '°' }]))).toMatchObject({ reason: 'invalid' });
    });

    it('refuses to write 121 code points, an empty reason, a wrong type and a reason that is not its key text', () => {
      expect(refusal(write(v2([{ key, reason: long(121) }])))).toBe('invalid');
      expect(refusal(write(v2([{ key, reason: '' }])))).toBe('invalid');
      expect(refusal(write(v2([{ key, reason: 7 }])))).toBe('invalid');
      expect(refusal(write(v2([{ key, reason: 'Practitioners differ.' }])))).toBe('invalid');
      expect(refusal(write(v2([{ key, reason: HORARY_PRACTITIONER_REASONS['rule-order'] }])))).toBe('invalid');
      expect(refusal(write(v2([{ key, reason: long(120) }])))).toBe('invalid');
    });

    it('lets a peer record with a reason that is not the canonical text fold ready: the fold checks length, the guard checks text', () => {
      expect(fold2(v2([{ key, reason: 'A newer build worded this differently.' }]))).toMatchObject({ status: 'ready' });
    });

    it('folds a peer over-long reason invalid without throwing', () => {
      expect(() => fold2(v2([{ key, reason: 'x'.repeat(100_000) }]))).not.toThrow();
      expect(fold2(v2([{ key, reason: 'x'.repeat(100_000) }]))).toMatchObject({ reason: 'invalid' });
    });

    it('refuses before the log is touched', async () => {
      const store = await openStore({ name: 'astraya-horary-judgment-v2-guard', now: () => T0 });
      const id = newId('h');
      const [questionWrite, recordWrite] = horaryJudgmentCreate(id, 'q', RECORD);
      if (questionWrite === undefined || recordWrite === undefined) throw new Error('fixture');
      const bad = { ...recordWrite, value: v2([{ key, reason: 'wrong' }]) };
      await expect(store.mutate([questionWrite, bad])).rejects.toBeInstanceOf(HoraryJudgmentRefusedError);
      expect(store.outgoing()).toHaveLength(0);
      expect(store.state.horaryJudgments.size).toBe(0);
      store.close();
    });
  });
});
