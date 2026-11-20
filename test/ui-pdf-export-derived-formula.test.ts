// @vitest-environment jsdom
/**
 * The PDF Derived points formula column names the formula each section was calculated with (#1794). Draconic and
 * composite are calculated without the Extended-settings formula, so they name the default even under the modern
 * setting; a natal section names the chosen one. Real Swiss Ephemeris, no mocks.
 */
import { describe, expect, it } from 'vitest';
import { lotFormulaFor } from '../src/astrology/arabic-parts.js';
import { DEFAULT_RULERSHIP_CHOICE } from '../src/astrology/rulership.js';
import { DEFAULT_EXTENDED_SETTINGS, type ExtendedSettings } from '../src/chart/extended-settings.js';
import { EMPTY_SELECTION, type PdfSelection } from '../src/domain/pdf-export-sections.js';
import type { Person } from '../src/domain/person.js';
import { chartViewMessages } from '../src/ui/ChartView.messages.js';
import { buildPdfPlan, type PdfPlanContext } from '../src/ui/pdf-export-plan.js';
import { pdfExportMessages } from '../src/ui/pdf-export.messages.js';
import { getEngine } from './engine-harness.js';

/** A London night birth (02:30, June): the Part of Fortune formula changes the value here. */
const NIGHT: Person = {
  id: 'p-night',
  displayName: 'Night Born',
  moment: {
    civil: { year: 1990, month: 6, day: 15, hour: 2, minute: 30, second: 0 },
    coordinates: { latitude: 51.5072, longitude: -0.1276 },
    offsetOverrideMinutes: 0,
  },
  placeLabel: 'London, UK',
  timeAccuracy: 'recorded',
  notes: '',
  missing: [],
};

const PARTNER: Person = {
  id: 'p-partner',
  displayName: 'Partner',
  moment: {
    civil: { year: 1992, month: 3, day: 3, hour: 14, minute: 0, second: 0 },
    coordinates: { latitude: 48.8566, longitude: 2.3522 },
    offsetOverrideMinutes: 60,
  },
  placeLabel: 'Paris, FR',
  timeAccuracy: 'recorded',
  notes: '',
  missing: [],
};

const PEOPLE = new Map([
  [NIGHT.id, NIGHT],
  [PARTNER.id, PARTNER],
]);

// The Part of Fortune is off by default in the object policy, so the Derived points table would not list it at all;
// the test switches it on so the formula cell is there to read.
const FORTUNE_SHOWN: ExtendedSettings['objectPolicies'] = {
  ...DEFAULT_EXTENDED_SETTINGS.objectPolicies,
  partOfFortune: { ...DEFAULT_EXTENDED_SETTINGS.objectPolicies.partOfFortune, visible: true },
};
const MODERN_SETTINGS: ExtendedSettings = {
  ...DEFAULT_EXTENDED_SETTINGS,
  fortuneFormula: 'same-day-and-night',
  objectPolicies: FORTUNE_SHOWN,
};

const PAULUS_TEXT = formulaText(lotFormulaFor('part-of-fortune', 'sect-reversed'));
const MODERN_TEXT = formulaText(lotFormulaFor('part-of-fortune', 'same-day-and-night'));

function formulaText(formula: { readonly dayFormula: string; readonly nightFormula: string } | undefined): string {
  return `${formula?.dayFormula} / ${formula?.nightFormula}`;
}

/** The Part of Fortune's formula cell, from the Derived points table of the section's own plan. */
async function fortuneFormulaCell(selection: PdfSelection, settings: ExtendedSettings): Promise<string> {
  const context: PdfPlanContext = {
    person: NIGHT,
    people: PEOPLE,
    provider: await getEngine(),
    settings,
    rulership: DEFAULT_RULERSHIP_CHOICE,
    locale: 'en',
  };
  const plan = await buildPdfPlan(selection, context, chartViewMessages.en, pdfExportMessages.en);
  expect(plan.errors).toHaveLength(0);
  const [section] = plan.sections;
  if (section?.kind !== 'chart') throw new Error('expected a chart section');
  const table = section.tables.find((candidate) => candidate.caption === chartViewMessages.en.derivedPointsCaption);
  if (table === undefined) throw new Error('expected the Derived points table');
  const formulaIndex = table.head.indexOf(chartViewMessages.en.lotFormulaLabel);
  const fortuneRow = table.body.find((row) => row[0]?.includes('Fortune'));
  if (fortuneRow === undefined || formulaIndex < 0) throw new Error('expected a Part of Fortune row');
  return fortuneRow[formulaIndex] ?? '';
}

describe('PDF derived points formula follows the calculation (#1794)', () => {
  it('a night draconic section names the default formula under the modern setting', async () => {
    const cell = await fortuneFormulaCell(
      { personId: NIGHT.id, ...EMPTY_SELECTION, charts: [{ type: 'draconic', wheel: false, tables: ['derived'] }] },
      MODERN_SETTINGS,
    );
    expect(cell).toBe(PAULUS_TEXT);
  });

  it('a night composite section names the default formula under the modern setting', async () => {
    const cell = await fortuneFormulaCell(
      {
        personId: NIGHT.id,
        ...EMPTY_SELECTION,
        composite: { partnerId: PARTNER.id, wheel: false, tables: ['derived'] },
      },
      MODERN_SETTINGS,
    );
    expect(cell).toBe(PAULUS_TEXT);
  });

  it('a night natal section names the modern formula under the modern setting', async () => {
    const cell = await fortuneFormulaCell(
      { personId: NIGHT.id, ...EMPTY_SELECTION, charts: [{ type: 'natal', wheel: false, tables: ['derived'] }] },
      MODERN_SETTINGS,
    );
    expect(cell).toBe(MODERN_TEXT);
  });
});
