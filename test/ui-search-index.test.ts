/**
 * Tests for the command palette's search index (#1654): every href round-trips through the hash
 * router, every feature and menu item is indexed under its menu label, the two catalogues carry the
 * same keys, and a person's birth-moment gate disables the right entries.
 *
 * The failures worth catching are the quiet ones: an entry whose link lands on the wrong screen,
 * a palette row that reads differently from its menu item, and a Dutch keyword missing so Dutch
 * users find nothing.
 */
import { describe, expect, it } from 'vitest';
import { newId } from '../src/domain/id.js';
import { FEATURES } from '../src/ui/feature-registry.js';
import { appNavMessages } from '../src/ui/AppNav.messages.js';
import { PERSON_TABS } from '../src/ui/person-nav.js';
import { TOOLS } from '../src/ui/tools-nav.js';
import { parseRoute, routeHref } from '../src/ui/route.js';
import { buildSearchIndex, type SearchContext } from '../src/ui/search-index.js';
import { searchIndexMessages } from '../src/ui/search-index.messages.js';

const PERSON_ID = newId('p');
const PERSON_CONTEXT: SearchContext = { personId: PERSON_ID, personName: 'Ada', hasBirthMoment: true };

describe('buildSearchIndex', () => {
  it('gives every entry an href that parses back to the same hash', () => {
    for (const locale of ['en', 'nl'] as const) {
      for (const entry of buildSearchIndex(PERSON_CONTEXT, locale)) {
        expect(routeHref(parseRoute(entry.href)), entry.id).toBe(entry.href);
      }
    }
  });

  it('gives every entry a unique id', () => {
    const ids = buildSearchIndex(PERSON_CONTEXT, 'en').map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('indexes every FEATURES key under its menu label', () => {
    const index = buildSearchIndex(PERSON_CONTEXT, 'en');
    for (const feature of FEATURES) {
      const entry = index.find((candidate) => candidate.id === `feature:${feature.key}`);
      expect(entry, `feature ${feature.key}`).toBeDefined();
      if (feature.scope === 'person') {
        expect(entry?.title).toBe(appNavMessages.en.tabLabels[feature.key as keyof typeof appNavMessages.en.tabLabels]);
      }
    }
  });

  it('indexes every header menu item under the same label the menu shows', () => {
    const index = buildSearchIndex(PERSON_CONTEXT, 'en');
    for (const tab of PERSON_TABS) {
      const entry = index.find((candidate) => candidate.id === `feature:${tab.key}`);
      expect(entry?.title, `tab ${tab.key}`).toBe(appNavMessages.en.tabLabels[tab.key]);
      expect(entry?.href, `tab ${tab.key}`).toBe(tab.buildHref(PERSON_ID));
    }
    for (const tool of TOOLS) {
      const entry = index.find((candidate) => candidate.id === `feature:${tool.key}`);
      expect(entry?.title, `tool ${tool.key}`).toBe(appNavMessages.en.toolLabels[tool.key]);
      expect(entry?.href, `tool ${tool.key}`).toBe(tool.href);
    }
    const documents = index.find((candidate) => candidate.id === 'feature:documents');
    expect(documents?.title).toBe(appNavMessages.en.documents);
  });

  it('gives a concept in several places one entry per place, each with its own breadcrumb', () => {
    const index = buildSearchIndex(PERSON_CONTEXT, 'en');
    const solarReturnEntries = index.filter((entry) => entry.id.startsWith('chart:solar-return:'));
    expect(solarReturnEntries.length).toBe(6);
    expect(new Set(solarReturnEntries.map((entry) => entry.href)).size).toBe(6);
    for (const entry of solarReturnEntries) {
      expect(entry.breadcrumb).toContain('Ada');
    }
  });

  it('leaves the natal wheel out of the sub-tab entries, since the Charts entry already opens it', () => {
    const index = buildSearchIndex(PERSON_CONTEXT, 'en');
    expect(index.some((entry) => entry.id === 'chart:natal:wheel')).toBe(false);
    expect(index.some((entry) => entry.id === 'chart:natal:aspects')).toBe(true);
  });

  it('has Horary and Composite view variants, but not their wheel', () => {
    const index = buildSearchIndex(PERSON_CONTEXT, 'en');
    expect(index.some((entry) => entry.id === 'horary:aspects')).toBe(true);
    expect(index.some((entry) => entry.id === 'horary:wheel')).toBe(false);
    expect(index.some((entry) => entry.id === 'composite:matrix')).toBe(true);
    expect(index.some((entry) => entry.id === 'composite:wheel')).toBe(false);
  });

  it('indexes the three Preferences sections under their own tab labels', () => {
    const index = buildSearchIndex(PERSON_CONTEXT, 'en');
    const preferences = index.filter((entry) => entry.id.startsWith('preferences:'));
    expect(preferences.map((entry) => entry.href)).toEqual([
      '#/preferences/appearance',
      '#/preferences/astrology',
      '#/preferences/data',
    ]);
  });

  it('drops person entries when there is no person, and keeps the global and preference entries', () => {
    const index = buildSearchIndex({}, 'en');
    expect(index.some((entry) => entry.id.startsWith('chart:'))).toBe(false);
    expect(index.some((entry) => entry.id === 'feature:overview')).toBe(false);
    expect(index.some((entry) => entry.id === 'feature:cycles')).toBe(true);
    expect(index.some((entry) => entry.id === 'preferences:data')).toBe(true);
  });

  it('disables birth-moment entries for an incomplete person and keeps the rest enabled', () => {
    const incomplete = buildSearchIndex({ ...PERSON_CONTEXT, hasBirthMoment: false }, 'en');
    expect(incomplete.find((entry) => entry.id === 'feature:chart')?.disabled).toBe(true);
    expect(incomplete.find((entry) => entry.id === 'chart:draconic:aspects')?.disabled).toBe(true);
    expect(incomplete.find((entry) => entry.id === 'feature:overview')?.disabled).toBeUndefined();
    expect(incomplete.find((entry) => entry.id === 'feature:birth-record')?.disabled).toBeUndefined();
    expect(incomplete.find((entry) => entry.id === 'feature:cycles')?.disabled).toBeUndefined();
  });

  it('uses the Dutch catalogue for Dutch titles and keeps Dutch keywords for every entry', () => {
    const en = buildSearchIndex(PERSON_CONTEXT, 'en');
    const nl = buildSearchIndex(PERSON_CONTEXT, 'nl');
    expect(nl.map((entry) => entry.id)).toEqual(en.map((entry) => entry.id));
    expect(nl.find((entry) => entry.id === 'feature:overview')?.title).toBe(appNavMessages.nl.tabLabels.overview);
    for (const entry of nl) {
      expect(entry.keywords.length, entry.id).toBeGreaterThan(0);
    }
  });
});

describe('search-index.messages', () => {
  it('has the same keys in en and nl for every keyword and description table', () => {
    const { en, nl } = searchIndexMessages;
    const tables = [
      'featureKeywords',
      'featureDescriptions',
      'chartTypeKeywords',
      'chartTypeDescriptions',
      'chartViewKeywords',
      'preferencesSectionKeywords',
      'preferencesSectionDescriptions',
    ] as const;
    for (const table of tables) {
      expect(Object.keys(nl[table]).sort(), table).toEqual(Object.keys(en[table]).sort());
    }
  });
});
