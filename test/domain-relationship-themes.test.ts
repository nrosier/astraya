/**
 * `groupedRelationshipContacts`/`relationshipAngleContacts` (#422), against the real Swiss
 * Ephemeris engine — same convention every other cross-chart domain test here follows.
 */
import { describe, expect, it } from 'vitest';
import { bodyById } from '../src/astrology/bodies.js';
import { computeSynastry } from '../src/domain/synastry.js';
import {
  aspectValence,
  groupedRelationshipContacts,
  relationshipAngleContacts,
  RELATIONSHIP_THEMES,
} from '../src/domain/relationship-themes.js';
import type { BirthMomentInput } from '../src/time/types.js';
import { getEngine } from './engine-harness.js';

const PERSON_A: BirthMomentInput = {
  civil: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, second: 0 },
  coordinates: { latitude: 38.7478, longitude: -85.0672 },
  offsetOverrideMinutes: -300,
};

const PERSON_B: BirthMomentInput = {
  civil: { year: 1988, month: 11, day: 2, hour: 3, minute: 15, second: 0 },
  coordinates: { latitude: 51.5072, longitude: -0.1276 },
  offsetOverrideMinutes: 0,
};

describe('groupedRelationshipContacts (#422)', () => {
  it('puts every real contact into one of the known themes', async () => {
    const engine = await getEngine();
    const data = await computeSynastry(PERSON_A, PERSON_B, engine);
    const groups = groupedRelationshipContacts(data);
    let total = 0;
    for (const [theme, contacts] of groups) {
      expect(RELATIONSHIP_THEMES).toContain(theme);
      total += contacts.length;
    }
    expect(total).toBe(data.aspects.length);
  });

  it('sorts each theme strongest contact first', async () => {
    const engine = await getEngine();
    const data = await computeSynastry(PERSON_A, PERSON_B, engine);
    const groups = groupedRelationshipContacts(data);
    for (const contacts of groups.values()) {
      for (let i = 1; i < contacts.length; i++) {
        expect(contacts[i - 1]?.importance ?? 0).toBeGreaterThanOrEqual(contacts[i]?.importance ?? 0);
      }
    }
  });

  it('groups a Moon contact as bond even when the other body would also match a later rule', async () => {
    const engine = await getEngine();
    const data = await computeSynastry(PERSON_A, PERSON_B, engine);
    const moonKey = (id: number) => bodyById(id)?.key === 'moon';
    const moonAspects = data.aspects.filter((a) => moonKey(a.bodyA) || moonKey(a.bodyB));
    const groups = groupedRelationshipContacts(data);
    const bondKeys = new Set(
      (groups.get('bond') ?? []).map((c) => `${c.aspect.bodyA}-${c.aspect.aspect.key}-${c.aspect.bodyB}`),
    );
    for (const aspect of moonAspects) {
      expect(bondKeys.has(`${aspect.bodyA}-${aspect.aspect.key}-${aspect.bodyB}`)).toBe(true);
    }
  });
});

describe('relationshipAngleContacts (#422)', () => {
  it('finds contacts using the app’s own aspect/orb rules, not an invented cutoff', async () => {
    const engine = await getEngine();
    const data = await computeSynastry(PERSON_A, PERSON_B, engine);
    const contacts = relationshipAngleContacts(data);
    for (const contact of contacts) {
      expect(['a', 'b']).toContain(contact.side);
      expect(['asc', 'mc']).toContain(contact.angle);
      expect(contact.orb).toBeGreaterThanOrEqual(0);
    }
  });

  it('is empty for a side whose houses have no solution, rather than throwing', async () => {
    const engine = await getEngine();
    const data = await computeSynastry(PERSON_A, PERSON_B, engine);
    // Simulates an unknown-time partner (houses never computed) without depending on finding a
    // real polar-latitude birth that happens to leave them undefined.
    const noHouses = { ...data.chartB.houses, ascendant: Number.NaN, midheaven: Number.NaN };
    const withoutBHouses = { ...data, chartB: { ...data.chartB, houses: noHouses } };
    const contacts = relationshipAngleContacts(withoutBHouses);
    // Side 'a' (A's bodies into B's angles) is suppressed; side 'b' (B's bodies into A's,
    // still solved) is unaffected.
    expect(contacts.every((c) => c.side === 'b')).toBe(true);
  });
});

describe('aspectValence (#422)', () => {
  it('matches the wheel’s own hard/soft/minor colour convention', () => {
    for (const key of ['conjunction', 'sextile', 'trine']) expect(aspectValence(key)).toBe('harmonious');
    for (const key of ['semisquare', 'square', 'sesquiquadrate', 'opposition']) {
      expect(aspectValence(key)).toBe('challenging');
    }
    for (const key of ['semisextile', 'quintile', 'biquintile', 'quincunx']) {
      expect(aspectValence(key)).toBe('neutral');
    }
  });
});
