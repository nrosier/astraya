// @vitest-environment jsdom
/**
 * The aspect-family control (#1545): it is a pill with the same label and options the select had,
 * and choosing an option reports the same family set the select reported.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { AspectFamilyControls } from '../src/ui/AspectFamilyControls.js';
import { aspectFamilyControlsMessages } from '../src/ui/AspectFamilyControls.messages.js';
import { FILTERABLE_FAMILIES, type AspectFamilyKey } from '../src/ui/aspect-family-filter.js';

const t = aspectFamilyControlsMessages.en;
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

function mount(
  families: ReadonlySet<AspectFamilyKey>,
  onChange: (next: ReadonlySet<AspectFamilyKey>) => void,
): HTMLElement {
  const element = document.createElement('div');
  document.body.append(element);
  host = element;
  const mounted = createRoot(element);
  root = mounted;
  act(() => {
    mounted.render(<AspectFamilyControls families={families} onChange={onChange} />);
  });
  return element;
}

function pill(element: HTMLElement): HTMLButtonElement {
  const found = element.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]');
  if (found === null) throw new Error('no pill');
  return found;
}

function options(element: HTMLElement): HTMLButtonElement[] {
  return Array.from(element.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
}

describe('AspectFamilyControls family pill (#1545)', () => {
  it('is labelled and lists All aspects then every filterable family, in order', () => {
    const element = mount(new Set(), () => undefined);
    expect(element.querySelector('.primitive-pill-select-label')?.textContent).toBe(t.familyLabel);
    expect(element.querySelector('select')).toBeNull();
    act(() => {
      pill(element).click();
    });
    expect(options(element).map((option) => option.textContent)).toEqual([
      t.allAspects,
      ...FILTERABLE_FAMILIES.map((family) => t.families[family.key as keyof typeof t.families]),
    ]);
    expect(options(element)[0]?.getAttribute('aria-checked')).toBe('true');
  });

  it('pins the en option labels as literal strings, so a removed or relabelled family fails', () => {
    const element = mount(new Set(), () => undefined);
    act(() => {
      pill(element).click();
    });
    expect(options(element).map((option) => option.textContent)).toEqual([
      'All aspects',
      'Major: conjunction, sextile, square, trine, opposition',
      'Hard minor: semisquare, sesquiquadrate, quincunx, semisextile',
      'Soft minor: quintile, biquintile',
      'Higher harmonic: decile, novile, septile',
      'Nodal and angular: contacts to the nodes, angles, Vertex and Fortune',
    ]);
  });

  it('reports the same family set the select reported', () => {
    const calls: ReadonlySet<AspectFamilyKey>[] = [];
    const element = mount(new Set(), (next) => calls.push(next));
    const first = FILTERABLE_FAMILIES[0];
    if (first === undefined) throw new Error('no families');
    act(() => {
      pill(element).click();
    });
    act(() => {
      options(element)[1]?.click();
    });
    expect(calls).toEqual([new Set([first.key])]);
  });

  it('clears the filter when All aspects is chosen', () => {
    const first = FILTERABLE_FAMILIES[0];
    if (first === undefined) throw new Error('no families');
    const calls: ReadonlySet<AspectFamilyKey>[] = [];
    const element = mount(new Set([first.key]), (next) => calls.push(next));
    act(() => {
      pill(element).click();
    });
    act(() => {
      options(element)[0]?.click();
    });
    expect(calls).toEqual([new Set()]);
  });

  it('shows the disabled Chosen families option for a set of several families', () => {
    const [a, b] = FILTERABLE_FAMILIES;
    if (a === undefined || b === undefined) throw new Error('need two families');
    const element = mount(new Set([a.key, b.key]), () => undefined);
    expect(pill(element).textContent).toContain(t.customFamilies);
    act(() => {
      pill(element).click();
    });
    expect(options(element).at(-1)?.disabled).toBe(true);
  });
});
