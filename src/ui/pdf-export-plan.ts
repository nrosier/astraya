/**
 * The PDF export builder's plan (#441): turns a `PdfSelection` (what the user ticked, with each
 * section's own options) into a `PdfPlan` — the ordered content of the document, built from the same
 * domain compute functions and the same table-column definitions the on-screen chart uses.
 *
 * Deliberately free of jsPDF/svg2pdf.js/jspdf-autotable — not just as a style preference, but because
 * svg2pdf.js's own build fails to load under Vitest/Node at all (its UMD entry point reaches for a
 * global `jsPDF` that only exists in a real browser's module graph), so importing it at this file's
 * top level would make every test importing anything from here fail before a single assertion runs.
 * `pdf-export-render.ts` holds that half and is covered by Playwright instead, which runs a real
 * browser. A table's cells are already plain strings by the time `buildPdfPlan` returns, converted
 * from each screen's own `TableColumn` definitions the same way a CSV download already does
 * (`TableColumn.render`, falling back to `String(valueOf(row))`), so no generic row type, and nothing
 * jsPDF-shaped, ever has to cross from this file into that one.
 */
import { bodyById } from '../astrology/bodies.js';
import type { RulershipChoice } from '../astrology/rulership.js';
import {
  housesAreDefined,
  computeChartData,
  type ChartCalculationOptions,
  type ChartData,
} from '../domain/chart-compute.js';
import { computeDraconic } from '../domain/draconic.js';
import { computeHarmonic } from '../domain/harmonic.js';
import { computeSolarReturnChart, computeLunarReturnChart } from '../domain/return-chart.js';
import {
  almutenOfAscendant,
  angleRows,
  antisciaRows,
  chartWheelRing,
  crossAspectRows,
  declinationContactRows,
  derivedPointRows,
  dignityRows,
  dispositorRows,
  fixedStarRows,
  houseCuspRows,
  positionRows,
  aspectRows,
  chartSheetInput,
  type AspectRow,
} from '../domain/chart-tables.js';
import { computeComposite } from '../domain/composite.js';
import {
  type PdfChartSectionOptions,
  type PdfChartTable,
  type PdfCompositeSectionOptions,
  type PdfSelection,
  type PdfSynastrySectionOptions,
} from '../domain/pdf-export-sections.js';
import type { Person } from '../domain/person.js';
import { computeSynastry, rankedSynastryAspects } from '../domain/synastry.js';
import { renderChartSheetSvg } from '../chart/chart-sheet.js';
import { renderMultiWheelSvg, type CrossRingAspects } from '../chart/multi-wheel.js';
import { standaloneSvg } from '../chart/standalone-svg.js';
import { resolveWheelDisplayOptions } from '../chart/wheel-options.js';
import type { EphemerisProvider } from '../ephemeris/types.js';
import type { CorpusEntry, Locale } from '../interpretation/schema.js';
import type { BirthMomentInput } from '../time/types.js';
import { assembleReport } from '../interpretation/report.js';
import { loadRuntimeCorpus } from '../interpretation/corpus-client.js';
import { generateTier2Interpretation, toTier2ChartPayload } from '../interpretation/tier2-client.js';
import {
  angleColumns,
  antisciaColumns,
  aspectColumns,
  declinationColumns,
  derivedPointColumns,
  dignityColumns,
  dispositorColumns,
  fixedStarColumns,
  houseCuspColumns,
  positionColumns,
} from './ChartView.js';
import type { chartViewMessages } from './ChartView.messages.js';
import type { pdfExportMessages } from './pdf-export.messages.js';
import { bodyDisplayName, bodyShortName } from './astro-names.messages.js';
import { formatCoordinate } from './format.js';
import { relationshipSummaryParagraphs } from './relationship-summary-pdf-text.js';
import { aspectColumns as synastryAspectColumns } from './SynastryView.js';
import { synastryViewMessages } from './SynastryView.messages.js';
import { synastryText } from './synastry-text.js';
import type { TableColumn } from './table-sort.js';

/** A table reduced to plain strings — the same conversion a CSV download already does for every cell. */
export interface PdfTablePlan {
  readonly caption: string;
  readonly head: readonly string[];
  readonly body: readonly (readonly string[])[];
}

export interface PdfChartSectionPlan {
  readonly kind: 'chart';
  readonly heading: string;
  readonly svg?: { readonly markup: string; readonly width: number; readonly height: number };
  readonly hint?: string;
  readonly tables: readonly PdfTablePlan[];
}

export interface PdfTextSectionPlan {
  readonly kind: 'text';
  readonly heading: string;
  readonly paragraphs: readonly string[];
}

export interface PdfFieldsSectionPlan {
  readonly kind: 'fields';
  readonly heading: string;
  readonly fields: readonly { readonly label: string; readonly value: string }[];
}

export type PdfSectionPlan = PdfChartSectionPlan | PdfTextSectionPlan | PdfFieldsSectionPlan;

export interface PdfPlan {
  readonly title: string;
  readonly personName: string;
  readonly generatedAt: Date;
  readonly sections: readonly PdfSectionPlan[];
  /** A section the user ticked that could not be built, named, so one failure does not take down the rest. */
  readonly errors: readonly string[];
}

export interface PdfPlanContext {
  readonly person: Person;
  readonly provider: EphemerisProvider;
  readonly rulership: RulershipChoice;
  readonly locale: Locale;
  /** Spent on this one build, per `generateTier2Interpretation`'s own consent rule (ADR 0003) — never a standing preference. */
  readonly aiConsent: boolean;
  /** Injectable for the same reason `corpus-client.ts`'s own `fetchImpl` is — testability without a real network. */
  readonly corpusFetch?: typeof fetch;
  /** Every stored person, so a synastry/composite section's own `partnerId` can be resolved; absent (or missing the id) if neither section is in the selection. */
  readonly people?: ReadonlyMap<string, Person>;
}

function tablePlanOf<T>(caption: string, columns: readonly TableColumn<T>[], rows: readonly T[]): PdfTablePlan {
  return {
    caption,
    head: columns.map((column) => column.label),
    body: rows.map((row) => columns.map((column) => column.render?.(row) ?? String(column.valueOf(row)))),
  };
}

function birthFieldsPlan(person: Person, locale: Locale, t: typeof pdfExportMessages.en): PdfFieldsSectionPlan {
  const moment = person.moment;
  const civil = moment?.civil;
  const pad = (n: number): string => String(n).padStart(2, '0');
  const fields: { readonly label: string; readonly value: string }[] = [];
  if (civil !== undefined) {
    fields.push({
      label: t.dateLabel,
      value: `${String(civil.year)}-${pad(civil.month)}-${pad(civil.day)} ${pad(civil.hour)}:${pad(civil.minute)}`,
    });
  }
  if (person.placeLabel !== '') fields.push({ label: t.placeLabel, value: person.placeLabel });
  if (moment !== undefined) {
    fields.push({
      label: t.coordinatesLabel,
      value: `${formatCoordinate(moment.coordinates.latitude, 'lat', locale)}, ${formatCoordinate(moment.coordinates.longitude, 'lon', locale)}`,
    });
  }
  fields.push({ label: t.timeAccuracyLabel, value: t.timeAccuracyValues[person.timeAccuracy] });
  return { kind: 'fields', heading: t.birthRecordLabel, fields };
}

function tablesOf(
  data: ChartData,
  table: PdfChartTable,
  housesRenderable: boolean,
  t: typeof chartViewMessages.en,
  locale: Locale,
  rulership: RulershipChoice,
): readonly PdfTablePlan[] {
  if ((table === 'houses' || table === 'derived') && !housesRenderable) return [];
  switch (table) {
    case 'positions':
      return [tablePlanOf(t.positionsCaption, positionColumns(t, locale, 'drawn'), positionRows(data, {}, true))];
    case 'houses':
      return [
        tablePlanOf(t.housesCaption, houseCuspColumns(t, locale), houseCuspRows(data)),
        tablePlanOf(t.anglesCaption, angleColumns(t, locale), angleRows(data, {})),
      ];
    case 'aspects': {
      const antiscion = antisciaRows(data);
      const declinations = declinationContactRows(data);
      const stars = fixedStarRows(data, {});
      return [
        tablePlanOf(t.aspectsCaption, aspectColumns(t, locale), aspectRows(data)),
        ...(antiscion.length === 0 ? [] : [tablePlanOf(t.antisciaCaption, antisciaColumns(t, locale), antiscion)]),
        ...(declinations.length === 0
          ? []
          : [tablePlanOf(t.declinationsCaption, declinationColumns(t, locale), declinations)]),
        ...(stars.length === 0 ? [] : [tablePlanOf(t.fixedStarsCaption, fixedStarColumns(t, locale), stars)]),
      ];
    }
    case 'dignities':
      return [
        tablePlanOf(t.dignitiesCaption, dignityColumns(t, locale), dignityRows(data, {}, rulership)),
        tablePlanOf(t.dispositorsCaption, dispositorColumns(t, locale), dispositorRows(data, {}, rulership)),
      ];
    case 'derived':
      return [tablePlanOf(t.derivedPointsCaption, derivedPointColumns(t, locale), derivedPointRows(data, {}))];
  }
}

function chartTypeLabel(type: PdfChartSectionOptions['type'], t: typeof pdfExportMessages.en): string {
  return t.chartTypeLabels[type];
}

/** Computes the one `ChartData` a chart section's own options name — the same compute functions the Charts page uses. */
async function computeSectionChartData(
  options: PdfChartSectionOptions,
  person: Person,
  provider: EphemerisProvider,
  rulership: RulershipChoice,
): Promise<ChartData> {
  if (person.moment === undefined) throw new Error('this person has no complete birth record');
  const calcOptions: ChartCalculationOptions = { rulership };
  const place = options.place === undefined ? undefined : { ...options.place, altitude: 0 };
  switch (options.type) {
    case 'natal':
      return computeChartData(person.moment, provider, calcOptions);
    case 'draconic':
      return (await computeDraconic(person.moment, provider, calcOptions)).draconic;
    case 'harmonic':
      return (await computeHarmonic(person.moment, options.harmonicN ?? 5, provider, calcOptions)).harmonic;
    case 'solar-return': {
      const result = await computeSolarReturnChart(
        person.moment,
        options.returnYear ?? new Date().getFullYear(),
        provider,
        { ...calcOptions, ...(place === undefined ? {} : { place }) },
      );
      return result.chart;
    }
    case 'lunar-return': {
      const fromDate = options.returnFromDate ?? new Date().toISOString().slice(0, 10);
      const [y, m, d] = fromDate.split('-').map(Number);
      const fromJd = await provider.julianDay(y ?? 2000, m ?? 1, d ?? 1, 0);
      const result = await computeLunarReturnChart(person.moment, fromJd, provider, {
        ...calcOptions,
        ...(place === undefined ? {} : { place }),
      });
      return result.chart;
    }
  }
}

async function buildChartSectionPlan(
  options: PdfChartSectionOptions,
  context: PdfPlanContext,
  t: typeof chartViewMessages.en,
  pt: typeof pdfExportMessages.en,
): Promise<PdfChartSectionPlan> {
  const { person, provider, rulership, locale } = context;
  const data = await computeSectionChartData(options, person, provider, rulership);
  const label = chartTypeLabel(options.type, pt);
  const heading = `${label}${person.displayName === '' ? '' : ` — ${person.displayName}`}`;
  const housesRenderable = housesAreDefined(data.houses);

  let svg: PdfChartSectionPlan['svg'];
  if (options.wheel && housesRenderable) {
    const sheet = renderChartSheetSvg(
      chartSheetInput(data, [heading], label, {}, (bodyKey) => bodyShortName(bodyKey, locale)),
      { ...resolveWheelDisplayOptions({}) },
    );
    svg = { markup: standaloneSvg(sheet.markup), width: sheet.width, height: sheet.height };
  }

  const almuten = almutenOfAscendant(data, rulership);
  const hint =
    almuten === undefined
      ? undefined
      : t.almutenOfAscendantSentence(almuten.almutens.map((key) => bodyDisplayName(key, locale)).join(', '));

  const tables = options.tables.flatMap((table) => tablesOf(data, table, housesRenderable, t, locale, rulership));

  return {
    kind: 'chart',
    heading,
    ...(svg === undefined ? {} : { svg }),
    ...(hint === undefined ? {} : { hint }),
    tables,
  };
}

const bodyKeyOf = (id: number): string => bodyById(id)?.key ?? String(id);

/** The second person a synastry/composite section names, resolved against every stored person (#441). */
function resolvePartner(partnerId: string, context: PdfPlanContext): Person & { readonly moment: BirthMomentInput } {
  const partner = context.people?.get(partnerId);
  if (partner === undefined) throw new Error('the chosen partner could not be found');
  if (partner.moment === undefined || partner.timeAccuracy === 'unknown') {
    throw new Error('the chosen partner has no complete, known-time birth record');
  }
  return { ...partner, moment: partner.moment };
}

async function buildSynastrySectionPlan(
  options: PdfSynastrySectionOptions,
  context: PdfPlanContext,
  pt: typeof pdfExportMessages.en,
): Promise<readonly PdfSectionPlan[]> {
  const { person, provider, locale, corpusFetch } = context;
  if (person.moment === undefined) throw new Error('this person has no complete birth record');
  const partner = resolvePartner(options.partnerId, context);
  // Safe: both just checked above.
  const momentA = person.moment;
  const momentB = partner.moment;
  const st = synastryViewMessages[locale];
  const data = await computeSynastry(momentA, momentB, provider);
  const nameA = person.displayName || st.personALabel;
  const nameB = partner.displayName || st.personBLabel;
  const heading = `${pt.synastryLabel} — ${nameA} / ${nameB}`;

  let svg: PdfChartSectionPlan['svg'];
  if (options.wheel) {
    const ringA = chartWheelRing(data.chartA, nameA);
    const ringB = chartWheelRing(data.chartB, nameB);
    // Same reasoning SynastryView.tsx's own wheel gives: `outerRingIndex`/`innerRingIndex` name
    // which side of the aspect a ring resolves, not radius order — chartA is "outer" here even
    // though it is drawn as ring 0.
    const crossAspects: readonly CrossRingAspects[] = [{ outerRingIndex: 0, innerRingIndex: 1, aspects: data.aspects }];
    const markup = renderMultiWheelSvg([ringA, ringB], crossAspects);
    svg = { markup: standaloneSvg(markup), width: 800, height: 800 };
  }

  const tables: PdfTablePlan[] = [];
  if (options.aspectsTable) {
    const corpus = await loadRuntimeCorpus(locale, corpusFetch ?? fetch).catch((): readonly CorpusEntry[] => []);
    const ranked = rankedSynastryAspects(data);
    const importanceByRow = new Map(
      ranked.map(({ aspect, importance }) => [
        `${bodyKeyOf(aspect.bodyA)}-${aspect.aspect.key}-${bodyKeyOf(aspect.bodyB)}`,
        importance,
      ]),
    );
    const importanceOf = (row: AspectRow): number =>
      importanceByRow.get(`${row.bodyAKey}-${row.aspectKey}-${row.bodyBKey}`) ?? 0;
    const interpretationOf = (row: AspectRow): string => {
      const { text, speaksFrom } = synastryText(row, locale, corpus);
      const name = speaksFrom === 'a' ? nameA : speaksFrom === 'b' ? nameB : undefined;
      return speaksFrom === undefined || name === undefined ? text : `${st.seenFromSide(name)}${text}`;
    };
    const rows = crossAspectRows(ranked.map((r) => r.aspect));
    tables.push(
      tablePlanOf(st.aspectsCaption, synastryAspectColumns(st, locale, interpretationOf, importanceOf), rows),
    );
  }

  const sections: PdfSectionPlan[] = [
    {
      kind: 'chart',
      heading,
      ...(svg === undefined ? {} : { svg }),
      tables,
    },
  ];

  if (options.relationshipSummary) {
    sections.push({
      kind: 'text',
      heading: `${pt.relationshipSummaryLabel} — ${nameA} / ${nameB}`,
      paragraphs: relationshipSummaryParagraphs(data, nameA, nameB, locale),
    });
  }

  return sections;
}

async function buildCompositeSectionPlan(
  options: PdfCompositeSectionOptions,
  context: PdfPlanContext,
  t: typeof chartViewMessages.en,
  pt: typeof pdfExportMessages.en,
): Promise<PdfChartSectionPlan> {
  const { person, provider, rulership, locale } = context;
  if (person.moment === undefined) throw new Error('this person has no complete birth record');
  const partner = resolvePartner(options.partnerId, context);
  const momentA = person.moment;
  const momentB = partner.moment;
  const nameA = person.displayName || pt.unnamedOption;
  const nameB = partner.displayName || pt.unnamedOption;
  const { composite: data } = await computeComposite(momentA, momentB, provider, { rulership });
  const heading = `${pt.compositeLabel} — ${nameA} / ${nameB}`;
  const housesRenderable = housesAreDefined(data.houses);

  let svg: PdfChartSectionPlan['svg'];
  if (options.wheel && housesRenderable) {
    const sheet = renderChartSheetSvg(
      chartSheetInput(data, [heading], pt.compositeLabel, {}, (bodyKey) => bodyShortName(bodyKey, locale)),
      { ...resolveWheelDisplayOptions({}) },
    );
    svg = { markup: standaloneSvg(sheet.markup), width: sheet.width, height: sheet.height };
  }

  const tables = options.tables.flatMap((table) => tablesOf(data, table, housesRenderable, t, locale, rulership));

  return {
    kind: 'chart',
    heading,
    ...(svg === undefined ? {} : { svg }),
    tables,
  };
}

async function buildInterpretationSections(
  selection: PdfSelection['interpretation'],
  context: PdfPlanContext,
  pt: typeof pdfExportMessages.en,
  errors: string[],
): Promise<readonly PdfTextSectionPlan[]> {
  const { person, provider, rulership, locale, corpusFetch } = context;
  if (person.moment === undefined || (!selection.base && !selection.aiCustomised)) return [];
  const chart = await computeChartData(person.moment, provider, { rulership });
  const sections: PdfTextSectionPlan[] = [];

  if (selection.base) {
    try {
      const corpus = await loadRuntimeCorpus(locale, corpusFetch ?? fetch);
      const report = assembleReport(chart, locale, corpus, rulership);
      for (const section of report.sections) {
        sections.push({ kind: 'text', heading: section.title, paragraphs: section.paragraphs.map((p) => p.text) });
      }
    } catch (error) {
      errors.push(`Interpretation (base): ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (selection.aiCustomised) {
    if (!context.aiConsent) {
      errors.push('Interpretation (AI-customised): skipped — not consented to for this build.');
    } else {
      try {
        const result = await generateTier2Interpretation({
          mode: 'freeform',
          chartData: toTier2ChartPayload(chart),
          locale,
        });
        sections.push({
          kind: 'text',
          heading: pt.aiNarrativeHeading,
          paragraphs: result.map((section) => `${section.heading}: ${section.body}`),
        });
      } catch (error) {
        errors.push(`Interpretation (AI-customised): ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  return sections;
}

/** Builds the ordered plan from a selection — no DOM, no jsPDF; safe to call under Node or a browser alike. */
export async function buildPdfPlan(
  selection: PdfSelection,
  context: PdfPlanContext,
  t: typeof chartViewMessages.en,
  pt: typeof pdfExportMessages.en,
): Promise<PdfPlan> {
  const { person } = context;
  const sections: PdfSectionPlan[] = [];
  const errors: string[] = [];

  if (selection.birthRecord) sections.push(birthFieldsPlan(person, context.locale, pt));

  sections.push(...(await buildInterpretationSections(selection.interpretation, context, pt, errors)));

  for (const chartOptions of selection.charts) {
    if (!chartOptions.wheel && chartOptions.tables.length === 0) continue;
    try {
      sections.push(await buildChartSectionPlan(chartOptions, context, t, pt));
    } catch (error) {
      errors.push(
        `${chartTypeLabel(chartOptions.type, pt)}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (
    selection.synastry !== undefined &&
    (selection.synastry.wheel || selection.synastry.aspectsTable || selection.synastry.relationshipSummary)
  ) {
    try {
      sections.push(...(await buildSynastrySectionPlan(selection.synastry, context, pt)));
    } catch (error) {
      errors.push(`${pt.synastryLabel}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (selection.composite !== undefined && (selection.composite.wheel || selection.composite.tables.length > 0)) {
    try {
      sections.push(await buildCompositeSectionPlan(selection.composite, context, t, pt));
    } catch (error) {
      errors.push(`${pt.compositeLabel}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    title: `${person.displayName || t.personFallback} — Astraya`,
    personName: person.displayName,
    generatedAt: new Date(),
    sections,
    errors,
  };
}
