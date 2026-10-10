/**
 * The tools menu's pure logic (#421): which screens are tools and which tool a route is on.
 */
import { describe, expect, it } from 'vitest';
import { newId } from '../src/domain/id.js';
import { parseRoute, type Route } from '../src/ui/route.js';
import { activeToolKey, TOOL_GROUPS, TOOLS } from '../src/ui/tools-nav.js';
import { appNavMessages } from '../src/ui/AppNav.messages.js';

describe('the tools menu', () => {
  it('lists the five screens that are not about one person’s chart, each with a real route', () => {
    expect(TOOLS.map((tool) => tool.key)).toEqual(['cycles', 'eclipses', 'horary', 'electional', 'rectification']);
    for (const tool of TOOLS) expect(parseRoute(tool.href).kind).toBe(tool.key);
  });

  it('knows which tool a route is on, and none for any other route', () => {
    for (const tool of TOOLS) expect(activeToolKey(parseRoute(tool.href))).toBe(tool.key);
    const person = newId('p');
    const others: Route[] = [
      { kind: 'people' },
      { kind: 'about' },
      { kind: 'admin' },
      { kind: 'chart', personId: person },
      { kind: 'transit', personId: person },
    ];
    for (const route of others) expect(activeToolKey(route)).toBeNull();
  });

  it('groups every tool under one of the three Sky & cycles/Questions & planning/Birth data headings, consecutively', () => {
    expect(TOOL_GROUPS).toEqual(['sky-cycles', 'questions-planning', 'birth-data']);
    expect(TOOLS.map((tool) => tool.group)).toEqual([
      'sky-cycles',
      'sky-cycles',
      'questions-planning',
      'questions-planning',
      'birth-data',
    ]);
    // Every group has at least one tool, and TOOL_GROUPS names every group TOOLS actually uses —
    // AppNav.tsx's rendering assumes both.
    for (const group of TOOL_GROUPS) expect(TOOLS.some((tool) => tool.group === group)).toBe(true);
    for (const tool of TOOLS) expect(TOOL_GROUPS).toContain(tool.group);
  });

  it('has a label for every tool and every group in both languages, and names the menu in both', () => {
    for (const locale of ['en', 'nl'] as const) {
      const t = appNavMessages[locale];
      for (const tool of TOOLS) expect(t.toolLabels[tool.key].length).toBeGreaterThan(3);
      for (const group of TOOL_GROUPS) expect(t.toolGroupLabels[group].length).toBeGreaterThan(3);
      expect(t.toolsLabel.length).toBeGreaterThan(3);
    }
    expect(appNavMessages.en.toolsLabel).toBe('Tools');
    expect(appNavMessages.nl.toolsLabel).toBe('Hulpmiddelen');
  });
});
