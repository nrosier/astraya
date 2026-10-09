#!/usr/bin/env node
/**
 * Runs the given command, passing its stdout/stderr through live exactly as before, then fails
 * the step (even on a 0 exit code) if the combined output contains one of the warning patterns
 * below (#496).
 *
 * This exists because the repo's own "zero-warning" standard (CLAUDE.md) was, until now,
 * aspirational: `npm test` and `npm run build` both completed successfully while printing a
 * Node `ExperimentalWarning` (#492) and a Vite oversized-chunk warning (#494) respectively —
 * neither command's own exit code reflects a warning, only an outright failure. #492 and #494
 * removed today's two known offenders; this script is what stops the *next* one from passing
 * silently the same way.
 *
 *   node scripts/run-without-warnings.mjs <command> [args...]
 *
 * Used by the `test` and `build` npm scripts in package.json.
 */
import { spawn } from 'node:child_process';

// Node's own emitted warnings always look like "(node:12345) FooWarning: ...". Vite's size
// warning doesn't follow that shape, so it gets its own pattern. Add future offenders here
// rather than loosening either regex.
const WARNING_PATTERNS = [/\(node:\d+\)\s+\w*Warning:/, /chunks are larger than \d+\s*k?B after minification/i];

const [command, ...args] = process.argv.slice(2);
if (command === undefined) {
  console.error('Usage: node scripts/run-without-warnings.mjs <command> [args...]');
  process.exit(1);
}

let combinedOutput = '';
const child = spawn(command, args, { stdio: ['inherit', 'pipe', 'pipe'] });

child.stdout.on('data', (chunk) => {
  process.stdout.write(chunk);
  combinedOutput += chunk.toString();
});
child.stderr.on('data', (chunk) => {
  process.stderr.write(chunk);
  combinedOutput += chunk.toString();
});

child.on('error', (error) => {
  console.error(error);
  process.exit(1);
});

child.on('close', (code) => {
  const matched = WARNING_PATTERNS.find((pattern) => pattern.test(combinedOutput));
  if (matched !== undefined) {
    console.error(
      `\n✖ ${command} produced output matching a forbidden warning pattern (${matched.toString()}), ` +
        `even though it exited with code ${String(code)}. This repo's zero-warning standard (CLAUDE.md) ` +
        'treats a warning as a defect, not a nit — fix the warning rather than loosening this check.',
    );
    process.exit(1);
  }
  process.exit(code ?? 1);
});
