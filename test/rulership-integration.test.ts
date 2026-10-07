/**
 * The rulership choice (#426) reaching the places it matters, against a real chart: the chart's own
 * dignities, the dignity and dispositor tables, and the report's chart-ruler section. Expectations come
 * from hand-written ruler tables, not from the code under test.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { bodyById } from '../src/astrology/bodies.js';
import { computeChartData, type ChartData } from '../src/domain/chart-compute.js';
import { dignityRows, dispositorRows, almutenOfAscendant } from '../src/domain/chart-tables.js';
import { assembleReport } from '../src/interpretation/report.js';
import { getEngine } from './engine-harness.js';

const TRADITIONAL = [
  'mars',
  'venus',
  'mercury',
  'moon',
  'sun',
  'mercury',
  'venus',
  'mars',
  'jupiter',
  'saturn',
  'saturn',
  'jupiter',
];
const MODERN = [
  'mars',
  'venus',
  'mercury',
  'moon',
  'sun',
  'mercury',
  'venus',
  'pluto',
  'jupiter',
  'saturn',
  'uranus',
  'neptune',
];
const rulersFor = (sign: number, choice: 'modern' | 'traditional' | 'both'): string[] =>
  choice === 'modern'
    ? [MODERN[sign] ?? '']
    : choice === 'traditional'
      ? [TRADITIONAL[sign] ?? '']
      : [...new Set([TRADITIONAL[sign] ?? '', MODERN[sign] ?? ''])];
const keyOf = (id: number): string => bodyById(id)?.key ?? '';
const signOf = (longitude: number): number => Math.floor((((longitude % 360) + 360) % 360) / 30);

let natal: ChartData;
const BIRTH = {
  civil: { year: 1970, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
  coordinates: { latitude: 41.1833, longitude: -84.7333 },
  zoneOverride: 'America/New_York',
};

beforeAll(async () => {
  natal = await computeChartData(BIRTH, await getEngine());
}, 60_000);

describe('the chart’s own dignities follow the choice (#426)', () => {
  it('are modern by default', async () => {
    const explicit = await computeChartData(BIRTH, await getEngine(), { rulership: 'modern' });
    expect([...natal.dignities]).toEqual([...explicit.dignities]);
  });

  it('mark a planet as ruler exactly where the chosen rulers say, for every body in the chart', async () => {
    const engine = await getEngine();
    for (const choice of ['modern', 'traditional', 'both'] as const) {
      const chart = await computeChartData(BIRTH, engine, { rulership: choice });
      for (const position of chart.positions) {
        const dignities = chart.dignities.get(position.body);
        expect(dignities?.ruler, `${keyOf(position.body)} (${choice})`).toBe(
          rulersFor(signOf(position.longitude), choice).includes(keyOf(position.body)),
        );
        const opposite = rulersFor((signOf(position.longitude) + 6) % 12, choice);
        expect(dignities?.detriment, `${keyOf(position.body)} detriment (${choice})`).toBe(
          opposite.includes(keyOf(position.body)),
        );
      }
    }
  });

  it('differ between modern and traditional for a chart with Pluto in Scorpio (born in 1990)', async () => {
    const engine = await getEngine();
    const born1990 = { ...BIRTH, civil: { ...BIRTH.civil, year: 1990, month: 6, day: 15 } };
    const modern = await computeChartData(born1990, engine, { rulership: 'modern' });
    const traditional = await computeChartData(born1990, engine, { rulership: 'traditional' });
    const pluto = modern.positions.find((p) => keyOf(p.body) === 'pluto');
    expect(signOf(pluto?.longitude ?? 0)).toBe(7);
    const differing = modern.positions.filter(
      (p) => modern.dignities.get(p.body)?.ruler !== traditional.dignities.get(p.body)?.ruler,
    );
    // Not vacuous: the fixture chart really does show a difference.
    expect(differing.length).toBeGreaterThan(0);
  });
});

describe('the tables agree with each other (#426)', () => {
  it('a planet in its own sign is never peregrine, under any choice', async () => {
    const engine = await getEngine();
    for (const choice of ['modern', 'traditional', 'both'] as const) {
      const chart = await computeChartData(BIRTH, engine, { rulership: choice });
      for (const row of dignityRows(chart, {}, choice)) {
        if (row.ruler || row.exalted) {
          expect(row.peregrine, `${row.bodyKey} (${choice})`).toBe(false);
          expect(row.points, `${row.bodyKey} (${choice})`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('the dispositor table follows the choice, with a co-dispositor only under both', async () => {
    const engine = await getEngine();
    for (const choice of ['modern', 'traditional', 'both'] as const) {
      const chart = await computeChartData(BIRTH, engine, { rulership: choice });
      for (const row of dispositorRows(chart, {}, choice)) {
        const position = chart.positions.find((p) => keyOf(p.body) === row.bodyKey);
        if (position === undefined) throw new Error('fixture bug');
        const rulers = rulersFor(signOf(position.longitude), choice);
        const primary = choice === 'traditional' ? rulers[0] : rulers[rulers.length - 1];
        if (rulers.length === 1 && rulers[0] === row.bodyKey) {
          expect(row.chain).toEqual([row.bodyKey]);
        } else {
          expect(row.chain[1], `${row.bodyKey} (${choice})`).toBe(primary);
        }
        if (choice === 'both' && rulers.length === 2) {
          expect(row.coDispositorKey, row.bodyKey).toBe(rulers[0]);
        } else {
          expect(row.coDispositorKey).toBeUndefined();
        }
      }
    }
  });

  it('a planet in its own sign has no co-dispositor, and one in Scorpio under both has the other ruler', () => {
    // The Sun in Leo (its own sign, ruled by no one else) and the Moon in Scorpio.
    const chart: ChartData = {
      ...natal,
      positions: natal.positions.map((p) =>
        keyOf(p.body) === 'sun' ? { ...p, longitude: 135 } : keyOf(p.body) === 'moon' ? { ...p, longitude: 225 } : p,
      ),
    };
    const rows = dispositorRows(chart, {}, 'both');
    const sun = rows.find((r) => r.bodyKey === 'sun');
    const moon = rows.find((r) => r.bodyKey === 'moon');
    expect(sun?.chain).toEqual(['sun']);
    expect(sun?.coDispositorKey).toBeUndefined();
    // Under both the chain follows the modern ruler (Pluto) and Mars is the co-dispositor.
    expect(moon?.chain[1]).toBe('pluto');
    expect(moon?.coDispositorKey).toBe('mars');
    // Under modern and traditional there is never a co-dispositor.
    for (const choice of ['modern', 'traditional'] as const) {
      expect(dispositorRows(chart, {}, choice).every((r) => r.coDispositorKey === undefined)).toBe(true);
    }
  });

  it('the almuten of the Ascendant is still chosen among the seven classical planets', () => {
    const almuten = almutenOfAscendant(natal, 'modern');
    expect(almuten?.almutens.length).toBeGreaterThan(0);
    for (const key of almuten?.almutens ?? []) {
      expect(['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn']).toContain(key);
    }
  });
});

describe('the report’s chart-ruler section follows the choice (#426)', () => {
  /** Natal chart with the Ascendant moved into Scorpio, the Ascendant's sign being what the section reads. */
  const scorpioRising = (): ChartData => ({ ...natal, houses: { ...natal.houses, ascendant: 215 } });
  const section = (choice: 'modern' | 'traditional' | 'both') =>
    assembleReport(scorpioRising(), 'en', [], choice).sections.find((s) => s.id === 'chart-ruler');
  const rulerBodies = (choice: 'modern' | 'traditional' | 'both'): string[] =>
    (section(choice)?.paragraphs ?? []).flatMap((p) =>
      p.placement?.category === 'planet-in-sign' ? [p.placement.body] : [],
    );

  it('names Pluto for Scorpio rising under modern, Mars under traditional, and both under both', () => {
    expect(rulerBodies('modern')).toEqual(['pluto']);
    expect(rulerBodies('traditional')).toEqual(['mars']);
    expect(rulerBodies('both')).toEqual(['mars', 'pluto']);
  });

  it('is modern by default', () => {
    const byDefault = assembleReport(scorpioRising(), 'en', []).sections.find((s) => s.id === 'chart-ruler');
    expect(byDefault).toEqual(section('modern'));
  });

  it('says so, in words, when there are two rulers, and the chain follows the modern one', () => {
    const texts = (section('both')?.paragraphs ?? []).map((p) => p.text);
    expect(texts.some((t) => t.includes('two rulers') && t.includes('Mars and Pluto'))).toBe(true);
    expect(texts.some((t) => t.includes('follows the modern ruler'))).toBe(true);
    expect((section('modern')?.paragraphs ?? []).some((p) => p.text.includes('two rulers'))).toBe(false);
  });

  it('says the same in Dutch', () => {
    const dutch = assembleReport(scorpioRising(), 'nl', [], 'both').sections.find((s) => s.id === 'chart-ruler');
    expect((dutch?.paragraphs ?? []).some((p) => p.text.includes('twee heersers'))).toBe(true);
  });

  it('still starts the dispositor chain at the Ascendant’s ruler, by the same choice', () => {
    for (const choice of ['modern', 'traditional'] as const) {
      const chain = (section(choice)?.paragraphs ?? []).find((p) => p.text.startsWith('Dispositor chain'));
      const first = choice === 'modern' ? 'Pluto' : 'Mars';
      expect(chain?.text).toContain('chain: ' + first);
    }
  });
});

/**
 * #468's own question: does the rulership choice reach the *standard* (non-AI) report's prose at
 * all, beyond the chart-ruler section covered above — and if so, where exactly, and where
 * deliberately not? Settled against a real chart with Pluto actually in Scorpio (no synthetic
 * fixture needed, same chart as the "differ between modern and traditional" case above).
 */
describe('the dignities-sect section follows the choice, and nothing else does (#468)', () => {
  const PLUTO_IN_SCORPIO_BIRTH = { ...BIRTH, civil: { ...BIRTH.civil, year: 1990, month: 6, day: 15 } };

  it('gives Pluto a dignity-state paragraph under modern/both, and none under traditional', async () => {
    const engine = await getEngine();
    const paragraphFor = async (choice: 'modern' | 'traditional' | 'both') => {
      const chart = await computeChartData(PLUTO_IN_SCORPIO_BIRTH, engine, { rulership: choice });
      const report = assembleReport(chart, 'en', [], choice);
      const section = report.sections.find((s) => s.id === 'dignities-sect');
      return section?.paragraphs.find((p) => p.placement?.category === 'dignity-state' && p.placement.body === 'pluto');
    };
    // Traditional only ever recognizes the seven classical planets as dignity holders, so Pluto
    // is peregrine (no state, no paragraph) there, whatever sign it's in.
    expect((await paragraphFor('traditional'))?.placement).toBeUndefined();
    // Under modern and both, Pluto rules Scorpio, so it gets a 'ruler' dignity-state paragraph.
    for (const choice of ['modern', 'both'] as const) {
      expect((await paragraphFor(choice))?.placement).toEqual({
        category: 'dignity-state',
        body: 'pluto',
        state: 'ruler',
      });
    }
  });

  it('does not let dignity change the ordinary planet-in-sign/-house/aspect-pair prose', async () => {
    const engine = await getEngine();
    const reportTextFor = async (choice: 'modern' | 'traditional' | 'both') => {
      const chart = await computeChartData(PLUTO_IN_SCORPIO_BIRTH, engine, { rulership: choice });
      const report = assembleReport(chart, 'en', [], choice);
      // Every section except chart-ruler and dignities-sect, which are the only two #468 found
      // to be rulership-sensitive (chart-ruler via a fresh ruler lookup, dignities-sect by
      // reading the chart's own already-scheme-aware `dignities` map).
      return report.sections
        .filter((s) => s.id !== 'chart-ruler' && s.id !== 'dignities-sect')
        .flatMap((s) => s.paragraphs.map((p) => p.text))
        .join('\n');
    };
    const modern = await reportTextFor('modern');
    const traditional = await reportTextFor('traditional');
    const both = await reportTextFor('both');
    expect(modern).toBe(traditional);
    expect(modern).toBe(both);
  });
});
