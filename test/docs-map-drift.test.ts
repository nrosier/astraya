/**
 * Drift guard for the directory `MAP.md` indexes (CLAUDE.md, "MAP.md Format"). Two rules, checked against the tracked
 * tree: every tracked `.ts`/`.tsx`/`.mjs` file under `src/`, `server/` or `tools/` must be named in its directory's
 * `MAP.md` (a `X.messages.ts` file rides on its component `X.tsx`/`X.ts` entry), and every `MAP.md` bullet that names
 * a file with an extension must point at a file that exists. Each rule is also proven against temp-dir fixtures, so the
 * checker is known to fail before the real tree is judged. The real-tree check uses `git ls-files`, so `node_modules`
 * and untracked output are never scanned.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const SOURCE_FILE = /^(src|server|tools)\/.+\.(ts|tsx|mjs)$/;
const MESSAGES_FILE = /^(.+)\.messages\.ts$/;
const NAMED_FILE_EXTENSIONS = /\.(ts|tsx|mjs|cjs|js|json|md|sh|txt|tsv)$/;
const BULLET_NAME = /^- `([^`]+)`/;

/** True when `name` appears in `text` as a whole file name, not as part of a longer one such as `synastry-aspects.ts`. */
function namesFile(text: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![A-Za-z0-9_.-])${escaped}(?![A-Za-z0-9_-])`).test(text);
}

/**
 * Returns the drift problems in the tree under `root`. `tracked` is the list of tracked paths relative to `root`;
 * `MAP.md` files are read from disk, and only those listed in `tracked` are checked.
 */
export function mapDriftProblems(root: string, tracked: readonly string[]): string[] {
  const maps = tracked.filter((f) => f === 'MAP.md' || f.endsWith('/MAP.md'));
  const mapText = new Map(maps.map((m) => [m, readFileSync(join(root, m), 'utf8')] as const));
  const problems: string[] = [];

  for (const file of tracked.filter((f) => SOURCE_FILE.test(f))) {
    const dir = dirname(file);
    const map = dir === '.' ? 'MAP.md' : `${dir}/MAP.md`;
    const text = mapText.get(map);
    if (text === undefined) continue;

    const name = file.slice(dir.length + 1);
    const messages = MESSAGES_FILE.exec(name);
    // A messages file is named by its own bullet, or rides on its component's bullet (`X.tsx` + `.messages.ts`).
    const satisfied =
      namesFile(text, name) ||
      (messages !== null &&
        (namesFile(text, `${messages[1] ?? ''}.tsx`) || namesFile(text, `${messages[1] ?? ''}.ts`)));
    if (!satisfied) problems.push(`${file} is not named in ${map}`);
  }

  for (const [map, text] of mapText) {
    const dir = dirname(map);
    for (const line of text.split('\n')) {
      const name = BULLET_NAME.exec(line)?.[1];
      if (name === undefined || !NAMED_FILE_EXTENSIONS.test(name) || /[*\s]/.test(name)) continue;
      const target = dir === '.' ? name : `${dir}/${name}`;
      if (!existsSync(join(root, target))) problems.push(`${map} names ${target}, which does not exist`);
    }
  }

  return problems;
}

const tmpRoots: string[] = [];

function fixture(files: Readonly<Record<string, string>>): { root: string; tracked: string[] } {
  const root = mkdtempSync(join(tmpdir(), 'map-drift-'));
  tmpRoots.push(root);
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), body);
  }
  return { root, tracked: Object.keys(files) };
}

afterEach(() => {
  for (const r of tmpRoots.splice(0)) rmSync(r, { recursive: true, force: true });
});

describe('mapDriftProblems (fixtures)', () => {
  const mapWith = (...bullets: string[]): string => `# src/x/ — Map\n\n${bullets.join('\n')}\n`;

  it('passes a directory whose every tracked source file is named and every entry exists', () => {
    const { root, tracked } = fixture({
      'src/x/MAP.md': mapWith('- `a.ts` — A. Deps: none.', '- `B.tsx` + `B.messages.ts` — B. Deps: `a`.'),
      'src/x/a.ts': '',
      'src/x/B.tsx': '',
      'src/x/B.messages.ts': '',
    });
    expect(mapDriftProblems(root, tracked)).toEqual([]);
  });

  it('fails when a tracked source file is missing from its directory MAP.md', () => {
    const { root, tracked } = fixture({
      'src/x/MAP.md': mapWith('- `a.ts` — A.'),
      'src/x/a.ts': '',
      'src/x/orphan.ts': '',
    });
    expect(mapDriftProblems(root, tracked)).toEqual(['src/x/orphan.ts is not named in src/x/MAP.md']);
  });

  it('does not accept a longer file name as naming a shorter one', () => {
    const { root, tracked } = fixture({
      'src/x/MAP.md': mapWith('- `synastry-aspects.ts` — Longer name.'),
      'src/x/aspects.ts': '',
      'src/x/synastry-aspects.ts': '',
    });
    expect(mapDriftProblems(root, tracked)).toEqual(['src/x/aspects.ts is not named in src/x/MAP.md']);
  });

  it('lets a messages file ride on its component entry', () => {
    const { root, tracked } = fixture({
      'src/x/MAP.md': mapWith('- `Comp.tsx` + `.messages.ts` — Comp.'),
      'src/x/Comp.tsx': '',
      'src/x/Comp.messages.ts': '',
    });
    expect(mapDriftProblems(root, tracked)).toEqual([]);
  });

  it('accepts a standalone messages file named by its own bullet', () => {
    const { root, tracked } = fixture({
      'src/x/MAP.md': mapWith('- `Shared.messages.ts` — Shared strings.'),
      'src/x/Shared.messages.ts': '',
    });
    expect(mapDriftProblems(root, tracked)).toEqual([]);
  });

  it('fails a messages file whose component is not in the MAP', () => {
    const { root, tracked } = fixture({
      'src/x/MAP.md': mapWith('- `other.ts` — Other.'),
      'src/x/other.ts': '',
      'src/x/Comp.messages.ts': '',
    });
    expect(mapDriftProblems(root, tracked)).toEqual(['src/x/Comp.messages.ts is not named in src/x/MAP.md']);
  });

  it('fails when a MAP.md entry names a file that does not exist', () => {
    const { root, tracked } = fixture({
      'src/x/MAP.md': mapWith('- `a.ts` — A.', '- `ORB_SOURCES.md` — Not present; dropped.'),
      'src/x/a.ts': '',
    });
    expect(mapDriftProblems(root, tracked)).toEqual(['src/x/MAP.md names src/x/ORB_SOURCES.md, which does not exist']);
  });

  it('ignores directory bullets and bare names without a file extension', () => {
    const { root, tracked } = fixture({
      'src/x/MAP.md': mapWith('- `a.ts` — A.', '- `primitives/` — Subdirectory.', '- `sources/` — Local folder.'),
      'src/x/a.ts': '',
    });
    expect(mapDriftProblems(root, tracked)).toEqual([]);
  });
});

describe('mapDriftProblems (real tree)', () => {
  it('finds no drift between the tracked source files and the directory MAP.md indexes', () => {
    const root = resolve(dirname(new URL(import.meta.url).pathname), '..');
    const tracked = execFileSync('git', ['ls-files', '-z'], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
      .split('\0')
      .filter((f) => f.length > 0);
    expect(tracked.filter((f) => f.endsWith('MAP.md')).length).toBeGreaterThan(0);
    expect(mapDriftProblems(root, tracked)).toEqual([]);
  });
});
