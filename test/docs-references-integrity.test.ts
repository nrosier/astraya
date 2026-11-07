/**
 * Integrity of `docs/references/sources.json` against the files it describes. The record-to-file check and the
 * unlisted-file check need the Mac-local `docs/references/sources/` and `text/` trees, so they are skipped with an
 * explicit reason on a clone that lacks them. The id and `used_by` checks need only tracked files and always run.
 * Each failure mode is also proven against temp-dir fixtures, independent of the real local files.
 */
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

interface SourceRecord {
  readonly id: string;
  readonly processed_path?: string | null;
  readonly text_path?: string | null;
  readonly pages_path?: string | null;
  readonly sha256?: string | null;
  readonly provisional?: boolean;
  readonly used_by?: readonly string[];
}

interface IntegrityReport {
  readonly idProblems: readonly string[];
  readonly usedByProblems: readonly string[];
  readonly recordFileProblems: readonly string[];
  readonly unlistedFileProblems: readonly string[];
  readonly shaProblems: readonly string[];
  /** Set when `sources/` is absent, so the file-tree and hash checks could not run. */
  readonly localFilesAbsentReason: string | null;
}

const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*-(\d{4}|undated)$/;
const PATH_FIELDS = ['processed_path', 'text_path', 'pages_path'] as const;

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(full);
    return entry.name.startsWith('.') ? [] : [full];
  });
}

/** Checks `<root>/docs/references/sources.json` against the tree under `root`. */
export function checkReferenceIntegrity(root: string): IntegrityReport {
  const refs = join(root, 'docs/references');
  const records = JSON.parse(readFileSync(join(refs, 'sources.json'), 'utf8')) as SourceRecord[];

  const idProblems = records
    .filter((r) => !ID_PATTERN.test(r.id) && r.provisional !== true)
    .map((r) => `id "${r.id}" does not match the id pattern and is not provisional`);

  const usedByProblems = records.flatMap((r) =>
    (r.used_by ?? []).filter((p) => !existsSync(join(root, p))).map((p) => `${r.id}: used_by path ${p} does not exist`),
  );

  const localFilesAbsentReason = existsSync(join(refs, 'sources'))
    ? null
    : 'Mac-local files absent: sources/ not present';
  if (localFilesAbsentReason !== null) {
    return {
      idProblems,
      usedByProblems,
      recordFileProblems: [],
      unlistedFileProblems: [],
      shaProblems: [],
      localFilesAbsentReason,
    };
  }

  const recordFileProblems = records.flatMap((r) =>
    PATH_FIELDS.flatMap((field) => {
      const p = r[field];
      return typeof p === 'string' && !existsSync(join(root, p)) ? [`${r.id}: ${field} ${p} does not exist`] : [];
    }),
  );

  const listed = records.flatMap((r) =>
    PATH_FIELDS.flatMap((field) => {
      const p = r[field];
      return typeof p === 'string' ? [resolve(root, p)] : [];
    }),
  );
  const isListed = (file: string): boolean =>
    listed.some(
      (p) => p === file || (existsSync(p) && statSync(p).isDirectory() && !relative(p, file).startsWith('..')),
    );
  const unlistedFileProblems = [join(refs, 'sources'), join(refs, 'text')]
    .flatMap(listFiles)
    .filter((f) => !isListed(resolve(f)))
    .map((f) => `${relative(root, f)} has no sources.json entry`);

  const shaProblems = records.flatMap((r) => {
    const p = r.processed_path;
    if (typeof p !== 'string' || typeof r.sha256 !== 'string' || !existsSync(join(root, p))) return [];
    if (!statSync(join(root, p)).isFile()) return [];
    const actual = createHash('sha256')
      .update(readFileSync(join(root, p)))
      .digest('hex');
    return actual === r.sha256 ? [] : [`${r.id}: sha256 of ${p} is ${actual}, sources.json records ${r.sha256}`];
  });

  return { idProblems, usedByProblems, recordFileProblems, unlistedFileProblems, shaProblems, localFilesAbsentReason };
}

const tmpRoots: string[] = [];

function fixture(records: readonly object[], files: readonly string[]): string {
  const root = mkdtempSync(join(tmpdir(), 'refs-integrity-'));
  tmpRoots.push(root);
  const put = (rel: string, body: string): void => {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), body);
  };
  put('docs/references/sources.json', JSON.stringify(records));
  mkdirSync(join(root, 'docs/references/sources'), { recursive: true });
  mkdirSync(join(root, 'docs/references/text'), { recursive: true });
  for (const f of files) put(f, 'x');
  return root;
}

afterEach(() => {
  for (const r of tmpRoots.splice(0)) rmSync(r, { recursive: true, force: true });
});

describe('checkReferenceIntegrity (fixtures)', () => {
  const good = {
    id: 'lilly-christian-astrology-1647',
    processed_path: 'docs/references/sources/pdf/a.pdf',
    text_path: 'docs/references/text/a.txt',
    pages_path: null,
    used_by: ['docs/used.md'],
  };
  const goodFiles = ['docs/references/sources/pdf/a.pdf', 'docs/references/text/a.txt', 'docs/used.md'];

  it('passes a consistent set, including a missing record with null paths', () => {
    const missing = {
      id: 'placidus-tabulae-undated',
      status: 'missing',
      processed_path: null,
      text_path: null,
      pages_path: null,
    };
    const report = checkReferenceIntegrity(fixture([good, missing], goodFiles));
    expect(report).toMatchObject({
      idProblems: [],
      usedByProblems: [],
      recordFileProblems: [],
      unlistedFileProblems: [],
      shaProblems: [],
      localFilesAbsentReason: null,
    });
  });

  it('fails when processed_path, text_path or pages_path points at a missing file', () => {
    const bad = { ...good, pages_path: 'docs/references/text/pages-a.json' };
    const report = checkReferenceIntegrity(fixture([bad], ['docs/references/text/a.txt', 'docs/used.md']));
    expect(report.recordFileProblems).toHaveLength(2);
    expect(report.recordFileProblems.join('\n')).toContain('processed_path');
    expect(report.recordFileProblems.join('\n')).toContain('pages_path');
  });

  it('passes when processed_path content matches sha256 and skips records without a hash', () => {
    const hashed = { ...good, sha256: createHash('sha256').update('x').digest('hex') };
    const noHash = { ...good, id: 'other-source-1650', sha256: null, used_by: [] };
    const report = checkReferenceIntegrity(fixture([hashed, noHash], goodFiles));
    expect(report.shaProblems).toEqual([]);
  });

  it('fails when processed_path content does not match sha256', () => {
    const wrong = createHash('sha256').update('y').digest('hex');
    const report = checkReferenceIntegrity(fixture([{ ...good, sha256: wrong }], goodFiles));
    expect(report.shaProblems).toHaveLength(1);
    expect(report.shaProblems.join('\n')).toContain('lilly-christian-astrology-1647: sha256 of');
  });

  it('fails when a used_by path does not exist', () => {
    const report = checkReferenceIntegrity(fixture([good], goodFiles.slice(0, 2)));
    expect(report.usedByProblems).toEqual(['lilly-christian-astrology-1647: used_by path docs/used.md does not exist']);
  });

  it('fails when a file under sources/ or text/ has no entry', () => {
    const extra = ['docs/references/sources/pdf/orphan.pdf', 'docs/references/text/orphan.txt'];
    const report = checkReferenceIntegrity(fixture([good], [...goodFiles, ...extra]));
    expect(report.unlistedFileProblems).toEqual(extra.map((f) => `${f} has no sources.json entry`));
  });

  it('fails an id that breaks the pattern unless it is provisional', () => {
    const records = [
      { id: 'Bad_Id' },
      { id: 'unidentified-1', provisional: true },
      { id: 'no-year' },
      { id: 'ok-title-undated' },
    ];
    const report = checkReferenceIntegrity(fixture(records, []));
    expect(report.idProblems).toHaveLength(2);
    expect(report.idProblems.join('\n')).toContain('Bad_Id');
    expect(report.idProblems.join('\n')).toContain('no-year');
  });

  it('reports the skip reason and skips the file-tree checks when sources/ is absent', () => {
    const root = fixture([good], []);
    rmSync(join(root, 'docs/references/sources'), { recursive: true });
    const report = checkReferenceIntegrity(root);
    expect(report.localFilesAbsentReason).toBe('Mac-local files absent: sources/ not present');
    expect(report.recordFileProblems).toEqual([]);
    expect(report.shaProblems).toEqual([]);
    expect(report.usedByProblems).toHaveLength(1);
  });
});

describe('docs/references/sources.json (real tree)', () => {
  const root = resolve(import.meta.dirname, '..');
  const present = existsSync(join(root, 'docs/references/sources.json'));
  const report = present ? checkReferenceIntegrity(root) : null;

  it.skipIf(!present)('has valid ids', () => {
    expect(report?.idProblems).toEqual([]);
  });

  it.skipIf(!present)('has used_by paths that all exist', () => {
    expect(report?.usedByProblems).toEqual([]);
  });

  it.skipIf(!present || (report?.localFilesAbsentReason ?? null) !== null)(
    'has every record path on disk and every local file listed (skipped: Mac-local files absent: sources/ not present)',
    () => {
      expect(report?.recordFileProblems).toEqual([]);
      expect(report?.unlistedFileProblems).toEqual([]);
    },
  );

  it.skipIf(!present || (report?.localFilesAbsentReason ?? null) !== null)(
    'has every processed_path matching its recorded sha256 (skipped: Mac-local files absent: sources/ not present)',
    () => {
      expect(report?.shaProblems).toEqual([]);
    },
  );
});
