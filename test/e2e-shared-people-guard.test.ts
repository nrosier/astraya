/**
 * Guard for #799: an e2e test that changes a person must not depend on the shared seeded people.
 *
 * Reads every `e2e/*.spec.ts` as text (no browser, no network). The part of a spec that opens a
 * context through `newSeededContext` is its seeded part; a person-changing step there is a
 * violation, unless the spec is listed in `COPY_ONLY` with the reason it only edits its own
 * context's copy of the saved state. Page reloads are not person changes (many read-only specs
 * reload to check a device setting), so they are not flagged.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const E2E_DIR = join(import.meta.dirname, '..', 'e2e');

/** Steps that create, change or delete a person through the UI. */
const PERSON_MUTATIONS: readonly RegExp[] = [
  /\bcreatePerson\(/,
  /Replace birth data/,
  /Apply restore/,
  /Delete permanently/,
  /name: 'Save', exact: true\s*\}\)\s*\.click\(/,
];

/** Specs whose seeded part edits only its own context's copy, never the saved state file. */
const COPY_ONLY: Readonly<Record<string, string>> = {
  'extended-settings.spec.ts': 'one test adds a person after changing the device default, inside its own context',
  'person-file.spec.ts':
    'one test replaces a birth record inside its own context (the saved state is copied per context)',
};

/** The text of a spec that runs against the seeded people, or an empty string if it has none. */
function seededPart(source: string): string {
  if (!source.includes('newSeededContext(')) return '';
  const describeStart = source.search(/^test\.describe\([^\n]*shared people/m);
  if (describeStart >= 0) return source.slice(describeStart);
  if (
    /^test\.(beforeEach|beforeAll)\(/m.test(source) &&
    /^test\.(beforeEach|beforeAll)\([^]*?newSeededContext\(/m.test(source)
  ) {
    return source;
  }
  return source
    .split(/^(?=test(?:\.\w+)?\()/m)
    .filter((chunk) => chunk.includes('newSeededContext('))
    .join('\n');
}

describe('e2e specs that use the shared people (#799)', () => {
  const specs = readdirSync(E2E_DIR).filter((name) => name.endsWith('.spec.ts'));

  it('finds the e2e specs', () => {
    expect(specs.length).toBeGreaterThan(30);
  });

  it('uses newSeededContext in a good share of them', () => {
    const seeded = specs.filter((name) => readFileSync(join(E2E_DIR, name), 'utf-8').includes('newSeededContext('));
    expect(seeded.length).toBeGreaterThan(20);
  });

  it('has no seeded test that changes a person', () => {
    const violations: string[] = [];
    for (const name of specs) {
      if (name in COPY_ONLY) continue;
      const part = seededPart(readFileSync(join(E2E_DIR, name), 'utf-8'));
      for (const pattern of PERSON_MUTATIONS) {
        if (pattern.test(part)) violations.push(`${name}: ${pattern.source}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('lists only specs that exist and still use the shared people', () => {
    for (const name of Object.keys(COPY_ONLY)) {
      expect(specs).toContain(name);
      expect(seededPart(readFileSync(join(E2E_DIR, name), 'utf-8'))).not.toBe('');
    }
  });
});
