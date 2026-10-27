/**
 * #826 S4: StagedDialog `placement`. Default renders as before; 'right' sets data-placement and its CSS
 * block uses only existing tokens (no colour literals).
 */
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StagedDialog } from '../src/ui/primitives/StagedDialog.tsx';

const props = {
  open: false,
  heading: 'Filters',
  closeLabel: 'Close',
  onDiscard: () => undefined,
  returnFocusTo: { current: null },
  footer: null,
} as const;

describe('StagedDialog placement (#826)', () => {
  it('renders unchanged markup by default and for explicit center', () => {
    const base = renderToStaticMarkup(<StagedDialog {...props}>x</StagedDialog>);
    expect(base).not.toContain('data-placement');
    expect(
      renderToStaticMarkup(
        <StagedDialog {...props} placement="center">
          x
        </StagedDialog>,
      ),
    ).toBe(base);
  });

  it("sets data-placement for 'right' and keeps the card class", () => {
    const html = renderToStaticMarkup(
      <StagedDialog {...props} placement="right">
        x
      </StagedDialog>,
    );
    expect(html).toContain('data-placement="right"');
    expect(html).toContain('settings-card primitive-staged-dialog');
  });

  it('styles the drawer with --shadow-popover, a flat border and no colour literal', () => {
    const css = readFileSync(new URL('../src/ui/app.css', import.meta.url), 'utf8');
    const m = /\.primitive-staged-dialog\[data-placement='right'\] \{([^}]*)\}/.exec(css);
    expect(m).not.toBeNull();
    const body = m?.[1] ?? '';
    expect(body).toContain('box-shadow: var(--shadow-popover)');
    expect(body).toContain('border-width: 0 0 0 1px');
    expect(body).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    expect(new Set([...body.matchAll(/var\((--[a-z-]+)\)/g)].map((v) => v[1]))).toEqual(
      new Set(['--shadow-popover', '--drawer-max-width']),
    );
  });
});
