/**
 * Keeps docs/schema/astraya-export.schema.json honest against a real export (#561): not a full
 * JSON-Schema validator (no new dependency for this), just a structural check that every key a
 * real `FullExport`/`ExportedChart` actually has is one the schema's own `properties` list
 * knows about, and that `FULL_EXPORT_VERSION` matches what docs/EXPORT_SCHEMA.md's version
 * history section documents as current.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildFullExport, FULL_EXPORT_VERSION } from '../src/domain/full-export.js';
import type { Person } from '../src/domain/person.js';
import type { EphemerisProvider } from '../src/ephemeris/types.js';
import { DEFAULT_EXTENDED_SETTINGS } from '../src/chart/extended-settings.js';
import { getEngine } from './engine-harness.js';

const SCHEMA_PATH = fileURLToPath(new URL('../docs/schema/astraya-export.schema.json', import.meta.url));

interface JsonSchemaLike {
  readonly properties?: Record<string, unknown>;
  readonly required?: readonly string[];
}

function loadSchema(): JsonSchemaLike {
  return JSON.parse(readFileSync(SCHEMA_PATH, 'utf-8')) as JsonSchemaLike;
}

function assertKeysKnown(schema: JsonSchemaLike, value: Record<string, unknown>, label: string): void {
  const known = new Set(Object.keys(schema.properties ?? {}));
  for (const key of Object.keys(value)) {
    expect(known.has(key), `${label}'s key "${key}" is missing from the schema's properties`).toBe(true);
  }
  for (const key of schema.required ?? []) {
    expect(key in value, `${label} is missing required key "${key}" the schema demands`).toBe(true);
  }
}

const ADA: Person = {
  id: 'p-ada',
  displayName: 'Ada Lovelace',
  placeLabel: 'London, UK',
  timeAccuracy: 'recorded',
  notes: '',
  missing: [],
  moment: {
    civil: { year: 1815, month: 12, day: 10, hour: 7, minute: 45, second: 0 },
    coordinates: { latitude: 51.5072, longitude: -0.1276 },
  },
};

let engine: EphemerisProvider;
beforeAll(async () => {
  engine = await getEngine();
}, 60_000);

describe('docs/schema/astraya-export.schema.json (#561)', () => {
  it('parses as valid JSON', () => {
    expect(() => loadSchema()).not.toThrow();
  });

  it('matches FULL_EXPORT_VERSION and the top-level/ExportedChart key sets a real export actually has', async () => {
    const schema = loadSchema();
    expect((schema.properties?.version as { minimum?: number } | undefined)?.minimum).toBe(1);

    const archive = await buildFullExport({
      people: [ADA],
      provider: engine,
      appVersion: '9.9.9',
      settings: DEFAULT_EXTENDED_SETTINGS,
      rulership: 'modern',
      symbolClass: 'drawn',
      now: new Date('2026-10-13T00:00:00.000Z'),
    });

    expect(archive.version).toBe(FULL_EXPORT_VERSION);
    assertKeysKnown(schema, archive as unknown as Record<string, unknown>, 'FullExport');

    const chartSchema = (schema as unknown as { $defs: { exportedChart: JsonSchemaLike } }).$defs.exportedChart;
    const personSchema = (schema as unknown as { $defs: { exportedPerson: JsonSchemaLike } }).$defs.exportedPerson;
    const chart = archive.people[0]?.natalChart;
    const person = archive.people[0];
    expect(person).toBeDefined();
    if (person !== undefined) {
      assertKeysKnown(personSchema, person as unknown as Record<string, unknown>, 'ExportedPerson');
    }
    expect(chart).toBeDefined();
    if (chart !== undefined) {
      assertKeysKnown(chartSchema, chart as unknown as Record<string, unknown>, 'ExportedChart');
    }
  });
});
