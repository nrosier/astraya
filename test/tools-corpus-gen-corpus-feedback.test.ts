/**
 * Regression coverage for `tools/corpus-gen/lib/corpus-feedback.mjs` (#381): the per-locale
 * feedback file read/write between evaluate-corpus-batch.mjs and improve-corpus-batch.mjs.
 * Identity is the entry's key.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
// prettier-ignore
// @ts-expect-error -- plain .mjs, no type declarations; cast to known shapes below.
import { readFeedback as readFeedbackUntyped, writeFeedback as writeFeedbackUntyped, upsertFeedback as upsertFeedbackUntyped, removeFeedback as removeFeedbackUntyped } from '../tools/corpus-gen/lib/corpus-feedback.mjs';

interface FeedbackRecord {
  readonly key: string;
  readonly locale: string;
  readonly originalText: string;
  readonly issues: readonly string[];
  readonly flaggedAt: string;
}

const readFeedback = readFeedbackUntyped as (path: string) => Promise<FeedbackRecord[]>;
const writeFeedback = writeFeedbackUntyped as (path: string, feedback: readonly FeedbackRecord[]) => Promise<void>;
const upsertFeedback = upsertFeedbackUntyped as (feedback: FeedbackRecord[], record: FeedbackRecord) => void;
const removeFeedback = removeFeedbackUntyped as (
  feedback: FeedbackRecord[],
  identity: { readonly key: string },
) => void;

function record(overrides: Partial<FeedbackRecord> = {}): FeedbackRecord {
  return {
    key: 'planet-in-sign:saturn:9',
    locale: 'en',
    originalText: 'original text',
    issues: ['generic trope'],
    flaggedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'corpus-feedback-test-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('readFeedback (#381)', () => {
  it('returns an empty array when the file does not exist yet', async () => {
    expect(await readFeedback(join(dir, 'nope.json'))).toEqual([]);
  });

  it('reads back what writeFeedback wrote', async () => {
    const path = join(dir, 'en.json');
    await writeFeedback(path, [record()]);
    expect(await readFeedback(path)).toEqual([record()]);
  });

  it('writeFeedback pretty-prints with a trailing newline, for a legible hand-editable artifact', async () => {
    const path = join(dir, 'en.json');
    await writeFeedback(path, [record()]);
    const raw = await readFile(path, 'utf8');
    expect(raw.endsWith('\n')).toBe(true);
    expect(raw).toContain('\n  ');
  });
});

describe('upsertFeedback (#381)', () => {
  it('appends a new record when none exists for this key', () => {
    const feedback: FeedbackRecord[] = [];
    upsertFeedback(feedback, record());
    expect(feedback).toEqual([record()]);
  });

  it('replaces the existing record for the same key instead of duplicating it', () => {
    const feedback: FeedbackRecord[] = [record({ issues: ['old issue'] })];
    upsertFeedback(feedback, record({ issues: ['new issue'] }));
    expect(feedback).toHaveLength(1);
    expect(feedback[0]?.issues).toEqual(['new issue']);
  });
});

describe('removeFeedback (#381)', () => {
  it('removes the matching record', () => {
    const other = record({ key: 'planet-in-sign:mars:0' });
    const feedback: FeedbackRecord[] = [record(), other];
    removeFeedback(feedback, { key: record().key });
    expect(feedback).toEqual([other]);
  });

  it('is a no-op when no record matches', () => {
    const feedback: FeedbackRecord[] = [record()];
    removeFeedback(feedback, { key: 'planet-in-sign:mars:0' });
    expect(feedback).toEqual([record()]);
  });
});
