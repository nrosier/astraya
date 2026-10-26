/**
 * #826 S3a: the EmptyState primitive's markup, its reuse of the `.empty` class, and token-only styling.
 */
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EmptyState } from '../src/ui/primitives/EmptyState.tsx';

const css = readFileSync(new URL('../src/ui/app.css', import.meta.url), 'utf8');

describe('EmptyState (#826)', () => {
  it('renders the message inside the shared .empty box', () => {
    expect(renderToStaticMarkup(<EmptyState message="No people yet" />)).toBe(
      '<div class="empty primitive-empty-state"><p class="primitive-empty-state-message">No people yet</p></div>',
    );
  });

  it('renders children after the message', () => {
    const html = renderToStaticMarkup(
      <EmptyState message="No matches">
        <button type="button">Clear filters</button>
      </EmptyState>,
    );
    expect(html).toBe(
      '<div class="empty primitive-empty-state"><p class="primitive-empty-state-message">No matches</p><button type="button">Clear filters</button></div>',
    );
  });

  it('adds styling from existing tokens only, with no colour literal', () => {
    const blocks = [...css.matchAll(/\.primitive-empty-state[^{]*\{([^}]*)\}/g)].map((m) => m[1] ?? '');
    expect(blocks.length).toBeGreaterThan(0);
    for (const body of blocks) {
      expect(body).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
      for (const [, token] of body.matchAll(/var\((--[a-z0-9-]+)\)/g)) {
        expect(css, String(token)).toMatch(new RegExp(`^\\s*${String(token)}:`, 'm'));
      }
    }
  });
});
