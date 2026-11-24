/**
 * #1603: every fixed-star registry entry's Peters–Knobel number is accounted for in the Peters 1915 check table in
 * `docs/domain/FIXED_STAR_REGISTRY.md`, either verified with a page or marked not legible. A star added to the registry
 * without a row fails here, so the check cannot silently fall behind the registry.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { YEMEN_FIXED_STARS } from '../src/astrology/fixed-star-registry.js';

const doc = readFileSync(new URL('../docs/domain/FIXED_STAR_REGISTRY.md', import.meta.url), 'utf8');
const section = doc.slice(doc.indexOf('## Peters 1915 check (#1603)'));

/** The table rows of the check, keyed by registry id. */
function rows(): Map<string, { readonly peters: string; readonly page: string; readonly result: string }> {
  const out = new Map<string, { readonly peters: string; readonly page: string; readonly result: string }>();
  for (const line of section.split('\n')) {
    const cells = line.split('|').map((cell) => cell.trim());
    // | id | peters | modern | page | result |
    if (cells.length < 7 || cells[1] === 'Registry id' || (cells[1] ?? '').startsWith('---')) continue;
    out.set(cells[1] ?? '', { peters: cells[2] ?? '', page: cells[4] ?? '', result: cells[5] ?? '' });
  }
  return out;
}

describe('Peters 1915 check of the fixed-star registry (#1603)', () => {
  it('has a row for every registry entry, with the same Peters–Knobel number', () => {
    const table = rows();
    expect(table.size).toBe(YEMEN_FIXED_STARS.length);
    for (const star of YEMEN_FIXED_STARS) {
      expect(table.get(star.id)?.peters, `registry id ${star.id}`).toBe(star.peters_knobel);
    }
  });

  it('gives every verified row a Peters page, and marks every other row as not legible', () => {
    for (const [id, row] of rows()) {
      if (row.result.startsWith('Verified')) expect(row.page, `registry id ${id}`).toMatch(/p\. \d+/);
      else expect(row.result, `registry id ${id}`).toMatch(/^Not legible/);
    }
  });
});
