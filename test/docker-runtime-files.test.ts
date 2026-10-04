/**
 * The Docker image must contain every file the server loads at runtime (#426's release shipped an image
 * that crashed on start: the server had gained an import of a `src/` file the Dockerfile's hand-traced
 * copy list did not name).
 *
 * The runtime stage copies `server/` whole but only a named list of `src/` files, because the server
 * runs TypeScript directly and reaches a handful of shared modules. This test computes the real
 * closure, starting from `server/index.ts` and following every relative import that Node's type
 * stripping leaves in place, and fails with the exact files the Dockerfile is missing, so a new import
 * can't reach a release without its COPY line.
 *
 * What counts as runtime: any import statement except a whole-statement `import type` (erased
 * entirely). `import { type A } from './x'` is *not* erased — Node keeps `import {} from './x'`, which
 * still loads the module — so it counts. Comments and strings are not parsed as imports.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');
const ENTRY = 'server/index.ts';

/** The relative specifiers a file loads at runtime. */
export function runtimeImports(source: string): string[] {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const specifiers: string[] = [];
  // import ... from '...';  import '...';  export ... from '...';  (multi-line specifier lists included)
  const statement = /(^|\n)\s*(import|export)\b([^;]*?)\bfrom\s*['"]([^'"]+)['"]|(^|\n)\s*import\s*['"]([^'"]+)['"]/g;
  for (const match of withoutComments.matchAll(statement)) {
    const keyword = match[2];
    const clause = match[3] ?? '';
    const from = match[4] ?? match[6];
    if (!from?.startsWith('.')) continue;
    // `import type { A } from` / `export type { A } from` are erased whole.
    if (/^\s*type\b/.test(clause) && (keyword === 'import' || keyword === 'export')) continue;
    specifiers.push(from);
  }
  return specifiers;
}

/** What a relative specifier names *as written*: Node runs the TypeScript directly and never maps `.js` to `.ts`. */
function resolveAsWritten(fromFile: string, specifier: string): string | undefined {
  const target = normalize(join(dirname(fromFile), specifier));
  return existsSync(join(ROOT, target)) ? target : undefined;
}

/** `.js`/`.tsx` spellings the bundler and tsc accept for a TypeScript file, used only to suggest the fix. */
function suggestion(fromFile: string, specifier: string): string | undefined {
  const base = normalize(join(dirname(fromFile), specifier));
  return [base.replace(/\.js$/, '.ts'), `${base}.ts`, join(base, 'index.ts')].find((candidate) =>
    existsSync(join(ROOT, candidate)),
  );
}

interface Unresolvable {
  readonly from: string;
  readonly specifier: string;
  readonly fix: string | undefined;
}

/** Every file (relative to the repo root) loaded at runtime from `entry`, and every import Node cannot resolve as written. */
function closure(entry: string): { files: Set<string>; unresolvable: Unresolvable[] } {
  const files = new Set<string>();
  const unresolvable: Unresolvable[] = [];
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop();
    if (file === undefined || files.has(file)) continue;
    files.add(file);
    if (!/\.(ts|tsx|js|mjs)$/.test(file)) continue;
    for (const specifier of runtimeImports(readFileSync(join(ROOT, file), 'utf8'))) {
      const resolved = resolveAsWritten(file, specifier);
      if (resolved !== undefined) {
        queue.push(resolved);
        continue;
      }
      const fix = suggestion(file, specifier);
      unresolvable.push({ from: file, specifier, fix });
      // Keep following the file the bundler would find, so one bad specifier does not hide the rest.
      if (fix !== undefined) queue.push(fix);
    }
  }
  return { files, unresolvable };
}

/** The `src/` files the runtime stage copies, from its `COPY --from=build /app/src/... ./src/...` lines. */
function copiedSourceFiles(): Set<string> {
  const dockerfile = readFileSync(join(ROOT, 'Dockerfile'), 'utf8');
  const runtime = dockerfile.slice(dockerfile.indexOf('AS runtime\n'));
  return new Set(
    [...runtime.matchAll(/^COPY --from=build \/app\/(src\/\S+)\s+\.\/(\S+)\s*$/gm)].map((m) => m[2] ?? ''),
  );
}

describe('runtimeImports', () => {
  it('sees value imports, side-effect imports, re-exports and mixed type/value imports', () => {
    const source = `
      import a from './a.js';
      import { b, type B } from './b.js';
      import { type C } from './c.js';
      import './d.js';
      export { e } from './e.js';
      export * from './f.js';
      import {
        g,
        h,
      } from './g.js';
    `;
    expect(runtimeImports(source)).toEqual(['./a.js', './b.js', './c.js', './d.js', './e.js', './f.js', './g.js']);
  });

  it('ignores whole-statement type imports and exports, packages, and anything in a comment', () => {
    const source = `
      import type { A } from './a.js';
      export type { B } from './b.js';
      import fastify from 'fastify';
      import { x } from 'node:path';
      // import './commented.js';
      /* import './blocked.js'; */
      const s = "import './in-a-string.js'";
    `;
    expect(runtimeImports(source)).toEqual([]);
  });
});

describe('the Docker runtime image (#426)', () => {
  it('contains every src/ file the server loads at runtime', () => {
    const needed = [...closure(ENTRY).files].filter(
      (file) => file.startsWith('src/') && /\.(ts|tsx|json|js|mjs)$/.test(file),
    );
    const copied = copiedSourceFiles();
    const missing = needed.filter((file) => !copied.has(file)).sort();
    expect(
      missing,
      `The server imports these src/ files at runtime but the Dockerfile's runtime stage does not copy them. Add a line for each:\n${missing
        .map((file) => `COPY --from=build /app/${file} ./${file}`)
        .join('\n')}`,
    ).toEqual([]);
  });

  it('every runtime import resolves as written, because Node runs the TypeScript directly (no .js to .ts mapping)', () => {
    const { unresolvable } = closure(ENTRY);
    const lines = unresolvable.map(
      ({ from, specifier, fix }) =>
        `${from} imports '${specifier}'${fix === undefined ? ' (no such file)' : ` — write '${relative(dirname(from), fix).replace(/^(?!\.)/, './')}'`}`,
    );
    expect(
      lines,
      'These imports work in the repo (Vite and tsc map .js to .ts) but fail in the Docker image, where Node loads the .ts files itself. Spell the extension .ts:',
    ).toEqual([]);
  });

  it('does not copy a src/ file the server never loads (a stale line hides nothing, but a typo would)', () => {
    const needed = closure(ENTRY).files;
    const stale = [...copiedSourceFiles()].filter((file) => !file.endsWith('.json') && !needed.has(file)).sort();
    expect(stale, `The Dockerfile copies files the server no longer reaches: ${stale.join(', ')}`).toEqual([]);
  });

  it('only copies src/ files that exist', () => {
    const absent = [...copiedSourceFiles()].filter((file) => !existsSync(join(ROOT, file)));
    expect(absent).toEqual([]);
  });

  it('starts from a server entry that exists, and reaches both server/ and src/', () => {
    const reached = closure(ENTRY).files;
    expect(reached.has(ENTRY)).toBe(true);
    expect([...reached].some((file) => file.startsWith('server/'))).toBe(true);
    expect([...reached].some((file) => relative('src', file).startsWith('interpretation'))).toBe(true);
  });
});
