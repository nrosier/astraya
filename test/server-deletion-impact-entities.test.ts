/**
 * The deletion-impact preview (#1960) counts every stored kind the server can see. The server
 * copies the entity strings (the store's modules use bundler `.js` imports Node cannot resolve),
 * so this pins each copy to the store's own export and to the fold's known-entity list.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHART_SEARCH_ENTITY } from '../src/store/chart-searches.ts';
import { HORARY_JUDGMENT_ENTITY } from '../src/store/horary-judgments.ts';
import { PIN_ENTITY } from '../src/store/pins.ts';
import { SAVED_QUERY_ENTITY } from '../src/store/saved-queries.ts';

describe('server/ops/deletion-impact entity names (#1960)', () => {
  it('copies the store entity strings exactly', () => {
    const source = readFileSync(resolve(import.meta.dirname, '..', 'server/ops/deletion-impact.ts'), 'utf8');
    const match = /const KNOWN_ENTITIES = \[([^\]]*)\] as const;/.exec(source);
    const names = (match?.[1] ?? '').split(',').map((n) => n.trim().replaceAll("'", ''));
    expect(names).toEqual([
      'person',
      'chart',
      PIN_ENTITY,
      SAVED_QUERY_ENTITY,
      CHART_SEARCH_ENTITY,
      HORARY_JUDGMENT_ENTITY,
    ]);
  });
});
