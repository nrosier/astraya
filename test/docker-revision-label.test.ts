/**
 * Every Docker image must carry the OCI revision label `org.opencontainers.image.revision` (#1198), so a
 * plain `docker build` produces it, not only the CI workflow. Each Dockerfile declares `GIT_REVISION` and
 * sets the label in its final (runtime) stage, because a label on an earlier stage does not reach the
 * image. This test reads both files as text and fails if either drops the ARG or the LABEL from the final
 * stage.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');
const DOCKERFILES = ['Dockerfile', 'Dockerfile.alpine'];

/** The lines of the final build stage: everything after the last `FROM` line. */
function finalStage(source: string): string[] {
  const lines = source.split('\n');
  const last = lines.reduce((found, line, index) => (/^FROM\b/.test(line) ? index : found), -1);
  return lines.slice(last);
}

describe.each(DOCKERFILES)('%s revision label', (file) => {
  const stage = finalStage(readFileSync(resolve(ROOT, file), 'utf8'));

  it('declares the GIT_REVISION build argument in the final stage', () => {
    expect(stage).toContain('ARG GIT_REVISION=unknown');
  });

  it('sets the OCI revision label from GIT_REVISION in the final stage', () => {
    expect(stage).toContain('LABEL org.opencontainers.image.revision=$GIT_REVISION');
  });
});
