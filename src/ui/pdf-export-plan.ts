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
/**
 * @module ui/pdf-export-plan
 * @purpose Builds the PDF export feature's (#441) ordered, declarative `PdfPlan` content tree from a user's `PdfSelection`, reusing the same domain compute functions and table-column definitions the on-screen chart/synastry/composite views use.
 * @conventions Deliberately free of jsPDF/svg2pdf.js/jspdf-autotable — svg2pdf.js's UMD entry fails to load under Vitest/Node, so any top-level import of it here would break every test importing this module; the rendering half using those libraries lives in pdf-export-render.ts instead, covered by Playwright. Table cells are reduced to plain strings via each table's `valueOf()` (never `render()`, which may return JSX), matching the existing CSV-download convention.
 * @exports PdfTablePlan, PdfChartSectionPlan, PdfTextSectionPlan, PdfFieldsSectionPlan, PdfSectionPlan, PdfPlan, PdfPlanContext, buildPdfPlan
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
import { computeTransit } from '../domain/transit.js';
import { computePeriodicTransitForecast, type PeriodicTransitPeriods } from '../domain/periodic-transit.js';
import {
  type PdfChartSectionOptions,
  type PdfChartTable,
  type PdfCompositeSectionOptions,
  type PdfForecastSectionOptions,
  type PdfSelection,
  type PdfSynastrySectionOptions,
  type PdfTransitsSectionOptions,
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
  chartRulerKeysOf,
  filterTransits,
  rankTransits,
  transitPreset,
  TRANSIT_ORB_CONFIG,
  type TransitRuleContext,
} from '../astrology/transit-importance.js';
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
import { contactColumns as transitContactColumns } from './TransitView.js';
import { transitViewMessages } from './TransitView.messages.js';
import { EVERY_BODY_KEY } from './TransitFilterPanel.js';
import {
  contactColumns as forecastContactColumns,
  contactRows as forecastContactRows,
  exactEventColumns as forecastExactEventColumns,
  exactEventRows as forecastExactEventRows,
  formatUtc as forecastFormatUtc,
  localizedSignName as forecastLocalizedSignName,
  signHouseLabel as forecastSignHouseLabel,
  stationColumns as forecastStationColumns,
  stationRows as forecastStationRows,
} from './PeriodicTransitView.js';
import { periodicTransitViewMessages } from './PeriodicTransitView.messages.js';
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
    // Plain-text extraction for PDF uses valueOf() only, never render() — the latter returns JSX that
    // can't be stringified safely (e.g. the dispositor chain's → symbol becomes corrupted). valueOf() is
    // the authoritative textual representation, already passed through a TextFilter when needed (see
    // table-sort.ts); render() is visual layout for the live table and may include React elements (#447).
    body: rows.map((row) => columns.map((column) => String(column.valueOf(row)))),
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

/** The two-level filter the issue decided on, turned into the full `TransitFilter` `filterTransits`/`rankTransits` take — `transitPreset` already does this for every richer preset `TransitFilterPanel.tsx` offers. */
function transitRulesFor(
  natal: ChartData,
  rulership: RulershipChoice,
  context: TransitRuleContext['context'],
): TransitRuleContext {
  return {
    everyBodyKey: EVERY_BODY_KEY,
    context,
    chartRulerKeys: housesAreDefined(natal.houses) ? chartRulerKeysOf(natal.houses.ascendant, rulership) : undefined,
  };
}

/** Resolves a section's own `asOfDate` (unset means "today, at build time" — see `pdf-export-sections.ts`) into a target Julian day at noon, the same anchor `TransitView.tsx`/`PeriodicTransitView.tsx` use for their own "as of" date picker. */
async function targetJdOf(asOfDate: string | undefined, provider: EphemerisProvider): Promise<number> {
  const [y, m, d] = (asOfDate ?? new Date().toISOString().slice(0, 10)).split('-').map(Number);
  return provider.julianDayFromUtc(y ?? 2000, m ?? 1, d ?? 1, 12, 0, 0);
}

/** The Transits section's own place in the export: `TransitView.tsx`'s bi-wheel and single contacts table, as of a chosen date (#441). */
async function buildTransitsSectionPlan(
  options: PdfTransitsSectionOptions,
  context: PdfPlanContext,
  pt: typeof pdfExportMessages.en,
): Promise<PdfChartSectionPlan> {
  const { person, provider, rulership, locale } = context;
  if (person.moment === undefined) throw new Error('this person has no complete birth record');
  const vt = transitViewMessages[locale];
  const targetJd = await targetJdOf(options.asOfDate, provider);
  const data = await computeTransit(person.moment, targetJd, provider, { rulership }, TRANSIT_ORB_CONFIG);
  const rules = transitRulesFor(data.natal, rulership, 'daily');
  const filter = transitPreset(options.filterPreset, rules);
  const shown = rankTransits(filterTransits(data.contacts, filter), filter, rules.chartRulerKeys);
  const heading = `${pt.transitsLabel}${person.displayName === '' ? '' : ` — ${person.displayName}`}`;

  let svg: PdfChartSectionPlan['svg'];
  if (options.wheel) {
    const natalRing = chartWheelRing(data.natal, vt.natalLabel);
    const transitRing = chartWheelRing(data.transit, vt.transitRingLabel);
    const crossAspects: readonly CrossRingAspects[] = [{ innerRingIndex: 0, outerRingIndex: 1, aspects: shown }];
    const markup = renderMultiWheelSvg([natalRing, transitRing], crossAspects);
    svg = { markup: standaloneSvg(markup), width: 800, height: 800 };
  }

  const tables: PdfTablePlan[] = [];
  if (options.aspectsTable) {
    tables.push(tablePlanOf(vt.contactsCaption, transitContactColumns(vt, locale), crossAspectRows(shown)));
  }

  return { kind: 'chart', heading, ...(svg === undefined ? {} : { svg }), tables };
}

/** The Forecast section's own place in the export: `PeriodicTransitView.tsx`'s daily/weekly/monthly/yearly
 * tiers, each independently on/off (#441). The fifth, user-picked planetary-return tier is left out of this
 * slice — it needs an extra body choice the issue does not name, see the issue comment for the follow-up. */
async function buildForecastSectionPlan(
  options: PdfForecastSectionOptions,
  context: PdfPlanContext,
): Promise<readonly PdfSectionPlan[]> {
  const { person, provider, rulership, locale } = context;
  if (person.moment === undefined) throw new Error('this person has no complete birth record');
  const ft = periodicTransitViewMessages[locale];
  const asOfDate = options.asOfDate ?? new Date().toISOString().slice(0, 10);
  const [yearPart, monthPart, dayPart] = asOfDate.split('-').map(Number);
  const year = yearPart ?? new Date().getFullYear();
  const month = monthPart ?? 1;
  const day = dayPart ?? 1;
  const dayJd = await provider.julianDayFromUtc(year, month, day, 12, 0, 0);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextMonthYear = month === 12 ? year + 1 : year;
  const [monthFromJd, monthToJd] = await Promise.all([
    provider.julianDayFromUtc(year, month, 1, 0, 0, 0),
    provider.julianDayFromUtc(nextMonthYear, nextMonth, 1, 0, 0, 0),
  ]);
  const periods: PeriodicTransitPeriods = { dayJd, monthFromJd, monthToJd, year };
  const data = await computePeriodicTransitForecast(person.moment, periods, provider, { rulership });
  const rules = transitRulesFor(data.natal, rulership, 'yearly');
  const filter = transitPreset(options.filterPreset, rules);
  const shownOf = (contacts: typeof data.daily.moonAspects): typeof data.daily.moonAspects =>
    rankTransits(filterTransits(contacts, filter), filter, rules.chartRulerKeys);

  const sections: PdfSectionPlan[] = [];
  const namePart = person.displayName === '' ? '' : ` — ${person.displayName}`;

  if (options.daily) {
    const tables: PdfTablePlan[] = [];
    const moonAspects = shownOf(data.daily.moonAspects);
    if (moonAspects.length > 0) {
      tables.push(
        tablePlanOf(ft.moonAspectsCaption, forecastContactColumns(ft), forecastContactRows(moonAspects, locale)),
      );
    }
    if (data.daily.exactToday.length > 0) {
      tables.push(
        tablePlanOf(
          ft.exactTodayCaption,
          forecastExactEventColumns(ft),
          forecastExactEventRows(data.daily.exactToday, ft, locale),
        ),
      );
    }
    if (data.daily.stationsToday.length > 0) {
      tables.push(
        tablePlanOf(
          ft.stationsTodayCaption,
          forecastStationColumns(ft),
          forecastStationRows(data.daily.stationsToday, ft, locale),
        ),
      );
    }
    const hint = `${ft.moonInLabel} ${forecastSignHouseLabel(data.daily.moon.sign, data.daily.moon.house, locale, ft)}`;
    sections.push({ kind: 'chart', heading: `${ft.dailyHeading}${namePart}`, hint, tables });
  }

  if (options.weekly) {
    const tables: PdfTablePlan[] = [];
    if (data.weekly.events.length > 0) {
      tables.push(
        tablePlanOf(
          ft.exactThisWeekCaption,
          forecastExactEventColumns(ft),
          forecastExactEventRows(data.weekly.events, ft, locale),
        ),
      );
    }
    data.weekly.lunarReturns.returns.forEach((lunarReturn, index) => {
      const shown = shownOf(lunarReturn.contacts);
      if (shown.length > 0) {
        tables.push(
          tablePlanOf(
            `${ft.lunarReturnContactsCaption} (${String(index + 1)})`,
            forecastContactColumns(ft),
            forecastContactRows(shown, locale),
          ),
        );
      }
    });
    sections.push({ kind: 'chart', heading: `${ft.weeklyHeading}${namePart}`, tables });
  }

  if (options.monthly) {
    const tables: PdfTablePlan[] = [];
    if (data.monthly.events.length > 0) {
      tables.push(
        tablePlanOf(
          ft.exactThisMonthCaption,
          forecastExactEventColumns(ft),
          forecastExactEventRows(data.monthly.events, ft, locale),
        ),
      );
    }
    const progressed = shownOf(data.monthly.progressedLunarReturn.contacts);
    if (progressed.length > 0) {
      tables.push(
        tablePlanOf(
          ft.progressedLunarReturnContactsCaption,
          forecastContactColumns(ft),
          forecastContactRows(progressed, locale),
        ),
      );
    }
    const hint = ft.sunInThisMonth(
      forecastSignHouseLabel(data.monthly.sun.sign, data.monthly.sun.house, locale, ft),
      forecastFormatUtc(data.monthly.fromJd),
      forecastFormatUtc(data.monthly.toJd),
    );
    sections.push({ kind: 'chart', heading: `${ft.monthlyHeading}${namePart}`, hint, tables });
  }

  if (options.yearly) {
    const tables: PdfTablePlan[] = [];
    const solar = shownOf(data.yearly.solarReturn.contacts);
    if (solar.length > 0) {
      tables.push(
        tablePlanOf(ft.solarReturnContactsCaption, forecastContactColumns(ft), forecastContactRows(solar, locale)),
      );
    }
    const demibirthday = shownOf(data.yearly.demibirthday.contacts);
    if (demibirthday.length > 0) {
      tables.push(
        tablePlanOf(
          ft.demibirthdayContactsCaption,
          forecastContactColumns(ft),
          forecastContactRows(demibirthday, locale),
        ),
      );
    }
    const returnAscendantSign = Math.floor((data.yearly.solarReturn.houses.cusps[1] ?? 0) / 30);
    const demibirthdayAscendantSign = Math.floor((data.yearly.demibirthday.houses.cusps[1] ?? 0) / 30);
    const hint = [
      ft.solarReturnSentence(
        String(data.yearly.solarReturn.year),
        forecastFormatUtc(data.yearly.solarReturn.returnJd),
        forecastLocalizedSignName(returnAscendantSign, locale, ft),
      ),
      ft.demibirthdaySentence(
        String(data.yearly.demibirthday.year),
        forecastFormatUtc(data.yearly.demibirthday.demibirthdayJd),
        forecastLocalizedSignName(demibirthdayAscendantSign, locale, ft),
      ),
    ].join(' ');
    sections.push({ kind: 'chart', heading: `${ft.yearlyHeading}${namePart}`, hint, tables });
  }

  return sections;
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

  if (selection.transits !== undefined && (selection.transits.wheel || selection.transits.aspectsTable)) {
    try {
      sections.push(await buildTransitsSectionPlan(selection.transits, context, pt));
    } catch (error) {
      errors.push(`${pt.transitsLabel}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (
    selection.forecast !== undefined &&
    (selection.forecast.daily || selection.forecast.weekly || selection.forecast.monthly || selection.forecast.yearly)
  ) {
    try {
      sections.push(...(await buildForecastSectionPlan(selection.forecast, context)));
    } catch (error) {
      errors.push(`${pt.forecastLabel}: ${error instanceof Error ? error.message : String(error)}`);
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
