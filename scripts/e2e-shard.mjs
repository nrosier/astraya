// Prints the e2e spec files one CI shard runs: `node scripts/e2e-shard.mjs <shard> <total>`, shard 1-based.
//
// Playwright's own `--shard` hands out files without regard to how long each takes (#1095: four shards took 157, 178,
// 211 and 317 s). Balancing the summed time is not enough either: a shard runs its files on 4 workers, each worker
// takes the next file in alphabetical order, so a long spec that sorts late (viewport-matrix) starts late and sets the
// shard's end. So this models that scheduler, starts from the longest-first split and then swaps files between shards
// while the slowest shard's modelled time falls. Seconds per spec file are in e2e/shard-weights.json (from a green CI
// run); a file with no weight (a new spec) counts as the median, so it still spreads out. Refresh the weights now and
// then from a CI log.
import { readdirSync, readFileSync } from 'node:fs';

const WORKERS = 4;

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

/** When a shard finishes: its files in alphabetical order, each taken by the first free worker. */
function makespan(names) {
  const free = Array.from({ length: WORKERS }, () => 0);
  for (const name of [...names].sort()) {
    const next = free.indexOf(Math.min(...free));
    free[next] += weightOf(name);
  }
  return Math.max(...free);
}

// Longest first onto the shard with the least summed time.
const shards = Array.from({ length: total }, () => []);
const sums = Array.from({ length: total }, () => 0);
for (const name of [...files].sort((a, b) => weightOf(b) - weightOf(a) || a.localeCompare(b))) {
  const lightest = sums.indexOf(Math.min(...sums));
  shards[lightest].push(name);
  sums[lightest] += weightOf(name);
}

// Then move or swap files while the slowest shard's modelled time (and then the sum of squares) falls.
const score = (groups) => {
  const times = groups.map(makespan);
  return [Math.max(...times), times.reduce((sum, time) => sum + time * time, 0)];
};
const better = (a, b) => a[0] < b[0] - 1e-9 || (Math.abs(a[0] - b[0]) < 1e-9 && a[1] < b[1] - 1e-9);
for (let round = 0; round < 500; round += 1) {
  let best = score(shards);
  let change;
  for (let from = 0; from < total; from += 1) {
    for (const name of shards[from]) {
      for (let to = 0; to < total; to += 1) {
        if (to === from) continue;
        const moved = shards.map((group, index) =>
          index === from ? group.filter((item) => item !== name) : index === to ? [...group, name] : group,
        );
        if (moved[from].length > 0 && better(score(moved), best)) {
          best = score(moved);
          change = moved;
        }
        for (const other of shards[to]) {
          const swapped = shards.map((group, index) =>
            index === from
              ? [...group.filter((item) => item !== name), other]
              : index === to
                ? [...group.filter((item) => item !== other), name]
                : group,
          );
          if (better(score(swapped), best)) {
            best = score(swapped);
            change = swapped;
          }
        }
      }
    }
  }
  if (change === undefined) break;
  for (let index = 0; index < total; index += 1) shards[index] = change[index];
}

const mine = shards[shard - 1];
if (mine === undefined || mine.length === 0) {
  console.error(`shard ${String(shard)}/${String(total)} has no spec files`);
  process.exit(1);
}
console.error(
  `shard ${String(shard)}/${String(total)}: ${String(mine.length)} files, about ${String(Math.round(makespan(mine)))} s on ${String(WORKERS)} workers`,
);
console.log(
  [...mine]
    .sort()
    .map((name) => `e2e/${name}`)
    .join(' '),
);
