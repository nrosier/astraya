// @vitest-environment jsdom
/**
 * The Button capsule shape (#1600): only small inline actions (matrix All/Clear/None, the transit
 * filter All/Clear, the seven-star preset) are capsules; menu and popover triggers keep the small radius.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { Button } from '../src/ui/primitives/Button.js';

let root: Root | undefined;
let container: HTMLElement | undefined;

afterEach(() => {
  if (root !== undefined) {
    const mounted = root;
    act(() => {
      mounted.unmount();
    });
  }
  container?.remove();
  root = undefined;
  container = undefined;
});

function mount(element: React.JSX.Element): HTMLElement {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const mounted = root;
  act(() => {
    mounted.render(element);
  });
  return container;
}

describe('Button shape', () => {
  it('adds the capsule class for shape="capsule" and keeps the size class', () => {
    const button = mount(
      <Button shape="capsule" size="compact">
        All
      </Button>,
    ).querySelector('button');
    expect(button?.classList.contains('primitive-button-capsule')).toBe(true);
    expect(button?.classList.contains('primitive-button-compact')).toBe(true);
  });

  it('adds no capsule class by default', () => {
    const button = mount(<Button>Export</Button>).querySelector('button');
    expect(button?.classList.contains('primitive-button-capsule')).toBe(false);
  });
});

describe('.primitive-button-capsule', () => {
  it('uses the full radius token and nothing else', () => {
    const css = readFileSync('src/ui/app.css', 'utf-8');
    const rule = /\.primitive-button-capsule,\s*button\.primitive-button-capsule\s*\{([^}]*)\}/.exec(css);
    expect(rule?.[1]?.trim()).toBe('border-radius: var(--radius-full);');
  });
});

describe('capsule call sites', () => {
  const files = readdirSync('src/ui')
    .filter((name) => name.endsWith('.tsx'))
    .map((name) => ({ name, source: readFileSync(`src/ui/${name}`, 'utf-8') }));

  it('is passed only in the matrix, transit filter and fixed-star picker', () => {
    const using = files.filter((f) => f.source.includes('shape="capsule"')).map((f) => f.name);
    expect(using.sort()).toEqual(['ExtendedSettingsPanel.tsx', 'FixedStarPicker.tsx', 'TransitFilterPanel.tsx']);
  });

  it('never gives an Export, Defaults or Techniques button the capsule shape', () => {
    for (const f of files) {
      const blocks = f.source.match(/<Button\b[^>]*shape="capsule"[\s\S]*?<\/Button>/g) ?? [];
      for (const block of blocks) expect(block).not.toMatch(/export|defaults|techniques/i);
    }
  });
});
