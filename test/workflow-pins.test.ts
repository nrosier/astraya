/**
 * Supply-chain guard (#1363, follows #584): every `uses:` in a workflow must
 * pin a third-party action to a full 40-hex commit SHA, so a retargeted
 * upstream tag cannot run code in jobs holding write tokens.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const WORKFLOW_DIR = join(import.meta.dirname, '..', '.github', 'workflows');
const USES_LINE = /^\s*(?:-\s+)?uses:\s*(\S+)/;
const PINNED = /^[^@\s]+@[0-9a-f]{40}$/;

function unpinned(): string[] {
  const bad: string[] = [];
  for (const file of readdirSync(WORKFLOW_DIR).filter((f) => /\.ya?ml$/.test(f))) {
    readFileSync(join(WORKFLOW_DIR, file), 'utf8')
      .split('\n')
      .forEach((line, i) => {
        const ref = USES_LINE.exec(line)?.[1];
        // Local actions (./path) are not remote refs.
        if (ref === undefined || ref.startsWith('./')) return;
        if (!PINNED.test(ref)) bad.push(`${file}:${String(i + 1)} ${ref}`);
      });
  }
  return bad;
}

describe('workflow action pinning (#1363)', () => {
  it('pins every uses: to a 40-character commit SHA', () => {
    expect(unpinned()).toEqual([]);
  });

  it('carries a version comment on every pinned uses:', () => {
    const missing: string[] = [];
    for (const file of readdirSync(WORKFLOW_DIR).filter((f) => /\.ya?ml$/.test(f))) {
      for (const line of readFileSync(join(WORKFLOW_DIR, file), 'utf8').split('\n')) {
        if (USES_LINE.test(line) && !/#\s*v\d/.test(line)) missing.push(`${file}: ${line.trim()}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
