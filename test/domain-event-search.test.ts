/**
 * Integration tests for searchEvents/eventSearchToCsv (#562) against the real Swiss Ephemeris —
 * the three underlying finders (stations.ts/sign-ingress.ts/lunations.ts) are each covered on
 * their own; this is specifically the composition and the reproducible-CSV shape.
 */
import { describe, expect, it } from 'vitest';
import { bodyByKey } from '../src/astrology/bodies.js';
import { eventSearchToCsv, searchEvents } from '../src/domain/event-search.js';
import { getEngine } from './engine-harness.js';

describe('searchEvents (#562)', () => {
  it('finds the published January 2003 lunations when "lunation" is requested', async () => {
    const engine = await getEngine();
    const fromJd = await engine.julianDay(2003, 1, 1, 0);
    const toJd = await engine.julianDay(2003, 1, 20, 0);
    const results = await searchEvents(fromJd, toJd, engine, { kinds: ['lunation'] });
    expect(results.filter((r) => r.kind === 'lunation')).toHaveLength(2);
    expect(results.every((r) => r.kind === 'station' || r.kind === 'ingress')).toBe(false);
  });

  it('finds the Sun’s Aquarius ingress when "ingress" is requested with the Sun as the body', async () => {
    const engine = await getEngine();
    const sun = bodyByKey('sun')?.id;
    expect(sun).toBeDefined();
    if (sun === undefined) return;
    const fromJd = await engine.julianDay(2024, 1, 15, 0);
    const toJd = await engine.julianDay(2024, 1, 25, 0);
    const results = await searchEvents(fromJd, toJd, engine, { kinds: ['ingress'], ingressBodies: [sun] });
    expect(results).toHaveLength(1);
    expect(results[0]?.label).toContain('Aquarius');
  });

  it('finds nothing for "ingress" when no ingressBodies are given — a deliberate, documented omission, not every body by default', async () => {
    const engine = await getEngine();
    const fromJd = await engine.julianDay(2024, 1, 15, 0);
    const toJd = await engine.julianDay(2024, 1, 25, 0);
    const results = await searchEvents(fromJd, toJd, engine, { kinds: ['ingress'] });
    expect(results).toEqual([]);
  });

  it('returns a combined result list in chronological order across kinds', async () => {
    const engine = await getEngine();
    const sun = bodyByKey('sun')?.id;
    expect(sun).toBeDefined();
    if (sun === undefined) return;
    const fromJd = await engine.julianDay(2024, 1, 1, 0);
    const toJd = await engine.julianDay(2024, 2, 1, 0);
    const results = await searchEvents(fromJd, toJd, engine, {
      kinds: ['station', 'ingress', 'lunation'],
      ingressBodies: [sun],
    });
    for (let i = 1; i < results.length; i++) {
      expect(results[i]?.jd).toBeGreaterThanOrEqual(results[i - 1]?.jd ?? 0);
    }
    expect(results.some((r) => r.kind === 'lunation')).toBe(true);
    expect(results.some((r) => r.kind === 'ingress')).toBe(true);
  });

  it('finds a documented exact moving-body aspect when the aspect filter is requested', async () => {
    const engine = await getEngine();
    const jupiter = bodyByKey('jupiter')?.id;
    const saturn = bodyByKey('saturn')?.id;
    expect(jupiter).toBeDefined();
    expect(saturn).toBeDefined();
    if (jupiter === undefined || saturn === undefined) return;
    const fromJd = await engine.julianDay(2020, 12, 20, 0);
    const toJd = await engine.julianDay(2020, 12, 23, 0);
    const results = await searchEvents(fromJd, toJd, engine, {
      kinds: ['aspect'],
      aspectPairs: [[jupiter, saturn]],
      aspectKeys: ['conjunction'],
    });
    expect(results).toHaveLength(1);
    expect(results[0]?.aspectKey).toBe('conjunction');
    expect(results[0]?.label).toContain('jupiter exact conjunction saturn');
  });
});

describe('eventSearchToCsv (#562)', () => {
  it('carries the exact search parameters as leading comment lines, enough to regenerate the search', async () => {
    const engine = await getEngine();
    const fromJd = await engine.julianDay(2003, 1, 1, 0);
    const toJd = await engine.julianDay(2003, 1, 20, 0);
    const filter = { kinds: ['lunation'] as const };
    const results = await searchEvents(fromJd, toJd, engine, filter);
    const csv = eventSearchToCsv(fromJd, toJd, filter, results);

    const lines = csv.split('\n');
    expect(lines[0]).toBe('# Astraya event search');
    expect(lines.some((line) => line.startsWith('# from: 2003-01-01'))).toBe(true);
    expect(lines.some((line) => line.startsWith('# to: 2003-01-20'))).toBe(true);
    expect(lines.some((line) => line === '# kinds: lunation')).toBe(true);
    expect(lines).toContain('date,kind,body,relatedBody,aspect,event');
    expect(lines.some((line) => line.includes('lunation') && line.includes('New Moon'))).toBe(true);
  });
});
