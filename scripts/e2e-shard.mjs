// Prints the e2e spec files one CI shard runs: `node scripts/e2e-shard.mjs <shard> <total>`, shard 1-based.
//
// Playwright's own `--shard` hands out files without regard to how long each takes, and the four shards of #1095
// took 157, 178, 211 and 317 s. This assigns each spec file to the shard with the least time so far, longest first,
// using the seconds in e2e/shard-weights.json (summed from a green run on 2026-11-06). A file with no weight (a new
// spec) counts as the median, so it still spreads out; refresh the weights now and then from a CI log.
import { readdirSync, readFileSync } from 'node:fs';

const [shardArg, totalArg] = process.argv.slice(2);
const shard = Number(shardArg);
const total = Number(totalArg);
if (!Number.isInteger(shard) || !Number.isInteger(total) || shard < 1 || shard > total) {
  console.error('usage: node scripts/e2e-shard.mjs <shard> <total>   (1 <= shard <= total)');
  process.exit(2);
}

const dir = new URL('../e2e/', import.meta.url);
const files = readdirSync(dir)
  .filter((name) => name.endsWith('.spec.ts'))
  .sort();
const weights = JSON.parse(readFileSync(new URL('shard-weights.json', dir), 'utf8'));
const known = files
  .map((name) => weights[name])
  .filter((value) => typeof value === 'number')
  .sort((a, b) => a - b);
const median = known[Math.floor(known.length / 2)] ?? 1;
const weightOf = (name) => (typeof weights[name] === 'number' ? weights[name] : median);

const shards = Array.from({ length: total }, () => ({ seconds: 0, files: [] }));
for (const name of [...files].sort((a, b) => weightOf(b) - weightOf(a) || a.localeCompare(b))) {
  const lightest = shards.reduce((best, candidate) => (candidate.seconds < best.seconds ? candidate : best));
  lightest.seconds += weightOf(name);
  lightest.files.push(name);
}

const mine = shards[shard - 1];
if (mine === undefined || mine.files.length === 0) {
  console.error(`shard ${String(shard)}/${String(total)} has no spec files`);
  process.exit(1);
}
console.error(
  `shard ${String(shard)}/${String(total)}: ${String(mine.files.length)} files, about ${String(mine.seconds)} s`,
);
console.log(mine.files.map((name) => `e2e/${name}`).join(' '));
