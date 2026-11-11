/**
 * Fetches reference ecliptic longitudes of the classical seven from NASA/JPL Horizons for the graphic ephemeris
 * test (#1404) and writes them to test/fixtures/graphic-ephemeris-horizons.json.
 *
 *   node scripts/fetch-graphic-ephemeris-fixture.mjs
 *
 * Same quantity and frame as `fetch-horizons-fixture.mjs` (31: apparent geocentric ecliptic longitude of date),
 * for three 0h UT dates across 2024 so the test can compare a whole one-year plot at its start, middle and end.
 * Values are fetched, never typed by hand.
 */
import { writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'test', 'fixtures', 'graphic-ephemeris-horizons.json');
const API = 'https://ssd.jpl.nasa.gov/api/horizons.api';

const DATES = [
  { id: '2024-01-01', horizons: '2024-Jan-01 00:00:00' },
  { id: '2024-07-01', horizons: '2024-Jul-01 00:00:00' },
  { id: '2024-12-31', horizons: '2024-Dec-31 00:00:00' },
];
const BODIES = [
  { key: 'sun', command: '10' },
  { key: 'moon', command: '301' },
  { key: 'mercury', command: '199' },
  { key: 'venus', command: '299' },
  { key: 'mars', command: '499' },
  { key: 'jupiter', command: '599' },
  { key: 'saturn', command: '699' },
];

const tlist = DATES.map((d) => `'${d.horizons}'`).join(' ');
const longitudes = {};
for (const body of BODIES) {
  const params = new URLSearchParams({
    format: 'text',
    COMMAND: `'${body.command}'`,
    EPHEM_TYPE: 'OBSERVER',
    CENTER: "'500@399'",
    TLIST: tlist,
    QUANTITIES: "'31'",
    ANG_FORMAT: 'DEG',
    CSV_FORMAT: 'YES',
  });
  const response = await fetch(`${API}?${params}`);
  if (!response.ok) throw new Error(`Horizons returned ${response.status} for ${body.key}`);
  const text = await response.text();
  const block = text.match(/\$\$SOE\n([\s\S]*?)\$\$EOE/);
  if (!block?.[1]) throw new Error(`No ephemeris block for ${body.key}`);
  const rows = new Map();
  for (const line of block[1].trim().split('\n')) {
    const [stamp, , , lon] = line.split(',').map((c) => c.trim());
    if (stamp && lon !== undefined) rows.set(stamp.replace(/\.\d+$/, ''), Number(lon));
  }
  for (const date of DATES) {
    const value = rows.get(date.horizons);
    if (value === undefined) throw new Error(`${body.key}: no row for ${date.horizons}`);
    longitudes[date.id] ??= {};
    longitudes[date.id][body.key] = value;
  }
  await new Promise((r) => setTimeout(r, 350));
}

const fixture = {
  $provenance: {
    source: 'NASA/JPL Horizons system',
    api: API,
    retrieved: new Date().toISOString().slice(0, 10),
    quantity: '31 (observer ecliptic longitude)',
    center: '500@399 (geocentric)',
    frame: 'apparent, light-time corrected, true ecliptic and equinox of date',
    units: 'degrees',
    timeScale: 'UT, 00:00 on each date',
    reproduce: 'node scripts/fetch-graphic-ephemeris-fixture.mjs',
    note: 'Do not edit by hand. External reference values for the graphic ephemeris test (#1404).',
  },
  longitudes,
};
await writeFile(OUT, JSON.stringify(fixture, null, 2) + '\n');
console.log(`wrote ${OUT}`);
