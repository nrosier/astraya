import { describe, expect, it } from 'vitest';
import { partnerSuffix } from '../src/ui/saved-partner-label.js';
import { savedPartnerLabelMessages } from '../src/ui/saved-partner-label.messages.js';

const PEOPLE = new Map([
  ['p-b', { displayName: 'Max Born' }],
  ['p-empty', { displayName: '  ' }],
]);

describe('partnerSuffix (#1852)', () => {
  it('names the partner after the description, en and nl', () => {
    expect(partnerSuffix('p-b', PEOPLE, 'en')).toBe(' · with Max Born');
    expect(partnerSuffix('p-b', PEOPLE, 'nl')).toBe(' · met Max Born');
  });
  it('follows a rename', () => {
    expect(partnerSuffix('p-b', new Map([['p-b', { displayName: 'Maxine Born' }]]), 'en')).toBe(' · with Maxine Born');
  });
  it('shows the fallback, never the id, for a deleted partner or an empty name', () => {
    for (const people of [PEOPLE, undefined]) {
      const out = partnerSuffix('p-gone', people, 'en');
      expect(out).toBe(' · with someone no longer in your list');
      expect(out).not.toContain('p-gone');
    }
    expect(partnerSuffix('p-empty', PEOPLE, 'nl')).toBe(' · met iemand die niet meer in je lijst staat');
  });
  it('adds nothing without a partner', () => {
    expect(partnerSuffix(null, PEOPLE, 'en')).toBe('');
    expect(partnerSuffix(undefined, PEOPLE, 'nl')).toBe('');
  });
  it('keeps en and nl keys in parity', () => {
    expect(Object.keys(savedPartnerLabelMessages.nl).sort()).toEqual(Object.keys(savedPartnerLabelMessages.en).sort());
  });
});
