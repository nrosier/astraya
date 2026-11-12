/**
 * Tests for the pure chart-search draft model (#1405): editing, the condition cap, the round trip with the
 * stored definition, the absent as-of date and the as-of parser.
 */
import { describe, expect, it } from 'vitest';
import { BODIES } from '../src/astrology/bodies.js';
import { MAX_SEARCH_CONDITIONS, SEARCH_SCOPES, type SearchCondition } from '../src/domain/chart-search.js';
import {
  CHART_SEARCH_SCOPES,
  readChartSearchDefinition,
  type ChartSearchDefinition,
} from '../src/store/chart-searches.js';
import {
  addDraftCondition,
  definitionFromDraft,
  draftFromDefinition,
  editDraftCondition,
  newDraft,
  parseAsOf,
  removeDraftCondition,
  setAsOf,
  setOperator,
  type ChartSearchDraft,
} from '../src/ui/chart-search-draft.js';
import { todayInputValue } from '../src/ui/format.js';

const sun = BODIES[0];
const moon = BODIES[1];
if (sun === undefined || moon === undefined) throw new Error('bodies missing');

const signCondition: SearchCondition = { kind: 'sign', body: sun.id, sign: 4 };

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!result.ok) throw new Error(`unexpected error ${JSON.stringify(result.error)}`);
  return result.value;
}

function draftWith(count: number): ChartSearchDraft {
  let draft = newDraft('2026-01-01');
  for (let i = 0; i < count; i += 1) draft = unwrap(addDraftCondition(draft, signCondition));
  return draft;
}

describe('draft editing', () => {
  it('starts as AND, empty, as of today', () => {
    expect(newDraft()).toEqual({ operator: 'and', conditions: [], asOf: todayInputValue() });
  });

  it('sets the operator and the as-of date without mutating', () => {
    const base = newDraft('2026-01-01');
    expect(setOperator(base, 'or').operator).toBe('or');
    expect(setAsOf(base, '2030-05-06').asOf).toBe('2030-05-06');
    expect(base.operator).toBe('and');
  });

  it('adds, edits and removes by index', () => {
    const other: SearchCondition = { kind: 'house', body: moon.id, house: 7, scope: 'transit' };
    let draft = unwrap(addDraftCondition(newDraft('2026-01-01'), signCondition));
    draft = unwrap(addDraftCondition(draft, other));
    draft = unwrap(editDraftCondition(draft, 0, { ...signCondition, sign: 9 }));
    expect(draft.conditions[0]).toEqual({ ...signCondition, sign: 9 });
    draft = unwrap(removeDraftCondition(draft, 0));
    expect(draft.conditions).toEqual([other]);
  });

  it('refuses an index out of range', () => {
    const draft = draftWith(1);
    expect(removeDraftCondition(draft, 1)).toEqual({ ok: false, error: { code: 'index-out-of-range', index: 1 } });
    expect(editDraftCondition(draft, -1, signCondition)).toEqual({
      ok: false,
      error: { code: 'index-out-of-range', index: -1 },
    });
  });

  it('refuses the condition past the domain cap', () => {
    const full = draftWith(MAX_SEARCH_CONDITIONS);
    expect(full.conditions).toHaveLength(MAX_SEARCH_CONDITIONS);
    expect(addDraftCondition(full, signCondition)).toEqual({ ok: false, error: { code: 'too-many-conditions' } });
  });
});

describe('definition conversion', () => {
  it('builds a definition by key with every scope written and no as-of date', () => {
    const draft = unwrap(
      addDraftCondition(unwrap(addDraftCondition(setOperator(newDraft('2026-01-01'), 'or'), signCondition)), {
        kind: 'aspect',
        body: sun.id,
        aspectKey: 'trine',
        target: { kind: 'angle', angle: 'mc' },
        scope: 'progression',
      }),
    );
    const definition = unwrap(definitionFromDraft(draft));
    expect(definition).toEqual({
      version: 2,
      operator: 'or',
      conditions: [
        { kind: 'sign', scope: 'natal', body: sun.key, sign: 4 },
        {
          kind: 'aspect',
          scope: 'progression',
          body: sun.key,
          aspectKey: 'trine',
          target: { kind: 'angle', angle: 'mc' },
        },
      ],
    });
    expect(JSON.stringify(definition)).not.toContain('2026');
    expect(readChartSearchDefinition(definition)).toEqual(definition);
  });

  it('round-trips every scope and kind, with a body and an angle target', () => {
    // One sign per scope (six scopes, #1486), then a house for the first four, so the list stays at the
    // MAX_SEARCH_CONDITIONS cap and every scope still appears. The two aspects below replace the first two slots.
    const conditions: SearchCondition[] = [];
    for (const scope of SEARCH_SCOPES) conditions.push({ kind: 'sign', scope, body: sun.id, sign: 0 });
    for (const scope of SEARCH_SCOPES.slice(0, MAX_SEARCH_CONDITIONS - SEARCH_SCOPES.length)) {
      conditions.push({ kind: 'house', scope, body: moon.id, house: 12 });
    }
    conditions[0] = {
      kind: 'aspect',
      scope: 'transit',
      body: moon.id,
      aspectKey: 'square',
      target: { kind: 'body', body: sun.id },
    };
    conditions[1] = {
      kind: 'aspect',
      scope: 'natal',
      body: moon.id,
      aspectKey: 'square',
      target: { kind: 'angle', angle: 'asc' },
    };
    const draft: ChartSearchDraft = { operator: 'and', conditions, asOf: '2026-01-01' };
    const definition = unwrap(definitionFromDraft(draft));
    const back = unwrap(draftFromDefinition(definition, '2027-02-03'));
    expect(back.asOf).toBe('2027-02-03');
    expect(back.conditions.map((c) => ({ ...c, scope: c.scope ?? 'natal' }))).toEqual(
      conditions.map((c) => ({ ...c, scope: c.scope ?? 'natal' })),
    );
    expect(new Set(definition.conditions.map((c) => c.scope))).toEqual(new Set(CHART_SEARCH_SCOPES));
  });

  it('opens a definition with today as the default as-of date', () => {
    const definition = unwrap(definitionFromDraft(draftWith(1)));
    expect(unwrap(draftFromDefinition(definition)).asOf).toBe(todayInputValue());
  });

  it('gives a typed error for an unknown body key', () => {
    const definition: ChartSearchDefinition = {
      version: 2,
      operator: 'and',
      conditions: [{ kind: 'sign', scope: 'natal', body: 'nobody', sign: 1 }],
    };
    expect(draftFromDefinition(definition)).toEqual({ ok: false, error: { code: 'unknown-body-key', key: 'nobody' } });
    const target: ChartSearchDefinition = {
      version: 2,
      operator: 'and',
      conditions: [
        { kind: 'aspect', scope: 'natal', body: sun.key, aspectKey: 'trine', target: { kind: 'body', body: 'nobody' } },
      ],
    };
    expect(draftFromDefinition(target)).toEqual({ ok: false, error: { code: 'unknown-body-key', key: 'nobody' } });
  });

  it('gives a typed error for an unknown body id', () => {
    const bad = { kind: 'sign', body: 99999, sign: 1 } as unknown as SearchCondition;
    const draft: ChartSearchDraft = { operator: 'and', conditions: [bad], asOf: '2026-01-01' };
    expect(definitionFromDraft(draft)).toEqual({ ok: false, error: { code: 'unknown-body-id', id: 99999 } });
  });

  it('refuses an empty draft as the store does', () => {
    expect(definitionFromDraft(newDraft('2026-01-01'))).toEqual({ ok: false, error: { code: 'no-conditions' } });
  });
});

describe('parseAsOf', () => {
  it('parses a calendar date', () => {
    expect(parseAsOf('2026-11-12')).toEqual({ ok: true, value: { year: 2026, month: 11, day: 12 } });
    expect(parseAsOf('2024-02-29').ok).toBe(true);
  });

  it.each([
    '',
    '2026-1-12',
    '2026-13-01',
    '2026-00-10',
    '2026-02-30',
    '2025-02-29',
    '2026-04-31',
    'abc',
    '2026-11-12x',
  ])('rejects %j', (value) => {
    expect(parseAsOf(value)).toEqual({ ok: false, error: { code: 'invalid-as-of-date', value } });
  });
});
