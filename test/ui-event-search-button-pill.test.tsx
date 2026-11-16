// @vitest-environment jsdom
/**
 * The Search events button is a pill like Save query (#1600, owner answer 2026-11-16): capsule shape plus the
 * form-action class, with variant, disabled and busy behaviour unchanged.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { EphemerisProvider } from '../src/ephemeris/types.js';

const context: { provider: EphemerisProvider | undefined } = { provider: undefined };

vi.mock('../src/ui/EphemerisProviderContext.js', () => ({
  useEphemerisProvider: () => ({ provider: context.provider, error: undefined }),
}));

vi.mock('../src/ui/store-context.js', () => ({
  useStoreState: () => ({ people: new Map(), birthNotes: new Map(), consultationNotes: new Map() }),
  useStore: () => ({ mutate: () => Promise.resolve() }),
  useOptionalStore: () => undefined,
}));

const { EventSearchView } = await import('../src/ui/EventSearchView.js');
const { eventSearchViewMessages } = await import('../src/ui/EventSearchView.messages.js');

function searchButtonTag(): string {
  const html = renderToStaticMarkup(<EventSearchView />);
  const chunk = html
    .split(/(?=<button)/)
    .find((part) => part.startsWith('<button') && part.includes(eventSearchViewMessages.en.searchButton));
  const tag = chunk === undefined ? undefined : /^<button[^>]*>/.exec(chunk)?.[0];
  if (tag === undefined) throw new Error('Search events button not found');
  return tag;
}

describe('Search events button (#1600)', () => {
  it('carries the capsule shape, the form-action class and the primary variant', () => {
    context.provider = undefined;
    const tag = searchButtonTag();
    expect(tag).toContain('primitive-button-capsule');
    expect(tag).toContain('primitive-button-form-action');
    expect(tag).toContain('primitive-button-primary');
  });

  it('is disabled without an ephemeris provider and not busy before a search', () => {
    context.provider = undefined;
    const tag = searchButtonTag();
    expect(tag).toContain('disabled');
    expect(tag).not.toContain('aria-busy="true"');
  });

  it('is enabled once a provider exists', () => {
    context.provider = {} as EphemerisProvider;
    expect(searchButtonTag()).not.toContain('disabled');
  });
});
