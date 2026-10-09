/**
 * The PDF export builder (#441): tick what goes into one PDF — the birth record, the
 * interpretation, and any of the Charts page's five chart types, each with its own options
 * chosen here rather than read off whatever a live screen happens to show — then build it.
 *
 * Needs the store (to list people) but is not person-scoped in the URL: the primary person is
 * picked on the page itself, the same reasoning synastry's second person already uses.
 *
 * jsPDF/svg2pdf.js/jspdf-autotable are loaded only once "Build PDF" is actually clicked
 * (`pdf-export-render.js`'s dynamic `import()`), so they never enter the eager bundle this
 * screen's own chunk is already split out of.
 */
/**
 * @module PdfExportBuilder
 * @purpose Renders the PDF export builder screen (#441): lets the user tick which sections (birth record, interpretation, chart types, synastry, composite) go into one PDF, each with its own options, then builds it.
 * @conventions Needs the store (to list people) but is not person-scoped in the URL — the primary person and any partner are picked on the page itself. jsPDF/svg2pdf.js/jspdf-autotable (`pdf-export-render.js`) are loaded only via dynamic `import()` once "Build PDF" is clicked, so they never enter the eager bundle. AI-customised interpretation consent is spent the moment the build request goes out (ADR 0003), never remembered.
 * @exports PdfExportBuilder
 */
import { useId, useMemo, useState } from 'react';
import {
  applyPdfPreset,
  defaultAstrocartographySectionOptions,
  defaultChartSectionOptions,
  defaultCompositeSectionOptions,
  defaultEclipsesSectionOptions,
  defaultForecastSectionOptions,
  defaultProfectionsSectionOptions,
  defaultProgressionsSectionOptions,
  defaultSolarArcSectionOptions,
  defaultSynastrySectionOptions,
  defaultTransitsSectionOptions,
  EMPTY_SELECTION,
  matchPdfPreset,
  PDF_ACG_LINE_TYPES,
  PDF_CHART_TABLES,
  PDF_CHART_TYPES,
  PDF_PRESET_KEYS,
  pdfSelectionIsEmpty,
  type PdfAcgLineType,
  type PdfAstrocartographySectionOptions,
  type PdfChartSectionOptions,
  type PdfChartTable,
  type PdfCompositeSectionOptions,
  type PdfEclipsesSectionOptions,
  type PdfForecastSectionOptions,
  type PdfProfectionsSectionOptions,
  type PdfProgressionsSectionOptions,
  type PdfProgressionTechnique,
  type PdfSelection,
  type PdfSolarArcSectionOptions,
  type PdfSynastrySectionOptions,
  type PdfTransitFilterPreset,
  type PdfTransitsSectionOptions,
} from '../domain/pdf-export-sections.js';
import { EXTENDED_ACG_BODY_IDS, TRADITIONAL_ACG_BODY_IDS } from '../domain/astrocartography.js';
import type { Person } from '../domain/person.js';
import { bodyById } from '../astrology/bodies.js';
import type { ProgressedMcMethod } from '../astrology/progressions.js';
import type { BodyId } from '../ephemeris/types.js';
import type { ChartType } from './chart-sections.js';
import { bodyDisplayName } from './astro-names.messages.js';
import { chartViewMessages } from './ChartView.messages.js';
import { useEphemerisProvider } from './EphemerisProviderContext.js';
import { useLocale } from './locale.js';
import { useMessages } from './messages.js';
import { ordered } from './people-list.js';
import { pdfExportMessages } from './pdf-export.messages.js';
import { useRulershipChoice } from './rulership-setting.js';
import { useStoreState } from './store-context.js';

type BuildStatus =
  | { readonly kind: 'idle' }
  | { readonly kind: 'building' }
  | { readonly kind: 'done'; readonly skipped: number }
  | { readonly kind: 'error'; readonly message: string };

type Draft = Omit<PdfSelection, 'personId'>;

function setChart(selection: Draft, options: PdfChartSectionOptions | undefined, type: ChartType): Draft {
  const rest = selection.charts.filter((c) => c.type !== type);
  return { ...selection, charts: options === undefined ? rest : [...rest, options] };
}

function chartOf(selection: Draft, type: ChartType): PdfChartSectionOptions | undefined {
  return selection.charts.find((c) => c.type === type);
}

/** A partner needs a complete, known-time birth record — same requirement SynastryView/CompositeView gate their own picker on. */
function isPartnerCandidate(candidate: Person, excludingId: string): boolean {
  return candidate.id !== excludingId && candidate.moment !== undefined && candidate.timeAccuracy !== 'unknown';
}

export function PdfExportBuilder(): React.JSX.Element {
  const t = useMessages(pdfExportMessages);
  const ct = useMessages(chartViewMessages);
  const [locale] = useLocale();
  const [rulership] = useRulershipChoice();
  const { provider } = useEphemerisProvider();
  const state = useStoreState();
  const people = useMemo(() => ordered(state.people), [state.people]);

  const [personId, setPersonId] = useState<string>(people[0]?.id ?? '');
  const [selection, setSelection] = useState<Draft>(EMPTY_SELECTION);
  const [aiConsent, setAiConsent] = useState(false);
  const [status, setStatus] = useState<BuildStatus>({ kind: 'idle' });
  const id = useId();

  const person = state.people.get(personId);
  const partnerCandidates = useMemo(
    () => people.filter((candidate) => isPartnerCandidate(candidate, personId)),
    [people, personId],
  );
  const fullSelection: PdfSelection = { personId, ...selection };
  const currentPreset = matchPdfPreset(fullSelection);
  const empty = pdfSelectionIsEmpty(fullSelection);

  const choosePreset = (value: string): void => {
    if (value === 'custom') return;
    if (!(PDF_PRESET_KEYS as readonly string[]).includes(value)) return;
    const preset = applyPdfPreset(value as (typeof PDF_PRESET_KEYS)[number], personId);
    setSelection(preset);
  };

  const toggleChart = (type: ChartType, included: boolean): void => {
    setSelection((current) => setChart(current, included ? defaultChartSectionOptions(type) : undefined, type));
  };

  const patchChart = (type: ChartType, patch: Partial<PdfChartSectionOptions>): void => {
    setSelection((current) => {
      const existing = chartOf(current, type);
      if (existing === undefined) return current;
      return setChart(current, { ...existing, ...patch }, type);
    });
  };

  const toggleTable = (type: ChartType, table: PdfChartTable, on: boolean): void => {
    setSelection((current) => {
      const existing = chartOf(current, type);
      if (existing === undefined) return current;
      const tables = on ? [...existing.tables, table] : existing.tables.filter((candidate) => candidate !== table);
      return setChart(current, { ...existing, tables }, type);
    });
  };

  const toggleSynastry = (included: boolean, firstPartnerId: string): void => {
    setSelection((current) => {
      if (!included) {
        const next = { ...current };
        delete next.synastry;
        return next;
      }
      return { ...current, synastry: defaultSynastrySectionOptions(firstPartnerId) };
    });
  };

  const patchSynastry = (patch: Partial<PdfSynastrySectionOptions>): void => {
    setSelection((current) =>
      current.synastry === undefined ? current : { ...current, synastry: { ...current.synastry, ...patch } },
    );
  };

  const toggleComposite = (included: boolean, firstPartnerId: string): void => {
    setSelection((current) => {
      if (!included) {
        const next = { ...current };
        delete next.composite;
        return next;
      }
      return { ...current, composite: defaultCompositeSectionOptions(firstPartnerId) };
    });
  };

  const patchComposite = (patch: Partial<PdfCompositeSectionOptions>): void => {
    setSelection((current) =>
      current.composite === undefined ? current : { ...current, composite: { ...current.composite, ...patch } },
    );
  };

  const toggleCompositeTable = (table: PdfChartTable, on: boolean): void => {
    setSelection((current) => {
      if (current.composite === undefined) return current;
      const tables = on
        ? [...current.composite.tables, table]
        : current.composite.tables.filter((candidate) => candidate !== table);
      return { ...current, composite: { ...current.composite, tables } };
    });
  };

  const toggleTransits = (included: boolean): void => {
    setSelection((current) => {
      if (!included) {
        const next = { ...current };
        delete next.transits;
        return next;
      }
      return { ...current, transits: defaultTransitsSectionOptions() };
    });
  };

  const patchTransits = (patch: Partial<PdfTransitsSectionOptions>): void => {
    setSelection((current) =>
      current.transits === undefined ? current : { ...current, transits: { ...current.transits, ...patch } },
    );
  };

  const toggleForecast = (included: boolean): void => {
    setSelection((current) => {
      if (!included) {
        const next = { ...current };
        delete next.forecast;
        return next;
      }
      return { ...current, forecast: defaultForecastSectionOptions() };
    });
  };

  const patchForecast = (patch: Partial<PdfForecastSectionOptions>): void => {
    setSelection((current) =>
      current.forecast === undefined ? current : { ...current, forecast: { ...current.forecast, ...patch } },
    );
  };

  const toggleEclipses = (included: boolean): void => {
    setSelection((current) => {
      if (!included) {
        const next = { ...current };
        delete next.eclipses;
        return next;
      }
      return { ...current, eclipses: defaultEclipsesSectionOptions() };
    });
  };

  const patchEclipses = (patch: Partial<PdfEclipsesSectionOptions>): void => {
    setSelection((current) =>
      current.eclipses === undefined ? current : { ...current, eclipses: { ...current.eclipses, ...patch } },
    );
  };

  const toggleProgressions = (included: boolean): void => {
    setSelection((current) => {
      if (!included) {
        const next = { ...current };
        delete next.progressions;
        return next;
      }
      return { ...current, progressions: defaultProgressionsSectionOptions() };
    });
  };

  const patchProgressions = (patch: Partial<PdfProgressionsSectionOptions>): void => {
    setSelection((current) =>
      current.progressions === undefined
        ? current
        : { ...current, progressions: { ...current.progressions, ...patch } },
    );
  };

  const toggleSolarArc = (included: boolean): void => {
    setSelection((current) => {
      if (!included) {
        const next = { ...current };
        delete next.solarArc;
        return next;
      }
      return { ...current, solarArc: defaultSolarArcSectionOptions() };
    });
  };

  const patchSolarArc = (patch: Partial<PdfSolarArcSectionOptions>): void => {
    setSelection((current) =>
      current.solarArc === undefined ? current : { ...current, solarArc: { ...current.solarArc, ...patch } },
    );
  };

  const toggleProfections = (included: boolean): void => {
    setSelection((current) => {
      if (!included) {
        const next = { ...current };
        delete next.profections;
        return next;
      }
      return { ...current, profections: defaultProfectionsSectionOptions() };
    });
  };

  const patchProfections = (patch: Partial<PdfProfectionsSectionOptions>): void => {
    setSelection((current) =>
      current.profections === undefined ? current : { ...current, profections: { ...current.profections, ...patch } },
    );
  };

  const toggleAstrocartography = (included: boolean): void => {
    setSelection((current) => {
      if (!included) {
        const next = { ...current };
        delete next.astrocartography;
        return next;
      }
      return { ...current, astrocartography: defaultAstrocartographySectionOptions() };
    });
  };

  const patchAstrocartography = (patch: Partial<PdfAstrocartographySectionOptions>): void => {
    setSelection((current) =>
      current.astrocartography === undefined
        ? current
        : { ...current, astrocartography: { ...current.astrocartography, ...patch } },
    );
  };

  const toggleAstrocartographyLineType = (lineType: PdfAcgLineType, on: boolean): void => {
    setSelection((current) => {
      if (current.astrocartography === undefined) return current;
      const lineTypes = on
        ? [...current.astrocartography.lineTypes, lineType]
        : current.astrocartography.lineTypes.filter((candidate) => candidate !== lineType);
      return { ...current, astrocartography: { ...current.astrocartography, lineTypes } };
    });
  };

  const toggleAstrocartographyBody = (body: BodyId, on: boolean): void => {
    setSelection((current) => {
      if (current.astrocartography === undefined) return current;
      const bodies = on
        ? [...current.astrocartography.bodies, body]
        : current.astrocartography.bodies.filter((candidate) => candidate !== body);
      return { ...current, astrocartography: { ...current.astrocartography, bodies } };
    });
  };

  async function handleBuild(): Promise<void> {
    if (person === undefined || provider === undefined) return;
    setStatus({ kind: 'building' });
    try {
      const { buildPdfPlan } = await import('./pdf-export-plan.js');
      const plan = await buildPdfPlan(
        fullSelection,
        { person, provider, rulership, locale, aiConsent, people: state.people },
        ct,
        t,
      );
      // Consent authorizes one specific build, not a standing preference (ADR 0003) — spent the
      // moment the request goes out, same rule the AI-customised interpretation panel follows.
      setAiConsent(false);
      const { renderPdfPlan } = await import('./pdf-export-render.js');
      const { downloadBlob } = await import('./download.js');
      const { blob, filename } = await renderPdfPlan(plan);
      downloadBlob(filename, blob);
      setStatus({ kind: 'done', skipped: plan.errors.length });
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  }

  const needsAiConsentButMissing = selection.interpretation.aiCustomised && !aiConsent;

  return (
    <main className="shell">
      <h1>{t.heading}</h1>
      <p className="hint">{t.hint}</p>

      <p className="field-grid">
        <span>
          {/* The label and select are siblings, not nested: a wrapping label's own text would otherwise
              include the selected option's rendered text too, breaking an exact match on "Person" alone
              once anything is chosen. */}
          <label htmlFor={`${id}-person`}>{t.personLabel}</label>{' '}
          <select
            id={`${id}-person`}
            value={personId}
            onChange={(event) => {
              setPersonId(event.target.value);
            }}
          >
            {people.length === 0 && <option value="">{t.noPeople}</option>}
            {people.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.displayName || t.unnamedOption}
              </option>
            ))}
          </select>
        </span>
        <span>
          <label htmlFor={`${id}-preset`}>{t.presetLabel}</label>{' '}
          <select
            id={`${id}-preset`}
            value={currentPreset ?? 'custom'}
            onChange={(event) => {
              choosePreset(event.target.value);
            }}
          >
            <option value="custom">{t.presetOptions.custom}</option>
            {PDF_PRESET_KEYS.map((key) => (
              <option key={key} value={key}>
                {t.presetOptions[key]}
              </option>
            ))}
          </select>
        </span>
      </p>

      <fieldset className="field-group">
        <legend>{t.birthRecordLabel}</legend>
        <label>
          <input
            type="checkbox"
            checked={selection.birthRecord}
            onChange={(event) => {
              setSelection((current) => ({ ...current, birthRecord: event.target.checked }));
            }}
          />{' '}
          {t.birthRecordLabel}
        </label>
      </fieldset>

      <fieldset className="field-group">
        <legend>{t.interpretationLabel}</legend>
        <label>
          <input
            type="checkbox"
            checked={selection.interpretation.base}
            onChange={(event) => {
              setSelection((current) => ({
                ...current,
                interpretation: { ...current.interpretation, base: event.target.checked },
              }));
            }}
          />{' '}
          {t.interpretationBaseLabel}
        </label>
        <label>
          <input
            type="checkbox"
            checked={selection.interpretation.aiCustomised}
            onChange={(event) => {
              setSelection((current) => ({
                ...current,
                interpretation: { ...current.interpretation, aiCustomised: event.target.checked },
              }));
            }}
          />{' '}
          {t.interpretationAiLabel}
        </label>
        {selection.interpretation.aiCustomised && (
          <>
            <p className="hint">{t.interpretationAiHint}</p>
            <label>
              <input
                type="checkbox"
                checked={aiConsent}
                onChange={(event) => {
                  setAiConsent(event.target.checked);
                }}
              />{' '}
              {t.interpretationAiConsentLabel}
            </label>
          </>
        )}
      </fieldset>

      <fieldset className="field-group">
        <legend>{t.chartsLegend}</legend>
        {PDF_CHART_TYPES.map((type) => {
          const options = chartOf(fullSelection, type);
          const included = options !== undefined;
          return (
            <div key={type}>
              <label>
                <input
                  type="checkbox"
                  checked={included}
                  onChange={(event) => {
                    toggleChart(type, event.target.checked);
                  }}
                />{' '}
                {t.chartTypeLabels[type]}
              </label>
              {included && (
                <div className="settings-card-indent">
                  <label>
                    <input
                      type="checkbox"
                      checked={options.wheel}
                      onChange={(event) => {
                        patchChart(type, { wheel: event.target.checked });
                      }}
                    />{' '}
                    {t.wheelLabel}
                  </label>{' '}
                  {PDF_CHART_TABLES.map((table) => (
                    <label key={table}>
                      <input
                        type="checkbox"
                        checked={options.tables.includes(table)}
                        onChange={(event) => {
                          toggleTable(type, table, event.target.checked);
                        }}
                      />{' '}
                      {t.tableLabels[table]}
                    </label>
                  ))}
                  {type === 'harmonic' && (
                    <label>
                      {' '}
                      {t.harmonicNumberLabel}{' '}
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={options.harmonicN ?? 5}
                        onChange={(event) => {
                          patchChart(type, { harmonicN: Number(event.target.value) });
                        }}
                      />
                    </label>
                  )}
                  {type === 'solar-return' && (
                    <label>
                      {' '}
                      {t.returnYearLabel}{' '}
                      <input
                        type="number"
                        value={options.returnYear ?? new Date().getFullYear()}
                        onChange={(event) => {
                          patchChart(type, { returnYear: Number(event.target.value) });
                        }}
                      />
                    </label>
                  )}
                  {type === 'lunar-return' && (
                    <label>
                      {' '}
                      {t.returnFromDateLabel}{' '}
                      <input
                        type="date"
                        value={options.returnFromDate ?? new Date().toISOString().slice(0, 10)}
                        onChange={(event) => {
                          patchChart(type, { returnFromDate: event.target.value });
                        }}
                      />
                    </label>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </fieldset>

      <fieldset className="field-group">
        <legend>{t.relationshipLegend}</legend>
        <div>
          <label>
            <input
              type="checkbox"
              checked={fullSelection.synastry !== undefined}
              disabled={partnerCandidates.length === 0}
              onChange={(event) => {
                toggleSynastry(event.target.checked, partnerCandidates[0]?.id ?? '');
              }}
            />{' '}
            {t.synastryLabel}
          </label>
          {partnerCandidates.length === 0 && <p className="hint">{t.noPartnersHint}</p>}
          {fullSelection.synastry !== undefined && (
            <div className="settings-card-indent">
              <label htmlFor={`${id}-synastry-partner`}>{t.partnerLabelSynastry}</label>{' '}
              <select
                id={`${id}-synastry-partner`}
                value={fullSelection.synastry.partnerId}
                onChange={(event) => {
                  patchSynastry({ partnerId: event.target.value });
                }}
              >
                {partnerCandidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.displayName || t.unnamedOption}
                  </option>
                ))}
              </select>
              <br />
              <label>
                <input
                  type="checkbox"
                  checked={fullSelection.synastry.wheel}
                  onChange={(event) => {
                    patchSynastry({ wheel: event.target.checked });
                  }}
                />{' '}
                {t.wheelLabel}
              </label>{' '}
              <label>
                <input
                  type="checkbox"
                  checked={fullSelection.synastry.aspectsTable}
                  onChange={(event) => {
                    patchSynastry({ aspectsTable: event.target.checked });
                  }}
                />{' '}
                {t.aspectsTableLabel}
              </label>{' '}
              <label>
                <input
                  type="checkbox"
                  checked={fullSelection.synastry.relationshipSummary}
                  onChange={(event) => {
                    patchSynastry({ relationshipSummary: event.target.checked });
                  }}
                />{' '}
                {t.relationshipSummaryLabel}
              </label>
            </div>
          )}
        </div>
        <div>
          <label>
            <input
              type="checkbox"
              checked={fullSelection.composite !== undefined}
              disabled={partnerCandidates.length === 0}
              onChange={(event) => {
                toggleComposite(event.target.checked, partnerCandidates[0]?.id ?? '');
              }}
            />{' '}
            {t.compositeLabel}
          </label>
          {fullSelection.composite !== undefined && (
            <div className="settings-card-indent">
              <label htmlFor={`${id}-composite-partner`}>{t.partnerLabelComposite}</label>{' '}
              <select
                id={`${id}-composite-partner`}
                value={fullSelection.composite.partnerId}
                onChange={(event) => {
                  patchComposite({ partnerId: event.target.value });
                }}
              >
                {partnerCandidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.displayName || t.unnamedOption}
                  </option>
                ))}
              </select>
              <br />
              <label>
                <input
                  type="checkbox"
                  checked={fullSelection.composite.wheel}
                  onChange={(event) => {
                    patchComposite({ wheel: event.target.checked });
                  }}
                />{' '}
                {t.wheelLabel}
              </label>{' '}
              {PDF_CHART_TABLES.map((table) => (
                <label key={table}>
                  <input
                    type="checkbox"
                    checked={fullSelection.composite?.tables.includes(table) ?? false}
                    onChange={(event) => {
                      toggleCompositeTable(table, event.target.checked);
                    }}
                  />{' '}
                  {t.tableLabels[table]}
                </label>
              ))}
            </div>
          )}
        </div>
      </fieldset>

      <fieldset className="field-group">
        <legend>{t.transitsLegend}</legend>
        <div>
          <label>
            <input
              type="checkbox"
              checked={fullSelection.transits !== undefined}
              onChange={(event) => {
                toggleTransits(event.target.checked);
              }}
            />{' '}
            {t.transitsLabel}
          </label>
          {fullSelection.transits !== undefined && (
            <div className="settings-card-indent">
              <label htmlFor={`${id}-transits-filter`}>{t.filterPresetLabel}</label>{' '}
              <select
                id={`${id}-transits-filter`}
                value={fullSelection.transits.filterPreset}
                onChange={(event) => {
                  patchTransits({ filterPreset: event.target.value as PdfTransitFilterPreset });
                }}
              >
                {(['important', 'all'] as const).map((preset) => (
                  <option key={preset} value={preset}>
                    {t.filterPresetOptions[preset]}
                  </option>
                ))}
              </select>
              <br />
              <label>
                <input
                  type="checkbox"
                  checked={fullSelection.transits.wheel}
                  onChange={(event) => {
                    patchTransits({ wheel: event.target.checked });
                  }}
                />{' '}
                {t.wheelLabel}
              </label>{' '}
              <label>
                <input
                  type="checkbox"
                  checked={fullSelection.transits.aspectsTable}
                  onChange={(event) => {
                    patchTransits({ aspectsTable: event.target.checked });
                  }}
                />{' '}
                {t.aspectsTableLabel}
              </label>{' '}
              <label>
                {t.asOfDateLabel}{' '}
                <input
                  type="date"
                  value={fullSelection.transits.asOfDate ?? ''}
                  onChange={(event) => {
                    patchTransits({ asOfDate: event.target.value });
                  }}
                />
              </label>
            </div>
          )}
        </div>

        <div>
          <label>
            <input
              type="checkbox"
              checked={fullSelection.forecast !== undefined}
              onChange={(event) => {
                toggleForecast(event.target.checked);
              }}
            />{' '}
            {t.forecastLabel}
          </label>
          {fullSelection.forecast !== undefined && (
            <div className="settings-card-indent">
              <label htmlFor={`${id}-forecast-filter`}>{t.filterPresetLabel}</label>{' '}
              <select
                id={`${id}-forecast-filter`}
                value={fullSelection.forecast.filterPreset}
                onChange={(event) => {
                  patchForecast({ filterPreset: event.target.value as PdfTransitFilterPreset });
                }}
              >
                {(['important', 'all'] as const).map((preset) => (
                  <option key={preset} value={preset}>
                    {t.filterPresetOptions[preset]}
                  </option>
                ))}
              </select>
              <br />
              <label>
                <input
                  type="checkbox"
                  checked={fullSelection.forecast.daily}
                  onChange={(event) => {
                    patchForecast({ daily: event.target.checked });
                  }}
                />{' '}
                {t.forecastDailyLabel}
              </label>{' '}
              <label>
                <input
                  type="checkbox"
                  checked={fullSelection.forecast.weekly}
                  onChange={(event) => {
                    patchForecast({ weekly: event.target.checked });
                  }}
                />{' '}
                {t.forecastWeeklyLabel}
              </label>{' '}
              <label>
                <input
                  type="checkbox"
                  checked={fullSelection.forecast.monthly}
                  onChange={(event) => {
                    patchForecast({ monthly: event.target.checked });
                  }}
                />{' '}
                {t.forecastMonthlyLabel}
              </label>{' '}
              <label>
                <input
                  type="checkbox"
                  checked={fullSelection.forecast.yearly}
                  onChange={(event) => {
                    patchForecast({ yearly: event.target.checked });
                  }}
                />{' '}
                {t.forecastYearlyLabel}
              </label>{' '}
              <label>
                {t.asOfDateLabel}{' '}
                <input
                  type="date"
                  value={fullSelection.forecast.asOfDate ?? ''}
                  onChange={(event) => {
                    patchForecast({ asOfDate: event.target.value });
                  }}
                />
              </label>
            </div>
          )}
        </div>
      </fieldset>

      <fieldset className="field-group">
        <legend>{t.eclipsesLegend}</legend>
        <label>
          <input
            type="checkbox"
            checked={fullSelection.eclipses !== undefined}
            onChange={(event) => {
              toggleEclipses(event.target.checked);
            }}
          />{' '}
          {t.eclipsesLabel}
        </label>
        {fullSelection.eclipses !== undefined && (
          <div className="settings-card-indent">
            <label htmlFor={`${id}-eclipses-from`}>{t.fromYearLabel}</label>{' '}
            <input
              id={`${id}-eclipses-from`}
              type="number"
              value={fullSelection.eclipses.fromYear ?? ''}
              onChange={(event) => {
                if (event.target.value === '') return;
                patchEclipses({ fromYear: Number(event.target.value) });
              }}
            />{' '}
            <label htmlFor={`${id}-eclipses-to`}>{t.toYearLabel}</label>{' '}
            <input
              id={`${id}-eclipses-to`}
              type="number"
              value={fullSelection.eclipses.toYear ?? ''}
              onChange={(event) => {
                if (event.target.value === '') return;
                patchEclipses({ toYear: Number(event.target.value) });
              }}
            />
          </div>
        )}
      </fieldset>

      <fieldset className="field-group">
        <legend>{t.predictiveLegend}</legend>
        <div>
          <label>
            <input
              type="checkbox"
              checked={fullSelection.progressions !== undefined}
              onChange={(event) => {
                toggleProgressions(event.target.checked);
              }}
            />{' '}
            {t.progressionsLabel}
          </label>
          {fullSelection.progressions !== undefined && (
            <div className="settings-card-indent">
              <label htmlFor={`${id}-progressions-technique`}>{t.progressionTechniqueLabel}</label>{' '}
              <select
                id={`${id}-progressions-technique`}
                value={fullSelection.progressions.technique}
                onChange={(event) => {
                  patchProgressions({ technique: event.target.value as PdfProgressionTechnique });
                }}
              >
                {(['secondary', 'tertiary', 'minor'] as const).map((technique) => (
                  <option key={technique} value={technique}>
                    {t.progressionTechniqueOptions[technique]}
                  </option>
                ))}
              </select>{' '}
              {fullSelection.progressions.technique === 'secondary' && (
                <>
                  <label htmlFor={`${id}-progressions-mc-method`}>{t.mcMethodLabel}</label>{' '}
                  <select
                    id={`${id}-progressions-mc-method`}
                    value={fullSelection.progressions.mcMethod}
                    onChange={(event) => {
                      patchProgressions({ mcMethod: event.target.value as ProgressedMcMethod });
                    }}
                  >
                    {(['quotidian', 'naibod', 'solarArc'] as const).map((method) => (
                      <option key={method} value={method}>
                        {t.mcMethodOptions[method]}
                      </option>
                    ))}
                  </select>{' '}
                </>
              )}
              <br />
              <label>
                <input
                  type="checkbox"
                  checked={fullSelection.progressions.positionsTable}
                  onChange={(event) => {
                    patchProgressions({ positionsTable: event.target.checked });
                  }}
                />{' '}
                {t.positionsTableLabel}
              </label>{' '}
              <label>
                <input
                  type="checkbox"
                  checked={fullSelection.progressions.contactsTable}
                  onChange={(event) => {
                    patchProgressions({ contactsTable: event.target.checked });
                  }}
                />{' '}
                {t.contactsTableLabel}
              </label>{' '}
              <label>
                {t.asOfDateLabel}{' '}
                <input
                  type="date"
                  value={fullSelection.progressions.asOfDate ?? ''}
                  onChange={(event) => {
                    patchProgressions({ asOfDate: event.target.value });
                  }}
                />
              </label>
            </div>
          )}
        </div>

        <div>
          <label>
            <input
              type="checkbox"
              checked={fullSelection.solarArc !== undefined}
              onChange={(event) => {
                toggleSolarArc(event.target.checked);
              }}
            />{' '}
            {t.solarArcLabel}
          </label>
          {fullSelection.solarArc !== undefined && (
            <div className="settings-card-indent">
              <label>
                <input
                  type="checkbox"
                  checked={fullSelection.solarArc.positionsTable}
                  onChange={(event) => {
                    patchSolarArc({ positionsTable: event.target.checked });
                  }}
                />{' '}
                {t.positionsTableLabel}
              </label>{' '}
              <label>
                <input
                  type="checkbox"
                  checked={fullSelection.solarArc.contactsTable}
                  onChange={(event) => {
                    patchSolarArc({ contactsTable: event.target.checked });
                  }}
                />{' '}
                {t.contactsTableLabel}
              </label>{' '}
              <label>
                {t.asOfDateLabel}{' '}
                <input
                  type="date"
                  value={fullSelection.solarArc.asOfDate ?? ''}
                  onChange={(event) => {
                    patchSolarArc({ asOfDate: event.target.value });
                  }}
                />
              </label>
            </div>
          )}
        </div>

        <div>
          <label>
            <input
              type="checkbox"
              checked={fullSelection.profections !== undefined}
              onChange={(event) => {
                toggleProfections(event.target.checked);
              }}
            />{' '}
            {t.profectionsLabel}
          </label>
          {fullSelection.profections !== undefined && (
            <div className="settings-card-indent">
              <label>
                <input
                  type="checkbox"
                  checked={fullSelection.profections.table}
                  onChange={(event) => {
                    patchProfections({ table: event.target.checked });
                  }}
                />{' '}
                {t.profectionsTableLabel}
              </label>{' '}
              <label>
                <input
                  type="checkbox"
                  checked={fullSelection.profections.meanings}
                  onChange={(event) => {
                    patchProfections({ meanings: event.target.checked });
                  }}
                />{' '}
                {t.meaningsLabel}
              </label>{' '}
              <label>
                {t.asOfDateLabel}{' '}
                <input
                  type="date"
                  value={fullSelection.profections.asOfDate ?? ''}
                  onChange={(event) => {
                    patchProfections({ asOfDate: event.target.value });
                  }}
                />
              </label>
            </div>
          )}
        </div>

        <div>
          <label>
            <input
              type="checkbox"
              checked={fullSelection.astrocartography !== undefined}
              onChange={(event) => {
                toggleAstrocartography(event.target.checked);
              }}
            />{' '}
            {t.astrocartographyLabel}
          </label>
          {fullSelection.astrocartography !== undefined && (
            <div className="settings-card-indent">
              {(() => {
                const acg = fullSelection.astrocartography;
                return (
                  <>
                    <label>
                      <input
                        type="checkbox"
                        checked={acg.map}
                        onChange={(event) => {
                          patchAstrocartography({ map: event.target.checked });
                        }}
                      />{' '}
                      {t.astrocartographyMapLabel}
                    </label>{' '}
                    <label>
                      <input
                        type="checkbox"
                        checked={acg.meanings}
                        onChange={(event) => {
                          patchAstrocartography({ meanings: event.target.checked });
                        }}
                      />{' '}
                      {t.meaningsLabel}
                    </label>{' '}
                    <label>
                      <input
                        type="checkbox"
                        checked={acg.localSpace}
                        onChange={(event) => {
                          patchAstrocartography({ localSpace: event.target.checked });
                        }}
                      />{' '}
                      {t.localSpaceLabel}
                    </label>
                    <br />
                    <span>{t.lineTypesLabel}: </span>
                    {PDF_ACG_LINE_TYPES.map((lineType) => (
                      <label key={lineType}>
                        <input
                          type="checkbox"
                          checked={acg.lineTypes.includes(lineType)}
                          onChange={(event) => {
                            toggleAstrocartographyLineType(lineType, event.target.checked);
                          }}
                        />{' '}
                        {t.lineTypeOptions[lineType]}
                      </label>
                    ))}
                    <br />
                    <span>{t.bodiesLabel}: </span>
                    {[...TRADITIONAL_ACG_BODY_IDS, ...EXTENDED_ACG_BODY_IDS].map((body) => (
                      <label key={body}>
                        <input
                          type="checkbox"
                          checked={acg.bodies.includes(body)}
                          onChange={(event) => {
                            toggleAstrocartographyBody(body, event.target.checked);
                          }}
                        />{' '}
                        {bodyDisplayName(bodyById(body)?.key ?? String(body), locale)}
                      </label>
                    ))}
                  </>
                );
              })()}
            </div>
          )}
        </div>
      </fieldset>

      <p>
        <button
          type="button"
          className="quiet"
          disabled={person === undefined || empty || status.kind === 'building' || needsAiConsentButMissing}
          aria-describedby={`${id}-status`}
          onClick={() => {
            void handleBuild();
          }}
        >
          {t.buildButton}
        </button>
      </p>
      <p id={`${id}-status`} className="status" role="status" aria-live="polite">
        {status.kind === 'building' && t.buildingStatus}
        {status.kind === 'done' && status.skipped === 0 && '✓'}
        {status.kind === 'done' && status.skipped > 0 && t.someSectionsSkipped(String(status.skipped))}
      </p>
      {status.kind === 'error' && (
        <p className="warning" role="alert">
          {status.message}
        </p>
      )}
    </main>
  );
}
