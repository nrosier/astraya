/**
 * The Astrocartography map's settings (#512): equality, relocation validation and the applied-state counts, all
 * pure so they need no DOM.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAP_SETTINGS,
  relocationErrors,
  relocationOf,
  sameMapSettings,
  summaryCounts,
  type MapSettings,
} from '../src/ui/map-settings.js';

const with_ = (patch: Partial<MapSettings>): MapSettings => ({ ...DEFAULT_MAP_SETTINGS, ...patch });

describe('sameMapSettings', () => {
  it('ignores the order line types and bodies were ticked in', () => {
    expect(sameMapSettings(DEFAULT_MAP_SETTINGS, with_({ lineTypes: ['DC', 'AC', 'IC', 'MC'] }))).toBe(true);
    expect(sameMapSettings(DEFAULT_MAP_SETTINGS, with_({ bodies: [...DEFAULT_MAP_SETTINGS.bodies].reverse() }))).toBe(
      true,
    );
  });

  it('sees a change to any one part', () => {
    expect(sameMapSettings(DEFAULT_MAP_SETTINGS, with_({ lineTypes: ['MC'] }))).toBe(false);
    expect(sameMapSettings(DEFAULT_MAP_SETTINGS, with_({ bodies: DEFAULT_MAP_SETTINGS.bodies.slice(1) }))).toBe(false);
    expect(sameMapSettings(DEFAULT_MAP_SETTINGS, with_({ localSpace: true }))).toBe(false);
    expect(sameMapSettings(DEFAULT_MAP_SETTINGS, with_({ relocationLat: '1' }))).toBe(false);
  });
});

describe('relocationErrors', () => {
  it('accepts no relocation, and a valid pair', () => {
    expect(relocationErrors(DEFAULT_MAP_SETTINGS)).toEqual({});
    expect(relocationErrors(with_({ relocationLat: '48.85', relocationLon: '-2.35' }))).toEqual({});
    expect(relocationErrors(with_({ relocationLat: '-90', relocationLon: '180' }))).toEqual({});
  });

  it('asks for the other half when only one is filled', () => {
    expect(relocationErrors(with_({ relocationLat: '48.85' }))).toEqual({ longitude: 'both' });
    expect(relocationErrors(with_({ relocationLon: '2' }))).toEqual({ latitude: 'both' });
  });

  it('flags a value that is out of range or not a number, and not the other field', () => {
    expect(relocationErrors(with_({ relocationLat: '91', relocationLon: '2' }))).toEqual({ latitude: 'range' });
    expect(relocationErrors(with_({ relocationLat: '1', relocationLon: '-181' }))).toEqual({ longitude: 'range' });
    expect(relocationErrors(with_({ relocationLat: '-', relocationLon: '2' }))).toEqual({ latitude: 'range' });
  });
});

describe('relocationOf and summaryCounts', () => {
  it('gives the place only for a complete valid pair', () => {
    expect(relocationOf(DEFAULT_MAP_SETTINGS)).toBeUndefined();
    expect(relocationOf(with_({ relocationLat: '48.85' }))).toBeUndefined();
    expect(relocationOf(with_({ relocationLat: '48.85', relocationLon: '2.35' }))).toEqual({
      latitude: 48.85,
      longitude: 2.35,
      altitude: 0,
    });
  });

  it('counts what is applied, for the trigger beside the dialog', () => {
    expect(summaryCounts(DEFAULT_MAP_SETTINGS)).toEqual({
      lineTypes: 4,
      bodies: 7,
      localSpace: false,
      relocated: false,
    });
    expect(
      summaryCounts(with_({ lineTypes: ['MC'], localSpace: true, relocationLat: '1', relocationLon: '2' })),
    ).toEqual({
      lineTypes: 1,
      bodies: 7,
      localSpace: true,
      relocated: true,
    });
  });
});
