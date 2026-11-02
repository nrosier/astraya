/**
 * Snapshot trust across a build upgrade (#919).
 *
 * An older build that did not know `birthNote` receives a note record from a newer device,
 * skips it, and writes a snapshot. That snapshot still counts the skipped record in `applied`,
 * so the count alone cannot tell it apart from a complete one. These tests pin the fix: a
 * snapshot is resumed only when its stamped entity-kind set matches this build's, and any other
 * snapshot is rebuilt from the log, so the note becomes visible after the upgrade.
 */
import { describe, expect, it } from 'vitest';
import { applyRecords, EMPTY_REGISTERS, materialise, resume, snapshotOf } from '../src/store/fold.js';
import { birthNoteRevision } from '../src/store/notes.js';
import { createClock } from '../src/store/hlc.js';
import { append, emptyLog, type Log, type Mutation } from '../src/store/oplog.js';
import type { OpRecord } from '../src/store/ops.js';

const A = 'a1b2c3d4e5f60718';
const B = 'b0000000000000ff';
const T0 = 1_780_963_200_000;
const PERSON = 'p-abcdefghijklmnop';

/** The entity kinds the build before #919 knew: no note kinds at all. */
const OLD_BUILD_KINDS: readonly string[] = ['person', 'chart'];

/** Write mutations as one device, one per millisecond so the order is easy to read. */
function write(nodeId: string, mutations: readonly Mutation[], from = T0): readonly OpRecord[] {
  let log: Log = emptyLog(createClock(nodeId));
  mutations.forEach((mutation, index) => {
    log = append(log, mutation, from + index).log;
  });
  return log.records;
}

const PERSON_RECORDS = write(A, [{ entity: 'person', entityId: PERSON, field: 'displayName', value: 'Ada' }]);

describe('resuming a snapshot across a build upgrade (#919)', () => {
  it('rebuilds when an older build skipped birthNote, so the note appears after upgrade', () => {
    // The newer device writes the birth note at T0+5000. A known-kind edit at T0+10000 then
    // becomes the snapshot's upTo, so the skipped note sits at or below it and is counted.
    const noteRecords = write(B, [birthNoteRevision(PERSON, 'r-birth', 'Birth note text', [])], T0 + 5_000);
    const laterEdit = write(
      A,
      [{ entity: 'person', entityId: PERSON, field: 'placeLabel', value: 'Vevay' }],
      T0 + 10_000,
    );
    const all = [...PERSON_RECORDS, ...noteRecords, ...laterEdit];

    // The old build folds the same log but does not know birthNote, so it skips the note and
    // stamps the snapshot with its own (smaller) kind set.
    const oldRegisters = applyRecords(EMPTY_REGISTERS, all, OLD_BUILD_KINDS).registers;
    const oldSnapshot = snapshotOf(oldRegisters, all, OLD_BUILD_KINDS);
    expect(oldSnapshot.applied).toBe(all.length);

    // This build resumes from that snapshot. The count matches, so only the kind stamp can refuse it.
    const resumed = resume(oldSnapshot, all);
    const rebuilt = applyRecords(EMPTY_REGISTERS, all);
    expect(resumed.rebuilt).toBe(true);

    const resumedNotes = materialise(resumed.registers).birthNotes.size;
    const rebuiltNotes = materialise(rebuilt.registers).birthNotes.size;
    expect(resumedNotes).toBe(rebuiltNotes);
    expect(rebuiltNotes).toBe(1);
    expect(materialise(resumed.registers).birthNotes.get(PERSON)?.content).toBe('Birth note text');
  });

  it('rebuilds a snapshot written before the kind stamp existed', () => {
    const all = [...PERSON_RECORDS];
    const registers = applyRecords(EMPTY_REGISTERS, all).registers;
    // A pre-stamp snapshot has the same shape as today's minus `entities`.
    const { entities: _stamp, ...unstamped } = snapshotOf(registers, all);
    expect(_stamp).toBeDefined();
    expect(resume(unstamped, all).rebuilt).toBe(true);
  });

  it('still resumes without rebuilding when the kinds match and only newer records arrived', () => {
    const base = [...PERSON_RECORDS, ...write(A, [birthNoteRevision(PERSON, 'r-birth', 'Birth', [])], T0 + 5_000)];
    const later = write(B, [birthNoteRevision(PERSON, 'r-second', 'Second', ['r-birth'])], T0 + 20_000);
    const all = [...base, ...later];

    const snapshot = snapshotOf(applyRecords(EMPTY_REGISTERS, base).registers, base);
    const resumed = resume(snapshot, all);
    const rebuilt = applyRecords(EMPTY_REGISTERS, all);
    expect(resumed.rebuilt).toBe(false);
    expect(materialise(resumed.registers).birthNotes).toEqual(materialise(rebuilt.registers).birthNotes);
    expect(materialise(resumed.registers).people).toEqual(materialise(rebuilt.registers).people);
  });
});
