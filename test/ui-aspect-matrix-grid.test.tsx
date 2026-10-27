// @vitest-environment jsdom
/**
 * The on-screen aspect matrix grid (#820): its row and column labels, diagonal identifiers in position, the cell
 * selection, no exact-aspect double border (D-820) and no total row, and a tokens-only guard on its CSS block.
 */
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AspectMatrixInput } from '../src/chart/aspect-matrix.js';
import { AspectMatrixGrid } from '../src/ui/AspectMatrixGrid.js';

const input: AspectMatrixInput = {
  bodies: [
    { key: 'sun', label: 'Su', name: 'Sun', longitude: 280.37, house: 4 },
    { key: 'moon', label: 'Mo', name: 'Moon', longitude: 193.32, house: 1, retrograde: true },
    { key: 'saturn', label: 'Sa', name: 'Saturn', longitude: 32.05, house: 8 },
    { key: 'asc', label: 'AC', name: 'Ascendant', longitude: 180.55 },
  ],
  aspects: [
    { aKey: 'moon', bKey: 'sun', aspectKey: 'square', orb: 0.2, signedOrb: -0.2, applying: false },
    { aKey: 'saturn', bKey: 'sun', aspectKey: 'trine', orb: 0.5, signedOrb: 0.5, applying: true },
    { aKey: 'asc', bKey: 'moon', aspectKey: 'quintile', orb: 2, signedOrb: 2, applying: true },
  ],
};

const labels = {
  symbol: 'Symbol',
  name: 'Name',
  degree: 'Deg',
  sign: 'Sign',
  minute: 'Min',
  house: 'House',
  retrograde: 'Retrograde',
};

let root: Root | undefined;
let host: HTMLElement | undefined;

afterEach(() => {
  const mounted = root;
  if (mounted !== undefined) {
    act(() => {
      mounted.unmount();
    });
  }
  host?.remove();
  root = undefined;
  host = undefined;
});

function mount(onToggle: (key: string) => void = () => undefined, selectedKey?: string): HTMLElement {
  const el = document.createElement('div');
  document.body.append(el);
  host = el;
  root = createRoot(el);
  const mounted = root;
  act(() => {
    mounted.render(
      <AspectMatrixGrid
        input={input}
        label="Aspect matrix"
        labels={labels}
        locale="en"
        describe={(a, b, aspect) => `${a} ${aspect} ${b}`}
        selection={{ selectedKey, onToggle, canSelect: (a, b) => a !== 'asc' && b !== 'asc' }}
      />,
    );
  });
  return el;
}

describe('AspectMatrixGrid (#820)', () => {
  it('has the Icon, Name, Degree, Sign, Minute and House columns, then one column per body', () => {
    const el = mount();
    const headers = [...el.querySelectorAll('[role="columnheader"]')].map((th) => th.textContent);
    expect(headers.slice(0, 6)).toEqual(['Symbol', 'Name', 'Deg', 'Sign', 'Min', 'House']);
    expect(headers).toHaveLength(6 + 4);
    expect(el.querySelectorAll('[role="rowgroup"]:last-child > [role="row"]')).toHaveLength(4);
    // Sun 280.37 = 10 Capricorn 22'; its row reads degree and minute in their columns.
    const sunRow = el.querySelectorAll('[role="rowgroup"]:last-child > [role="row"]')[0];
    expect(sunRow?.querySelectorAll('[role="cell"]')[1]?.textContent).toBe('10°');
    expect(sunRow?.querySelectorAll('[role="cell"]')[3]?.textContent).toBe("22'");
    expect(sunRow?.querySelectorAll('[role="cell"]')[4]?.textContent).toBe('4');
    expect(el.querySelectorAll('.mgrid-col-name').length).toBe(5);
    expect(el.querySelectorAll('.mgrid-col-house').length).toBe(5);
  });

  it('puts each body identifier on the diagonal and nothing above it', () => {
    const el = mount();
    el.querySelectorAll('[role="rowgroup"]:last-child > [role="row"]').forEach((row, index) => {
      const cells = [...row.querySelectorAll('[role="cell"]')].slice(5);
      expect(cells).toHaveLength(4);
      cells.forEach((cell, column) => {
        if (column === index) expect(cell.classList.contains('mgrid-diag')).toBe(true);
        else expect(cell.classList.contains('mgrid-diag')).toBe(false);
        if (column > index) expect(cell.classList.contains('mgrid-empty')).toBe(true);
      });
    });
    // The angle is text (no glyph): it names itself on the diagonal.
    expect(el.querySelectorAll('.mgrid-diag')[3]?.textContent).toBe('AC');
  });

  it('colours aspects by family and shows signed orb plus a or s', () => {
    const el = mount();
    const square = el.querySelector('[aria-label="moon square sun"]');
    expect(square?.closest('[role="cell"]')?.classList.contains('mgrid-hard')).toBe(true);
    expect(square?.textContent).toBe('-0s');
    const trine = el.querySelector('[aria-label="saturn trine sun"]');
    expect(trine?.closest('[role="cell"]')?.classList.contains('mgrid-soft')).toBe(true);
    expect(trine?.textContent).toBe('1a');
    expect(
      el.querySelector('[aria-label="asc quintile moon"]')?.closest('[role="cell"]')?.classList.contains('mgrid-minor'),
    ).toBe(true);
  });

  it('selects a pair on click and marks the selected one; unselectable pairs are not buttons', () => {
    const onToggle = vi.fn();
    const el = mount(onToggle, 'aspect:moon@0|sun@0');
    const button = el.querySelector('button[aria-label="moon square sun"]');
    expect(button?.getAttribute('aria-pressed')).toBe('true');
    act(() => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onToggle).toHaveBeenCalledWith('aspect:moon@0|sun@0');
    expect(el.querySelector('button[aria-label="asc quintile moon"]')).toBeNull();
    expect(el.querySelector('[role="img"][aria-label="asc quintile moon"]')).not.toBeNull();
  });

  it('draws no exact-aspect double border and no total row (D-820)', () => {
    const el = mount();
    expect(el.innerHTML).not.toMatch(/tight|exact|double/i);
    expect(el.querySelectorAll('[role="rowgroup"]')).toHaveLength(2);
    expect(el.textContent).not.toMatch(/total/i);
  });

  it('keeps its CSS to standard tokens: no colour literals, shadows, monospace family or tight border', () => {
    const css = readFileSync('src/ui/app.css', 'utf8');
    const start = css.indexOf('/* The on-screen aspect matrix (#820)');
    expect(start).toBeGreaterThan(-1);
    const block = css.slice(start).replace(/\/\*[\s\S]*?\*\//g, '');
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(block).not.toMatch(/\brgba?\(|\bhsla?\(/);
    expect(block).not.toMatch(/box-shadow:(?!\s*none)/);
    expect(block).not.toMatch(/monospace/i);
    expect(block).not.toMatch(/double|tight/);
    expect(block).toMatch(/var\(--line\)/);
    expect(block).toMatch(/var\(--aspect-soft\)/);
    expect(block).toMatch(/var\(--aspect-hard\)/);
    expect(block).toMatch(/var\(--aspect-minor\)/);
    expect(block).toMatch(/font-variant-numeric:\s*tabular-nums/);
  });
});
