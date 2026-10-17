/**
 * The Astrocartography map's settings (#512): what the map is drawn from, as one value that is edited as a draft and
 * applied as a whole. Pure, so the validation and the one-line summary are tested without a DOM.
 */
/**
 * @module ui/map-settings
 * @purpose Defines the map's settings value (line types, bodies, Local Space, relocation), its defaults, equality, relocation validation and applied-state summary.
 * @conventions Relocation coordinates are kept as typed text so a half-typed "-" is a work in progress, not a coordinate of zero; both empty means no relocation, one filled is an error; a valid draft is the only thing that can be applied.
 * @exports LineType, ALL_LINE_TYPES, MapSettings, DEFAULT_MAP_SETTINGS, sameMapSettings, parseCoordinate, relocationErrors, relocationOf, summaryCounts
 */
import { TRADITIONAL_ACG_BODY_IDS } from '../domain/astrocartography.js';
import type { BodyId, GeoPosition } from '../ephemeris/types.js';

export type LineType = 'MC' | 'IC' | 'AC' | 'DC';
export const ALL_LINE_TYPES: readonly LineType[] = ['MC', 'IC', 'AC', 'DC'];

export interface MapSettings {
  readonly lineTypes: readonly LineType[];
  readonly bodies: readonly BodyId[];
  readonly localSpace: boolean;
  /** Typed text; '' for none. */
  readonly relocationLat: string;
  readonly relocationLon: string;
}

export const DEFAULT_MAP_SETTINGS: MapSettings = {
  lineTypes: ALL_LINE_TYPES,
  bodies: TRADITIONAL_ACG_BODY_IDS,
  localSpace: false,
  relocationLat: '',
  relocationLon: '',
};

const sameSet = <T>(a: readonly T[], b: readonly T[]): boolean =>
  a.length === b.length && a.every((item) => b.includes(item));

export function sameMapSettings(a: MapSettings, b: MapSettings): boolean {
  return (
    sameSet(a.lineTypes, b.lineTypes) &&
    sameSet(a.bodies, b.bodies) &&
    a.localSpace === b.localSpace &&
    a.relocationLat === b.relocationLat &&
    a.relocationLon === b.relocationLon
  );
}

export function parseCoordinate(value: string, min: number, max: number): number | undefined {
  if (value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : undefined;
}

export interface RelocationErrors {
  readonly latitude?: 'range' | 'both';
  readonly longitude?: 'range' | 'both';
}

/** What is wrong with the relocation fields, if anything: empty pair is fine, one empty is `both`, out of range or not a number is `range`. */
export function relocationErrors(settings: MapSettings): RelocationErrors {
  const latEmpty = settings.relocationLat.trim() === '';
  const lonEmpty = settings.relocationLon.trim() === '';
  if (latEmpty && lonEmpty) return {};
  return {
    ...(latEmpty
      ? { latitude: 'both' as const }
      : parseCoordinate(settings.relocationLat, -90, 90) === undefined
        ? { latitude: 'range' as const }
        : {}),
    ...(lonEmpty
      ? { longitude: 'both' as const }
      : parseCoordinate(settings.relocationLon, -180, 180) === undefined
        ? { longitude: 'range' as const }
        : {}),
  };
}

/** The relocation place, once both fields are valid; `undefined` otherwise. */
export function relocationOf(settings: Pick<MapSettings, 'relocationLat' | 'relocationLon'>): GeoPosition | undefined {
  const latitude = parseCoordinate(settings.relocationLat, -90, 90);
  const longitude = parseCoordinate(settings.relocationLon, -180, 180);
  return latitude === undefined || longitude === undefined ? undefined : { latitude, longitude, altitude: 0 };
}

/** The numbers the applied-state summary names. */
export function summaryCounts(settings: MapSettings): {
  readonly lineTypes: number;
  readonly bodies: number;
  readonly localSpace: boolean;
  readonly relocated: boolean;
} {
  return {
    lineTypes: settings.lineTypes.length,
    bodies: settings.bodies.length,
    localSpace: settings.localSpace,
    relocated: relocationOf(settings) !== undefined,
  };
}
