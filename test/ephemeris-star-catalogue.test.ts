/**
 * Unit tests for the sefstars.txt parser, search and SHA-256 helper (#803 F1).
 * Lines below are FIXTURES in the documented sefstars.txt format (header of
 * https://github.com/aloistr/swisseph/blob/master/ephe/sefstars.txt), not
 * real catalogue data; their numbers are placeholders.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FIXED_STARS_ASSET } from '../src/ephemeris/assets.js';
import {
  STAR_SEARCH_LIMIT,
  USER_STAR_CONJUNCTION_ORB_DEGREES,
  parseStarCatalogue,
  parseStarCatalogueLine,
  searchStarCatalogue,
  sha256Hex,
  swissStarId,
} from '../src/ephemeris/star-catalogue.js';

const FIXTURE_A = 'Fixa      ,alFix,ICRS,01,02,03.0,+04,05,06.0,1.0,2.0,3.0,4.0,1.5, 4,  1';
const FIXTURE_B = '          ,beFix,2000,01,02,03.0,-04,05,06.0,1.0,2.0,3.0,4.0,2.5';
const FIXTURE_TEXT = ['# fixture header', '', FIXTURE_A, '   ', FIXTURE_B, 'bad,line', FIXTURE_A].join('\n');

describe('parseStarCatalogueLine', () => {
  it('parses a valid line', () => {
    expect(parseStarCatalogueLine(FIXTURE_A)).toEqual({
      name: 'Fixa',
      designation: 'alFix',
      equinox: 'ICRS',
      magnitude: 1.5,
    });
  });
  it('accepts a nameless record and a trailing inline comment', () => {
    expect(parseStarCatalogueLine(FIXTURE_B)).toMatchObject({ name: '', designation: 'beFix', equinox: '2000' });
    expect(parseStarCatalogueLine(`${FIXTURE_A} # note`)).toMatchObject({ name: 'Fixa' });
  });
  it('rejects malformed lines with a reason', () => {
    expect(parseStarCatalogueLine('bad,line')).toMatch(/fields/);
    expect(parseStarCatalogueLine(FIXTURE_A.replace('ICRS', '1900'))).toMatch(/equinox/);
    expect(parseStarCatalogueLine(FIXTURE_A.replace('+04', 'xx'))).toMatch(/not a number/);
  });
});

describe('parseStarCatalogue', () => {
  it('skips comments and blanks and reports rejections with line numbers', () => {
    const { entries, rejected } = parseStarCatalogue(FIXTURE_TEXT);
    expect(entries).toHaveLength(3);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.line).toBe(6);
  });
});

describe('searchStarCatalogue', () => {
  const { entries } = parseStarCatalogue(FIXTURE_TEXT);
  it('matches name case-insensitively and de-duplicates repeated records', () => {
    expect(searchStarCatalogue(entries, 'FIXA')).toEqual([{ name: 'Fixa', designation: 'alFix' }]);
  });
  it('matches by designation, including nameless records', () => {
    const hit = searchStarCatalogue(entries, 'befix');
    expect(hit).toEqual([{ name: '', designation: 'beFix' }]);
    const [first] = hit;
    expect(first && swissStarId(first)).toBe(',beFix');
  });
  it('returns nothing for an empty query', () => {
    expect(searchStarCatalogue(entries, '  ')).toEqual([]);
  });
  it('caps results at 50', () => {
    expect(STAR_SEARCH_LIMIT).toBe(50);
    const many = Array.from({ length: 80 }, (_, i) => ({
      name: `Star${String(i)}`,
      designation: `d${String(i)}`,
      equinox: 'ICRS',
      magnitude: 1,
    }));
    expect(searchStarCatalogue(many, 'star')).toHaveLength(STAR_SEARCH_LIMIT);
  });
});

describe('sha256Hex', () => {
  it('matches the known digest of "abc"', async () => {
    expect(await sha256Hex(new TextEncoder().encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('USER_STAR_CONJUNCTION_ORB_DEGREES', () => {
  it('is the uncited 1.0 degree convention', () => {
    expect(USER_STAR_CONJUNCTION_ORB_DEGREES).toBe(1.0);
  });
});

describe('shipped public/ephe/sefstars.txt', () => {
  const bytes = new Uint8Array(readFileSync(new URL('../public/ephe/sefstars.txt', import.meta.url)));
  it('hashes to the digest pinned in assets.ts', async () => {
    expect(await sha256Hex(bytes)).toBe(FIXED_STARS_ASSET.sha256);
  });
  it('parses with no rejected lines and finds Regulus by name and by designation', () => {
    const { entries, rejected } = parseStarCatalogue(new TextDecoder().decode(bytes));
    expect(rejected).toEqual([]);
    expect(entries.length).toBeGreaterThan(1000);
    expect(searchStarCatalogue(entries, 'regulus')).toContainEqual({ name: 'Regulus', designation: 'alLeo' });
    expect(searchStarCatalogue(entries, 'alLeo').map((r) => r.name)).toContain('Regulus');
  });
});
