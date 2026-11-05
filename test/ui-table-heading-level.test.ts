/**
 * Heading order for the SortableTable captions under a page h1 (#1163). SortableTable's caption defaults to an h3, which
 * skips the level when the table sits directly under the page's h1 with no h2 section between. Each table in the views
 * below must therefore pass `headingLevel={2}`. A source scan keeps the check cheap and independent of rendering.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const VIEWS = [
  'TransitView',
  'ProgressionsView',
  'SolarArcView',
  'PrimaryDirectionsView',
  'SynastryView',
  'ReturnView',
] as const;

/** Each self-closing `<SortableTable ... />` element. Props may contain arrow functions (`=>`), so the match ends at `/>`. */
function sortableTableTags(source: string): string[] {
  return [...source.matchAll(/<SortableTable\b[\s\S]*?\/>/g)].map((match) => match[0]);
}

describe('SortableTable captions under the page h1 (#1163)', () => {
  for (const view of VIEWS) {
    it(`${view} gives every SortableTable headingLevel={2}`, () => {
      const source = readFileSync(new URL(`../src/ui/${view}.tsx`, import.meta.url), 'utf8');
      const tags = sortableTableTags(source);
      expect(tags.length).toBeGreaterThan(0);
      for (const tag of tags) {
        expect(tag).toContain('headingLevel={2}');
      }
    });
  }
});
