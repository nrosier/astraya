import { execSync } from 'node:child_process';
import { lstatSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { loadEnv, type Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const pkg: { version: string } = JSON.parse(readFileSync('./package.json', 'utf8')) as { version: string };

/** Short commit SHA for the About page and the AGPL source link. */
function commitSha(): string {
  // CI provides this; a source tarball with no .git has neither, hence the fallback.
  if (process.env.GITHUB_SHA !== undefined) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return 'unknown';
  }
}

/**
 * Writes `dist/precache-manifest.json`: every emitted `.html`/`.js`/`.css` path,
 * for the service worker's `install` handler to precache (#99). Vite's
 * content-hashed filenames aren't statically knowable from `src/sw.ts` itself,
 * so this is what bridges that gap — the service worker's own build
 * (`vite.sw.config.ts`) runs after this one and never touches this file.
 *
 * Paths are prefixed with `base` so they match what the app is actually served
 * at (a GitHub Pages project site, for example, isn't served from `/`).
 */
function precacheManifest(base: string): Plugin {
  return {
    name: 'astraya-precache-manifest',
    writeBundle(options, bundle) {
      // `base` covers the navigation request for index.html; listing
      // `${base}index.html` too would just precache the identical response
      // under a second key.
      const paths = [base, ...Object.keys(bundle).map((fileName) => `${base}${fileName}`)].filter(
        (path) => path !== `${base}index.html` && (path === base || /\.(html|js|css)$/.test(path)),
      );
      writeFileSync(`${options.dir ?? 'dist'}/precache-manifest.json`, JSON.stringify(paths));
    },
  };
}

/**
 * Resolves the metafile target to the real path it would be written to, following symlinks where they resolve.
 * A target that exists is resolved fully. A missing target, or a broken link, is placed in its real parent directory
 * under its own name. The parent must be a real directory (a broken link or a regular file is refused), and a refusal
 * is one message line: Vite prints the stack after it, the first line is the message the caller can act on.
 */
function resolveMetafileTarget(absolute: string): string {
  const parent = dirname(absolute);
  const parentStat = statSync(parent, { throwIfNoEntry: false });
  if (parentStat === undefined || !parentStat.isDirectory()) {
    throw new Error(`ASTRAYA_METAFILE's directory is not an existing folder: ${parent}`);
  }
  // A target that resolves to something real is followed; a missing one or a broken link is placed in the real parent.
  if (statSync(absolute, { throwIfNoEntry: false }) !== undefined) return realpathSync.native(absolute);
  return join(realpathSync.native(parent), basename(absolute));
}

/**
 * Writes a per-chunk module breakdown to `ASTRAYA_METAFILE` (a path outside the repo, set by the caller) when
 * that variable is present. Read-only: it reads the rendered bundle and emits nothing into `dist/`, so the
 * bundle and the eager-graph gate are unaffected.
 *
 * The report is written by rename, never in place: it goes to a temporary file beside the target, opened with
 * `wx`, and that file is renamed over the target. A rename replaces the directory entry, so a hard link to a tracked
 * file is not written through, and an interrupted build cannot leave a half-written target.
 */
function moduleSizeReport(): Plugin {
  let target: string | undefined;
  return {
    name: 'astraya-module-size-report',
    // Build only: under Vitest or `vite dev` there is no bundle to report, and the guard must not fail those runs.
    apply: 'build',
    // Checked before any output is written (not in writeBundle), against the root Vite resolved. The target is
    // resolved fully, so a symlink, a hard link, a broken link and a spelling such as `<repo>/.` cannot slip past.
    configResolved(config) {
      const configured = process.env.ASTRAYA_METAFILE;
      if (configured === undefined || configured === '') return;
      const absolute = resolve(configured);
      const root = realpathSync.native(config.root);
      const resolvedTarget = resolveMetafileTarget(absolute);
      if (resolvedTarget === root || resolvedTarget.startsWith(`${root}${sep}`)) {
        throw new Error(`ASTRAYA_METAFILE must point outside the repository (got ${resolvedTarget}).`);
      }
      const existing = lstatSync(resolvedTarget, { throwIfNoEntry: false });
      if (existing?.isSymbolicLink() || existing?.isDirectory()) {
        throw new Error(`ASTRAYA_METAFILE must name a regular file, not a directory or link (got ${resolvedTarget}).`);
      }
      target = resolvedTarget;
    },
    writeBundle(_options, bundle) {
      if (target === undefined) return;
      const report: Record<string, { bytes: number; modules: Record<string, number> }> = {};
      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (chunk.type !== 'chunk') continue;
        const modules: Record<string, number> = {};
        for (const [id, info] of Object.entries(chunk.modules)) modules[id] = info.renderedLength;
        report[fileName] = { bytes: Buffer.byteLength(chunk.code), modules };
      }
      const temporary = join(dirname(target), `.${basename(target)}.${process.pid}.tmp`);
      try {
        writeFileSync(temporary, JSON.stringify(report), { flag: 'wx' });
        renameSync(temporary, target);
      } catch (error) {
        // EEXIST means something already sat at the temporary name (a file, a link or a directory) and `wx` refused
        // to touch it, so that is not this build's file and must survive. Any other failure, in the write or the
        // rename, leaves this build's partial file, which is removed.
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') rmSync(temporary, { force: true });
        throw error;
      }
    },
  };
}

/**
 * `public/manifest.webmanifest` is a static, committed JSON file — it isn't part
 * of the HTML asset graph Vite's `base` rewriting covers, so its root-absolute
 * `id`/`start_url`/`scope`/icon `src` fields need a manual pass when serving
 * from a subpath. A no-op when `base` is `/`.
 */
function patchManifestBase(base: string): Plugin {
  return {
    name: 'astraya-patch-manifest-base',
    writeBundle(options) {
      if (base === '/') return;
      const dir = options.dir ?? 'dist';
      const path = `${dir}/manifest.webmanifest`;
      const manifest = JSON.parse(readFileSync(path, 'utf8')) as {
        id?: string;
        start_url?: string;
        scope?: string;
        icons?: { src: string }[];
      };
      const prefixed = (value: string): string => (value.startsWith('/') ? `${base}${value.slice(1)}` : value);
      if (manifest.id !== undefined) manifest.id = prefixed(manifest.id);
      if (manifest.start_url !== undefined) manifest.start_url = prefixed(manifest.start_url);
      if (manifest.scope !== undefined) manifest.scope = prefixed(manifest.scope);
      for (const icon of manifest.icons ?? []) icon.src = prefixed(icon.src);
      writeFileSync(path, JSON.stringify(manifest));
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const base = env.VITE_BASE_PATH ?? '/';

  return {
    base,
    plugins: [react(), precacheManifest(base), patchManifestBase(base), moduleSizeReport()],
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __APP_COMMIT__: JSON.stringify(commitSha()),
      __APP_BUILT_AT__: JSON.stringify(new Date().toISOString()),
    },
    build: {
      target: 'es2022',
      // The Swiss Ephemeris data files are large and immutable per release; they
      // are served from public/ephe and fetched at runtime, never bundled.
      assetsInlineLimit: 0,
      // Vite's default 500 kB warning threshold is tripped by one chunk that is already
      // reviewed and deliberately accepted (#494): the lazy PDF-render chunk, which intentionally
      // bundles jspdf/jspdf-autotable/svg2pdf.js together behind its own dynamic import() so the
      // eager graph (gated separately and far more strictly by scripts/check-bundle-size.mjs)
      // never pays for it. 530 kB leaves it unflagged while still catching any *other* chunk that
      // grows past it unexpectedly — raise this deliberately, with an updated reason here, rather
      // than letting it drift.
      chunkSizeWarningLimit: 530,
    },
    worker: { format: 'es' },
    test: {
      environment: 'node',
      // Print console output on every host, not only under CI=true (#1802): Vitest otherwise hides it locally, and
      // scripts/run-without-warnings.mjs could not see a React warning in a local `npm test`.
      silent: false,
      setupFiles: ['./test/setup.ts'],
      include: ['test/**/*.test.ts', 'test/**/*.test.tsx', 'src/**/*.test.ts'],
      // The WASM module takes a moment to instantiate on first use.
      testTimeout: 30_000,
      // Report only, deliberately: no threshold. A global percentage invites gaming; the risky paths
      // (auth, sync, restore, error handling) are what the report is for. Run with `npm run test:coverage`.
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,tsx}', 'server/**/*.ts'],
        reporter: ['text-summary', 'text'],
        reportsDirectory: 'coverage',
      },
    },
  };
});
