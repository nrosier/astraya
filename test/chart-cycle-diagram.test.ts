/**
 * The planetary-cycle diagram's points and selection (#418): every point can be named and clicked,
 * and a selection keeps that point and the segment that arrives at it while dimming the rest.
 */
import { describe, expect, it } from 'vitest';
import { renderCycleDiagramSvg, type CyclePoint } from '../src/chart/cycle-diagram.js';

const POINTS: readonly CyclePoint[] = [
  { longitude: 10, label: '1', id: 'a' },
  { longitude: 154, label: '2', id: 'b' },
  { longitude: 298, label: '3', id: 'c' },
  { longitude: 82, label: '4', id: 'd' },
];

const groups = (svg: string): string[] =>
  [...svg.matchAll(/<g class="cycle-point-group[^"]*"[^>]*>/g)].map((m) => m[0]);
const links = (svg: string): string[] => [...svg.matchAll(/<line[^>]*class="cycle-link[^"]*"[^>]*>/g)].map((m) => m[0]);
const dimmed = (markup: string[]): number => markup.filter((m) => m.includes('cycle-dimmed')).length;

describe('renderCycleDiagramSvg points (#418)', () => {
  it('draws every point as a group with its id, a hit area bigger than the dot, the dot and its label', () => {
    const svg = renderCycleDiagramSvg(POINTS);
    expect(groups(svg)).toHaveLength(4);
    for (const id of ['a', 'b', 'c', 'd']) expect(svg).toContain(`data-cycle-id="${id}"`);
    expect(svg.match(/class="cycle-hit-area"/g)).toHaveLength(4);
    expect(svg.match(/class="cycle-point"/g)).toHaveLength(4);
    expect(svg.match(/class="cycle-point-label"/g)).toHaveLength(4);
    // The hit disc is larger than the dot, so a point is easy to click.
    const radius = (cls: string): number => Number(new RegExp(`r="([\\d.]+)" class="${cls}"`).exec(svg)?.[1]);
    expect(radius('cycle-hit-area')).toBeGreaterThan(radius('cycle-point') * 2);
    expect(svg).toContain('pointer-events="all"');
  });

  it('joins the points in order with one segment fewer than points', () => {
    expect(links(renderCycleDiagramSvg(POINTS))).toHaveLength(3);
  });

  it('names a point by its position when it has no id, and escapes an id that would break the markup', () => {
    const svg = renderCycleDiagramSvg([
      { longitude: 0, label: '1' },
      { longitude: 90, label: '2', id: 'a"b<c' },
    ]);
    expect(svg).toContain('data-cycle-id="0"');
    expect(svg).toContain('data-cycle-id="a&quot;b&lt;c"');
    expect(svg).not.toContain('a"b<c');
  });

  it('dims nothing when nothing is selected, or the id is unknown', () => {
    for (const svg of [renderCycleDiagramSvg(POINTS), renderCycleDiagramSvg(POINTS, 380, 'nope')]) {
      expect(svg).not.toContain('cycle-dimmed');
      expect(svg).not.toContain('cycle-selected');
    }
  });
});

describe('renderCycleDiagramSvg selection (#418)', () => {
  it('keeps the selected point, the point it comes from and the segment between them; dims everything else', () => {
    const svg = renderCycleDiagramSvg(POINTS, 380, 'c');
    const pointGroups = groups(svg);
    // c (index 2) and b (index 1) stay; a and d are dimmed.
    expect(
      pointGroups.filter((g) => g.includes('cycle-dimmed')).map((g) => /data-cycle-id="(\w+)"/.exec(g)?.[1]),
    ).toEqual(['a', 'd']);
    expect(pointGroups.find((g) => g.includes('data-cycle-id="c"'))).toContain('cycle-selected');
    expect(pointGroups.filter((g) => g.includes('cycle-selected'))).toHaveLength(1);
    // Of the three segments (a-b, b-c, c-d) only the one arriving at c stays.
    const segments = links(svg);
    expect(dimmed(segments)).toBe(2);
    expect(segments[1]).not.toContain('cycle-dimmed');
  });

  it('selecting the first point keeps only that point: nothing arrives at it', () => {
    const svg = renderCycleDiagramSvg(POINTS, 380, 'a');
    expect(dimmed(groups(svg))).toBe(3);
    expect(dimmed(links(svg))).toBe(3);
  });

  it('selecting the last point keeps its segment and the point before it', () => {
    const svg = renderCycleDiagramSvg(POINTS, 380, 'd');
    expect(dimmed(groups(svg))).toBe(2);
    const segments = links(svg);
    expect(dimmed(segments)).toBe(2);
    expect(segments[2]).not.toContain('cycle-dimmed');
  });

  it('is the same markup apart from the selection classes', () => {
    const strip = (svg: string): string => svg.replace(/ cycle-(dimmed|selected)/g, '');
    expect(strip(renderCycleDiagramSvg(POINTS, 380, 'b'))).toBe(renderCycleDiagramSvg(POINTS));
  });
});
