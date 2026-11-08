/**
 * The human-run bake tool (`tools/corpus-gen/bake-overrides.mjs`, #1338 slice 4), exercised only against temp copies of
 * a tiny corpus. It never touches the real `src/interpretation/corpus/*.json`.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
// @ts-expect-error -- plain .mjs, no type declarations; cast to a known shape below.
import { runCli as runCliUntyped } from '../tools/corpus-gen/bake-overrides.mjs';

type RunCli = (
  args: string[],
  env: Record<string, string | undefined>,
  io: { out: (line: string) => void; err: (line: string) => void },
) => Promise<number>;
const runCli = runCliUntyped as RunCli;

const entry = (key: string, locale: string, text: string) => ({
  key,
  locale,
  text,
  tier: 'nuance',
  tags: [],
  provenance: { source: 'generated', model: 'm', generatedAt: '2026-01-01' },
});

const EN = [entry('a:one', 'en', 'Old one.'), entry('a:two', 'en', 'Old two.'), entry('a:three', 'en', 'Old three.')];
const NL = [entry('a:one', 'nl', 'Oud een.')];

const override = (key: string, locale: string, text: string) => ({
  key,
  locale,
  text,
  tier: 'nuance',
  tags: [],
  provenance: { source: 'hand-written', reviewedBy: 'alice', reviewedAt: '2026-11-01T10:00:00.000Z' },
});

let dir: string;
let corpusDir: string;
let input: string;

function fileText(locale: string): string {
  return readFileSync(join(corpusDir, `${locale}.json`), 'utf8');
}

async function run(args: string[], env: Record<string, string | undefined> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli([...args, '--input', input, '--corpus-dir', corpusDir], env, {
    out: (line) => out.push(line),
    err: (line) => err.push(line),
  });
  return { code, out: out.join('\n'), err: err.join('\n') };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'astraya-bake-'));
  corpusDir = join(dir, 'corpus');
  mkdirSync(corpusDir);
  writeFileSync(join(corpusDir, 'en.json'), `${JSON.stringify(EN, null, 2)}\n`);
  writeFileSync(join(corpusDir, 'nl.json'), `${JSON.stringify(NL, null, 2)}\n`);
  input = join(dir, 'overrides.json');
  writeFileSync(
    input,
    JSON.stringify([
      override('a:two', 'en', 'New two.'),
      override('a:one', 'en', 'New one.'),
      override('a:three', 'en', 'Old three.'),
      override('z:missing', 'en', 'Orphan text.'),
    ]),
  );
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('bake-overrides', () => {
  test('refuses to run without --write or --dry-run, and writes nothing', async () => {
    const before = [fileText('en'), fileText('nl')];
    const result = await run([]);
    expect(result.code).toBe(1);
    expect(result.err).toContain('exactly one of --dry-run and --write');
    expect([fileText('en'), fileText('nl')]).toEqual(before);
  });

  test('refuses both flags together, and refuses in CI', async () => {
    expect((await run(['--write', '--dry-run'])).code).toBe(1);
    const ci = await run(['--write'], { CI: 'true' });
    expect(ci.code).toBe(1);
    expect(fileText('en')).not.toContain('New one.');
  });

  test('refuses when run as a process with no flag', () => {
    const result = spawnSync(
      process.execPath,
      ['tools/corpus-gen/bake-overrides.mjs', '--input', input, '--corpus-dir', corpusDir],
      {
        encoding: 'utf8',
      },
    );
    expect(result.status).toBe(1);
    expect(fileText('en')).not.toContain('New one.');
  });

  test('dry-run prints the diff and writes nothing', async () => {
    const before = [fileText('en'), fileText('nl')];
    const result = await run(['--dry-run']);
    expect(result.code).toBe(0);
    expect(result.out).toContain('- Old one.');
    expect(result.out).toContain('+ New one.');
    expect(result.out).toContain('nothing written');
    expect([fileText('en'), fileText('nl')]).toEqual(before);
  });

  test('--write is deterministic: sorted by key, and the same input gives the same bytes', async () => {
    const first = await run(['--write']);
    expect(first.code).toBe(0);
    const afterFirst = fileText('en');
    const diffOrder = first.out.indexOf('a:one') < first.out.indexOf('a:two');
    expect(diffOrder).toBe(true);
    // Reverse the input order and bake from a fresh copy: identical bytes.
    writeFileSync(join(corpusDir, 'en.json'), `${JSON.stringify(EN, null, 2)}\n`);
    writeFileSync(
      input,
      JSON.stringify([
        override('z:missing', 'en', 'Orphan text.'),
        override('a:three', 'en', 'Old three.'),
        override('a:one', 'en', 'New one.'),
        override('a:two', 'en', 'New two.'),
      ]),
    );
    await run(['--write']);
    expect(fileText('en')).toBe(afterFirst);
    const parsed = JSON.parse(afterFirst) as { key: string; text: string }[];
    expect(parsed.map((e) => e.text)).toEqual(['New one.', 'New two.', 'Old three.']);
  });

  test('reviewedBy and the username are absent from the written entries', async () => {
    await run(['--write']);
    const written = fileText('en');
    expect(written).not.toContain('reviewedBy');
    expect(written).not.toContain('alice');
    const baked = (JSON.parse(written) as { key: string; provenance: Record<string, string> }[]).find(
      (e) => e.key === 'a:one',
    );
    expect(baked?.provenance).toEqual({ source: 'hand-written', reviewedAt: '2026-11-01T10:00:00.000Z' });
  });

  test('an orphan key is reported, not written; an identical text is reported for pruning', async () => {
    const result = await run(['--write']);
    expect(result.out).toContain('? en z:missing');
    expect(result.out).toContain('= en a:three');
    expect(fileText('en')).not.toContain('z:missing');
    expect(fileText('en')).not.toContain('Orphan text.');
    // The identical entry keeps its generated provenance byte for byte.
    expect(fileText('en')).toContain('"model": "m"');
    expect(fileText('nl')).toBe(`${JSON.stringify(NL, null, 2)}\n`);
  });
});
