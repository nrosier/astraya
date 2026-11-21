// @vitest-environment jsdom
/**
 * The sidebar rail icons (#1747): each export renders a decorative 24-unit SVG, and the module
 * exports exactly the fourteen icons the rail uses.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import * as navIcons from '../src/ui/nav-icons.js';

const ICON_NAMES = [
  'IdCard',
  'LayoutDashboard',
  'MessageSquareText',
  'Compass',
  'BookOpen',
  'Globe',
  'CalendarClock',
  'TrendingUp',
  'GitMerge',
  'Wrench',
  'FileDown',
  'PanelLeft',
  'PanelLeftClose',
  'PanelLeftOpen',
] as const;

let root: Root | undefined;
let container: HTMLElement | undefined;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

function render(name: (typeof ICON_NAMES)[number]): SVGSVGElement {
  const Icon = navIcons[name];
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(<Icon />);
  });
  const svg = container.querySelector('svg');
  if (!svg) throw new Error(`${name} rendered no svg`);
  return svg;
}

describe('sidebar rail icons', () => {
  it('exports exactly the fourteen rail icons', () => {
    expect(Object.keys(navIcons).sort()).toEqual([...ICON_NAMES].sort());
  });

  it.each(ICON_NAMES)('%s renders a decorative 24-unit svg', (name) => {
    const svg = render(name);
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
  });
});
