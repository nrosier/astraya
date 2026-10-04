/**
 * Builds the Docker image locally and starts it, exactly as the release workflow's smoke test does
 * (.github/workflows/docker.yml): run the image, wait for the app's own /healthz, and check the served
 * index carries its Content-Security-Policy header. Run it before tagging a release — `npm run
 * docker:smoke` — because the image is the one thing `npm run check` and the e2e suite never start:
 * they run the server from the working tree, where every `src/` file exists, while the image copies
 * only a named list of them.
 *
 *   npm run docker:smoke            build and test
 *   npm run docker:smoke -- --no-build   test the image already built as astraya:smoke
 *
 * Exit status is 0 only when the image built, started, answered /healthz and set its CSP header.
 */
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:net';

const IMAGE = 'astraya:smoke';
const NAME = `astraya-smoke-${String(process.pid)}`;
const NO_BUILD = process.argv.includes('--no-build');
const ATTEMPTS = 30;
const DELAY_MS = 2000;

function docker(args, options = {}) {
  return spawnSync('docker', args, { stdio: options.quiet ? 'pipe' : 'inherit', encoding: 'utf8' });
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function cleanup() {
  docker(['rm', '-f', NAME], { quiet: true });
}

async function main() {
  if (docker(['info'], { quiet: true }).status !== 0) {
    console.error('Docker is not running (or not installed): start it and rerun.');
    return 2;
  }

  if (!NO_BUILD) {
    console.log(`Building ${IMAGE} …`);
    // GITHUB_SHA is a build argument the About page reads; a local build has no commit to name.
    const build = docker(['build', '--build-arg', 'GITHUB_SHA=local-smoke', '-t', IMAGE, '.']);
    if (build.status !== 0) {
      console.error('The image did not build.');
      return 1;
    }
  }

  const port = await freePort();
  const run = docker(['run', '-d', '--name', NAME, '-p', `127.0.0.1:${String(port)}:8080`, IMAGE], { quiet: true });
  if (run.status !== 0) {
    console.error(`The container did not start:\n${run.stderr}`);
    return 1;
  }

  const base = `http://127.0.0.1:${String(port)}`;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    // A crashed container will never answer: stop waiting as soon as it has exited.
    const state = docker(['inspect', '-f', '{{.State.Running}}', NAME], { quiet: true }).stdout.trim();
    if (state === 'false') break;
    try {
      const health = await fetch(`${base}/healthz`);
      if (health.ok) {
        const index = await fetch(`${base}/`, { method: 'HEAD' });
        if (!index.headers.get('content-security-policy')) {
          console.error('The served index has no Content-Security-Policy header.');
          return 1;
        }
        console.log(`${IMAGE} serves /healthz and sets its security headers (after ${String(attempt)} check(s)).`);
        return 0;
      }
    } catch {
      // Not listening yet.
    }
    await sleep(DELAY_MS);
  }

  console.error('The image never became healthy. Its logs:\n');
  docker(['logs', NAME]);
  return 1;
}

process.on('SIGINT', () => {
  cleanup();
  process.exit(130);
});

let status;
try {
  status = await main();
} finally {
  cleanup();
}
process.exit(status);
