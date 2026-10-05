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
import { useId, useMemo, useState } from 'react';
import {
  applyPdfPreset,
  defaultChartSectionOptions,
  EMPTY_SELECTION,
  matchPdfPreset,
  PDF_CHART_TABLES,
  PDF_CHART_TYPES,
  PDF_PRESET_KEYS,
  pdfSelectionIsEmpty,
  type PdfChartSectionOptions,
  type PdfChartTable,
  type PdfSelection,
} from '../domain/pdf-export-sections.js';
import type { ChartType } from './chart-sections.js';
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

  async function handleBuild(): Promise<void> {
    if (person === undefined || provider === undefined) return;
    setStatus({ kind: 'building' });
    try {
      const { buildPdfPlan } = await import('./pdf-export-plan.js');
      const plan = await buildPdfPlan(fullSelection, { person, provider, rulership, locale, aiConsent }, ct, t);
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
