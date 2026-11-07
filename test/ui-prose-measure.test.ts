/**
 * #1176 — text-heavy pages cap their text column at the shared reading measure (75ch) while the shell stays 80rem:
 * the token, the About page's `shell--prose` rule and the Changelog's `.prose` all read it.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/ui/app.css', 'utf-8');

describe('the reading measure of text-heavy pages (#1176)', () => {
  it('defines one measure of 75 characters', () => {
    expect(css).toMatch(/--prose-measure:\s*75ch;/);
  });

  it('applies it to the About text and the Changelog prose, not to the shell', () => {
    expect(css).toMatch(/\.shell--prose > :is\(p, ul, ol, dl\) \{\s*max-width: var\(--prose-measure\);/);
    expect(css).toMatch(/\.prose \{\s*max-width: var\(--prose-measure\);/);
    expect(css).toMatch(/--shell-max-width:\s*80rem;/);
  });

  it('is used by the About page', () => {
    expect(readFileSync('src/ui/About.tsx', 'utf-8')).toContain('className="shell shell--prose"');
  });
});
