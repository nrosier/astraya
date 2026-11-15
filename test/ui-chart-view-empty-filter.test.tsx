// @vitest-environment jsdom
/**
 * The empty-filter rule (#1333): when the chart type, aspects and preset leave no contacts, the Aspects and Matrix
 * tabs show a short note in place of the table; when contacts remain they show the table and no note.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { ASPECTS, type Aspect, type AspectTone } from '../src/astrology/aspects.js';
import { bodyByKey } from '../src/astrology/bodies.js';
import type { ChartData } from '../src/domain/chart-compute.js';
import type { BodyId, BodyPosition, HousePositions } from '../src/ephemeris/types.js';
import { chartViewMessages } from '../src/ui/ChartView.messages.js';
import { renderMatrixView } from '../src/ui/ChartView.js';
import { renderAspectsTable, type AspectContactFilter } from '../src/ui/ChartViewAspects.js';
import type { AspectFamilyKey } from '../src/ui/aspect-family-filter.js';

const t = chartViewMessages.en;
const nl = chartViewMessages.nl;

function idOf(key: string): BodyId {
  const body = bodyByKey(key);
  if (body === undefined) throw new Error(`test fixture bug: no body keyed "${key}"`);
  return body.id;
}

function position(body: BodyId, longitude: number): BodyPosition {
  return {
    body,
    longitude,
    latitude: 0,
    distance: 1,
    longitudeSpeed: 1,
    latitudeSpeed: 0,
    distanceSpeed: 0,
    retrograde: false,
  };
}

const HOUSES: HousePositions = {
  cusps: [0, 10, 40, 70, 100, 130, 160, 190, 220, 250, 280, 310, 340],
  ascendant: 10,
  midheaven: 280,
  armc: 278,
  vertex: 200,
  equatorialAscendant: 12,
  coAscendantKoch: 14,
  coAscendantMunkasey: 16,
  polarAscendant: 18,
  system: 'P',
};

const trine = ASPECTS.find((aspect) => aspect.key === 'trine');
if (trine === undefined) throw new Error('test fixture bug: no trine aspect');

const SUN_MOON_TRINE: Aspect = {
  bodyA: idOf('sun'),
  bodyB: idOf('moon'),
  aspect: trine,
  separation: 121,
  orb: 1,
  allowedOrb: 8,
  applying: true,
};

const DATA: ChartData = {
  positions: [position(idOf('sun'), 10), position(idOf('moon'), 131)],
  houses: HOUSES,
  aspects: [SUN_MOON_TRINE],
  dignities: new Map(),
  sect: 'day',
  partOfFortune: 0,
  partOfSpirit: 0,
};

/** Only hard minor aspects: the trine is filtered out, so nothing is left. */
const EMPTY_FILTER: AspectContactFilter = { families: new Set<AspectFamilyKey>(['hardMinor']) };
/** The major family keeps the trine. */
const KEEP_FILTER: AspectContactFilter = { families: new Set<AspectFamilyKey>(['major']) };

let root: Root | undefined;

function mount(node: React.ReactNode): HTMLElement {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(node);
  });
  return container;
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = undefined;
  document.body.innerHTML = '';
});

describe('the empty-filter note (#1333)', () => {
  it('has the note in both locales', () => {
    expect(t.emptyFilterNote.length).toBeGreaterThan(0);
    expect(nl.emptyFilterNote.length).toBeGreaterThan(0);
    expect(nl.emptyFilterNote).not.toBe(t.emptyFilterNote);
  });

  it('shows the note and no aspects table when the filter leaves no contacts', () => {
    const view = mount(renderAspectsTable(DATA, 'Test', {}, t, 'en', undefined, undefined, EMPTY_FILTER));
    expect(view.textContent).toContain(t.emptyFilterNote);
    expect(view.querySelector('table')).toBeNull();
  });

  it('shows the table and no note when the filter leaves contacts', () => {
    const view = mount(renderAspectsTable(DATA, 'Test', {}, t, 'en', undefined, undefined, KEEP_FILTER));
    expect(view.textContent).not.toContain(t.emptyFilterNote);
    expect(view.querySelector('table')).not.toBeNull();
  });

  it('shows the table and no note with no filter at all', () => {
    const view = mount(renderAspectsTable(DATA, 'Test', {}, t, 'en'));
    expect(view.textContent).not.toContain(t.emptyFilterNote);
    expect(view.querySelector('table')).not.toBeNull();
  });

  it('shows the note and no matrix grid when the filter leaves no contacts', () => {
    const view = mount(
      renderMatrixView(DATA, 'Test', {}, t, 'en', undefined, undefined, EMPTY_FILTER.families, undefined, false),
    );
    expect(view.textContent).toContain(t.emptyFilterNote);
    expect(view.querySelector('[role="table"]')).toBeNull();
  });

  it('shows the matrix grid and no note when the filter leaves contacts', () => {
    const view = mount(
      renderMatrixView(DATA, 'Test', {}, t, 'en', undefined, undefined, KEEP_FILTER.families, undefined, false),
    );
    expect(view.textContent).not.toContain(t.emptyFilterNote);
    expect(view.querySelector('[role="table"]')).not.toBeNull();
  });

  it('follows the instrument bar tones like the Aspects table: the soft trine goes when only Hard and Minor are on (#1532)', () => {
    const matrix = (tones: ReadonlySet<AspectTone>) =>
      mount(renderMatrixView(DATA, 'Test', {}, t, 'en', undefined, undefined, new Set(), undefined, false, tones));
    const off = matrix(new Set<AspectTone>(['hard', 'minor']));
    expect(off.textContent).toContain(t.emptyFilterNote);
    expect(off.querySelector('.mgrid-aspect')).toBeNull();
    act(() => {
      root?.unmount();
    });
    document.body.innerHTML = '';
    const on = matrix(new Set<AspectTone>(['soft']));
    expect(on.textContent).not.toContain(t.emptyFilterNote);
    expect(on.querySelector('.mgrid-aspect')).not.toBeNull();
    act(() => {
      root?.unmount();
    });
    document.body.innerHTML = '';
    const all = matrix(new Set<AspectTone>(['hard', 'soft', 'minor']));
    expect(all.querySelector('.mgrid-aspect')).not.toBeNull();
  });

  it('puts the given bar under the grid, and keeps it when the pills leave no cells (#1532)', () => {
    const bar = <div data-testid="bar" />;
    const withGrid = mount(
      renderMatrixView(
        DATA,
        'Test',
        {},
        t,
        'en',
        undefined,
        bar,
        new Set(),
        undefined,
        false,
        new Set<AspectTone>(['soft']),
      ),
    );
    const grid = withGrid.querySelector('[role="table"]');
    const barEl = withGrid.querySelector('[data-testid="bar"]');
    expect(grid).not.toBeNull();
    expect(barEl).not.toBeNull();
    expect(grid?.compareDocumentPosition(barEl as Node) ?? 0).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    act(() => {
      root?.unmount();
    });
    document.body.innerHTML = '';
    const empty = mount(
      renderMatrixView(
        DATA,
        'Test',
        {},
        t,
        'en',
        undefined,
        bar,
        new Set(),
        undefined,
        false,
        new Set<AspectTone>(['hard']),
      ),
    );
    expect(empty.textContent).toContain(t.emptyFilterNote);
    expect(empty.querySelector('[data-testid="bar"]')).not.toBeNull();
  });
});
