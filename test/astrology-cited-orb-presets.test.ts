/**
 * The cited Lilly orb presets (#590): their numbers are pinned to the transcription in
 * docs/references/orb-conventions.references.json, and the moiety arithmetic reproduces Lilly's own
 * worked examples. Pure, no ephemeris.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_ORB_CONFIG, orbFor, type OrbConfig } from '../src/astrology/aspects.js';
import {
  CITED_ORB_PRESET_IDS,
  CITED_ORB_PRESETS,
  citedPresetSettings,
  isCitedOrbPresetId,
  matchCitedOrbPreset,
} from '../src/astrology/orb-profiles.js';

interface OrbRow {
  readonly body: string;
  readonly first: readonly [number, number];
  readonly second: readonly [number, number];
}
interface Passage {
  readonly id: string;
  readonly locator: string;
  readonly kind: string;
  readonly table?: { readonly rows?: readonly OrbRow[] };
}
const file = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../docs/references/orb-conventions.references.json'), 'utf8'),
) as { readonly passages: readonly Passage[] };

const rows = file.passages.find((passage) => passage.id === 'lilly-i-orbs-table')?.table?.rows ?? [];
const toDegrees = ([degrees, minutes]: readonly [number, number]): number => degrees + minutes / 60;

function configFor(id: (typeof CITED_ORB_PRESET_IDS)[number]): OrbConfig {
  return { ...DEFAULT_ORB_CONFIG, ...citedPresetSettings(id) };
}

describe('the Lilly orb presets match the transcription', () => {
  it('the transcription has the seven classical planets', () => {
    expect(rows.map((row) => row.body).sort()).toEqual(
      ['jupiter', 'mars', 'mercury', 'moon', 'saturn', 'sun', 'venus'].sort(),
    );
  });

  it('each preset holds exactly half of each transcribed orb, column by column', () => {
    for (const row of rows) {
      expect(CITED_ORB_PRESETS['lilly-1647-first-v1'].bodyOrbs[row.body], row.body).toBeCloseTo(
        toDegrees(row.first) / 2,
      );
      expect(CITED_ORB_PRESETS['lilly-1647-second-v1'].bodyOrbs[row.body], row.body).toBeCloseTo(
        toDegrees(row.second) / 2,
      );
    }
  });

  it('has no body that Lilly does not list', () => {
    for (const id of CITED_ORB_PRESET_IDS) {
      expect(Object.keys(CITED_ORB_PRESETS[id].bodyOrbs).sort()).toEqual(rows.map((row) => row.body).sort());
    }
  });
});

describe('the moiety arithmetic reproduces Lilly’s own examples', () => {
  it('Venus and Saturn: moieties 4 and 5, so an aspect is in orb within 9 degrees (first column)', () => {
    const config = configFor('lilly-1647-first-v1');
    expect(CITED_ORB_PRESETS['lilly-1647-first-v1'].bodyOrbs.saturn).toBe(5);
    expect(CITED_ORB_PRESETS['lilly-1647-first-v1'].bodyOrbs.venus).toBe(4);
    expect(orbFor('trine', 'planet', 'planet', config, { a: 'venus', b: 'saturn' })).toBe(9);
  });

  it('Sun and Moon: half-orbs 7 deg 30 min and 6 deg, so 13 deg 30 min (second column)', () => {
    const config = configFor('lilly-1647-second-v1');
    expect(orbFor('conjunction', 'luminary', 'luminary', config, { a: 'sun', b: 'moon' })).toBe(13.5);
  });

  it('Saturn and Jupiter: 4 deg 30 min each, so 9 whole degrees (second column)', () => {
    const config = configFor('lilly-1647-second-v1');
    expect(orbFor('conjunction', 'planet', 'planet', config, { a: 'saturn', b: 'jupiter' })).toBe(9);
  });

  it('a pair that includes a body Lilly does not list falls back to the aspect’s own tier', () => {
    const config = configFor('lilly-1647-first-v1');
    expect(orbFor('trine', 'planet', 'planet', config, { a: 'venus', b: 'uranus' })).toBe(7);
  });
});

describe('matching and identifying cited presets', () => {
  it('recognises a preset’s exact settings and nothing near it', () => {
    for (const id of CITED_ORB_PRESET_IDS) {
      const settings = citedPresetSettings(id);
      expect(matchCitedOrbPreset(settings.scalePercent, { bodyOrbs: settings.bodyOrbs })).toBe(id);
      expect(matchCitedOrbPreset(10, { bodyOrbs: settings.bodyOrbs })).toBeUndefined();
      expect(matchCitedOrbPreset(0, { bodyOrbs: { ...settings.bodyOrbs, saturn: 99 } })).toBeUndefined();
      expect(
        matchCitedOrbPreset(0, { bodyOrbs: settings.bodyOrbs, aspectOrbs: { trine: { base: 6 } } }),
      ).toBeUndefined();
    }
    expect(matchCitedOrbPreset(0, undefined)).toBeUndefined();
  });

  it('every cited preset names a page, not just an author', () => {
    for (const id of CITED_ORB_PRESET_IDS) {
      expect(CITED_ORB_PRESETS[id].source.locator).toMatch(/p\. 107/);
      expect(isCitedOrbPresetId(id)).toBe(true);
    }
    expect(isCitedOrbPresetId('standard-v1')).toBe(false);
  });
});

describe('the references file', () => {
  it('has unique ids, a locator and a kind on every passage', () => {
    const ids = file.passages.map((passage) => passage.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const passage of file.passages) {
      expect(passage.locator, passage.id).not.toBe('');
      expect(passage.kind, passage.id).toBe('page-image-transcription');
    }
  });
});
