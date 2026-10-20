import { describe, expect, it } from 'vitest';
import { KITE_DEFINITIONS, type KiteAspectRequirement, type KiteDefinition } from '../src/astrology/kite-registry.js';

/** Sums the count of required aspects for one aspect kind. */
function countByAspect(definition: KiteDefinition, aspect: KiteAspectRequirement['aspect']): number {
  return definition.requiredAspects.filter((row) => row.aspect === aspect).reduce((total, row) => total + row.count, 0);
}

describe('kite registry', () => {
  it('has at least one definition', () => {
    expect(KITE_DEFINITIONS.length).toBeGreaterThan(0);
  });

  it('has unique ids', () => {
    const ids = KITE_DEFINITIONS.map((definition) => definition.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every definition a non-empty name, school, orbPolicy and authority', () => {
    for (const definition of KITE_DEFINITIONS) {
      expect(definition.name.trim()).not.toBe('');
      expect(definition.school.trim()).not.toBe('');
      expect(definition.orbPolicy.trim()).not.toBe('');
      expect(definition.authority.trim()).not.toBe('');
    }
  });

  it('gives every authority a page reference', () => {
    for (const definition of KITE_DEFINITIONS) {
      expect(definition.authority).toMatch(/p\. \d+/);
    }
  });

  it('requires six aspects in total across the rows', () => {
    for (const definition of KITE_DEFINITIONS) {
      const total = definition.requiredAspects.reduce((sum, row) => sum + row.count, 0);
      expect(total).toBe(6);
    }
  });

  it('requires 3 trines, 1 opposition and 2 sextiles', () => {
    for (const definition of KITE_DEFINITIONS) {
      expect(countByAspect(definition, 'trine')).toBe(3);
      expect(countByAspect(definition, 'opposition')).toBe(1);
      expect(countByAspect(definition, 'sextile')).toBe(2);
    }
  });

  it('joins the opposition to the focal point and the sextiles to the focal point', () => {
    for (const definition of KITE_DEFINITIONS) {
      const oppositions = definition.requiredAspects.filter((row) => row.aspect === 'opposition');
      const sextiles = definition.requiredAspects.filter((row) => row.aspect === 'sextile');
      expect(oppositions.every((row) => row.between === 'focal-opposed')).toBe(true);
      expect(sextiles.every((row) => row.between === 'focal-vertex')).toBe(true);
    }
  });

  it('states that every leg is judged within its own orb', () => {
    for (const definition of KITE_DEFINITIONS) {
      expect(definition.orbPolicy).toContain('own orb');
    }
  });
});
