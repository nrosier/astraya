/**
 * Exports approved server-side corpus overrides (#1338 D3) into the committed en.json and nl.json. HUMAN-RUN ONLY,
 * and only after the owner's explicit go-ahead for that bake. It is never called from CI, a build step, a hook or a
 * script, and refuses to run when `CI` is set.
 *
 *   node tools/corpus-gen/bake-overrides.mjs --input <overrides.json> --dry-run
 *   node tools/corpus-gen/bake-overrides.mjs --input <overrides.json> --write
 *
 * `<overrides.json>` is the admin export (`GET /api/admin/corpus-overrides/export`, a JSON array).
 */
/**
 * @module bake-overrides-cli
 * @purpose CLI that previews (`--dry-run`) or writes (`--write`) approved overrides into the committed corpus, with a reconcile report.
 * @conventions Refuses to run unless exactly one of `--dry-run` and `--write` is given, and when `CI` is set; `--dry-run` prints the diff and writes nothing; the reconcile report lists overrides identical to the committed text (prune them) and overrides whose key is absent from the corpus (flagged, never written); `reviewedBy` and usernames are stripped. `--corpus-dir` defaults to `src/interpretation/corpus`. Not an npm script on purpose.
 * @exports runCli (the CLI runs itself only when invoked directly).
 */
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { applyBake, renderDiff } from './lib/bake-overrides.mjs';

const USAGE = [
  'Usage: node tools/corpus-gen/bake-overrides.mjs --input <overrides.json> (--dry-run | --write) [--corpus-dir <dir>]',
  '',
  '  --dry-run   print the diff and the reconcile report; write nothing',
  '  --write     write the changes into en.json and nl.json (needs the owner go-ahead)',
  '',
  'Human-run only. Never from CI, a build or a hook.',
].join('\n');

function option(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

/**
 * @returns {Promise<number>} the exit code; output goes through `io.out` / `io.err`.
 */
export async function runCli(args, env, io) {
  if (args.includes('--help') || args.includes('-h')) {
    io.out(USAGE);
    return 0;
  }
  if (env.CI !== undefined && env.CI !== '') {
    io.err('Refusing to run: this tool must never run in CI or an unattended build.');
    return 1;
  }
  const write = args.includes('--write');
  const dryRun = args.includes('--dry-run');
  if (write === dryRun) {
    io.err(`Refusing to run: pass exactly one of --dry-run and --write.\n\n${USAGE}`);
    return 1;
  }
  const input = option(args, '--input');
  if (input === undefined) {
    io.err(`Refusing to run: --input <overrides.json> is required.\n\n${USAGE}`);
    return 1;
  }
  const here = dirname(fileURLToPath(import.meta.url));
  const corpusDir = resolve(option(args, '--corpus-dir') ?? join(here, '..', '..', 'src', 'interpretation', 'corpus'));
  const overrides = JSON.parse(await readFile(resolve(input), 'utf8'));
  if (!Array.isArray(overrides)) {
    io.err('Refusing to run: the input must be a JSON array of overrides.');
    return 1;
  }

  const plan = await applyBake({ corpusDir, overrides, write });

  const diff = renderDiff(plan);
  if (diff !== '') io.out(diff);
  io.out(
    write
      ? `Wrote ${String(plan.updates.length)} entries.`
      : `Dry run: ${String(plan.updates.length)} entries would change; nothing written.`,
  );
  io.out(`Reconcile: ${String(plan.identical.length)} identical to the committed text (prune these overrides):`);
  for (const item of plan.identical) io.out(`  = ${item.locale} ${item.key}`);
  io.out(
    `Reconcile: ${String(plan.orphans.length)} with a key absent from the committed corpus (flagged, not written):`,
  );
  for (const item of plan.orphans) io.out(`  ? ${item.locale} ${item.key}`);
  if (plan.invalid.length > 0) {
    io.out(`Reconcile: ${String(plan.invalid.length)} malformed overrides skipped:`);
    for (const item of plan.invalid) io.out(`  ! ${item.locale} ${item.key}`);
  }
  return 0;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli(process.argv.slice(2), process.env, {
    out: (line) => {
      console.log(line);
    },
    err: (line) => {
      console.error(line);
    },
  }).then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      console.error(error);
      process.exitCode = 1;
    },
  );
}
