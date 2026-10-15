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
import { NumberField } from './primitives/NumberField.js';
import { DateField } from './primitives/DateField.js';
import { Checkbox } from './primitives/Checkbox.js';
import { Button } from './primitives/Button.js';
import { Disclosure } from './primitives/Disclosure.js';
import { StatusMessage } from './primitives/StatusMessage.js';
import { utcDay } from './format.js';
import { Select } from './primitives/Select.js';
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
import { useExtendedSettings } from './extended-settings-store.js';
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
  // The calculation settings the Charts page is drawing with (#582): a PDF chart must be that chart.
  const [extendedSettings] = useExtendedSettings();
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
        { person, provider, settings: extendedSettings, rulership, locale, aiConsent, people: state.people },
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

      <div className="field-grid">
        <Select
          label={t.personLabel}
          value={personId}
          options={[
            ...(people.length === 0 ? [{ value: '', label: t.noPeople }] : []),
            ...people.map((candidate) => ({ value: candidate.id, label: candidate.displayName || t.unnamedOption })),
          ]}
          onChange={setPersonId}
        />
        <Select
          label={t.presetLabel}
          value={currentPreset ?? 'custom'}
          options={[
            { value: 'custom', label: t.presetOptions.custom },
            ...PDF_PRESET_KEYS.map((key) => ({ value: key, label: t.presetOptions[key] })),
          ]}
          onChange={choosePreset}
        />
      </div>

      <fieldset className="field-group">
        <legend>{t.birthRecordLabel}</legend>
        <Checkbox
          label={t.birthRecordLabel}
          checked={selection.birthRecord}
          onChange={(value) => {
            setSelection((current) => ({ ...current, birthRecord: value }));
          }}
        />
      </fieldset>

      <fieldset className="field-group">
        <legend>{t.interpretationLabel}</legend>
        <Checkbox
          label={t.interpretationBaseLabel}
          checked={selection.interpretation.base}
          onChange={(value) => {
            setSelection((current) => ({
              ...current,
              interpretation: { ...current.interpretation, base: value },
            }));
          }}
        />
        <Checkbox
          label={t.interpretationAiLabel}
          checked={selection.interpretation.aiCustomised}
          onChange={(value) => {
            setSelection((current) => ({
              ...current,
              interpretation: { ...current.interpretation, aiCustomised: value },
            }));
          }}
        />
        {selection.interpretation.aiCustomised && (
          <>
            <p className="hint">{t.interpretationAiHint}</p>
            <Checkbox
              label={t.interpretationAiConsentLabel}
              checked={aiConsent}
              onChange={(value) => {
                setAiConsent(value);
              }}
            />
          </>
        )}
      </fieldset>

      <Disclosure title={t.chartsLegend} showLabel={t.showSection} hideLabel={t.hideSection} defaultOpen>
        <div className="field-group" role="group" aria-label={t.chartsLegend}>
          {PDF_CHART_TYPES.map((type) => {
            const options = chartOf(fullSelection, type);
            const included = options !== undefined;
            return (
              <div key={type}>
                <Checkbox
                  label={t.chartTypeLabels[type]}
                  checked={included}
                  onChange={(value) => {
                    toggleChart(type, value);
                  }}
                />
                {included && (
                  <div className="settings-card-indent">
                    <Checkbox
                      label={t.wheelLabel}
                      checked={options.wheel}
                      onChange={(value) => {
                        patchChart(type, { wheel: value });
                      }}
                    />{' '}
                    {PDF_CHART_TABLES.map((table) => (
                      <Checkbox
                        key={table}
                        label={t.tableLabels[table]}
                        checked={options.tables.includes(table)}
                        onChange={(value) => {
                          toggleTable(type, table, value);
                        }}
                      />
                    ))}
                    {type === 'harmonic' && (
                      <NumberField
                        label={t.harmonicNumberLabel}
                        min={1}
                        step="any"
                        value={String(options.harmonicN ?? 5)}
                        onChange={(value) => {
                          patchChart(type, { harmonicN: Number(value) });
                        }}
                      />
                    )}
                    {type === 'solar-return' && (
                      <NumberField
                        label={t.returnYearLabel}
                        step="any"
                        value={String(options.returnYear ?? new Date().getFullYear())}
                        onChange={(value) => {
                          patchChart(type, { returnYear: Number(value) });
                        }}
                      />
                    )}
                    {type === 'lunar-return' && (
                      <DateField
                        label={t.returnFromDateLabel}
                        value={options.returnFromDate ?? utcDay()}
                        onChange={(value) => {
                          patchChart(type, { returnFromDate: value });
                        }}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Disclosure>

      <Disclosure title={t.relationshipLegend} showLabel={t.showSection} hideLabel={t.hideSection} defaultOpen>
        <div className="field-group" role="group" aria-label={t.relationshipLegend}>
          <div>
            <Checkbox
              label={t.synastryLabel}
              checked={fullSelection.synastry !== undefined}
              disabled={partnerCandidates.length === 0}
              onChange={(value) => {
                toggleSynastry(value, partnerCandidates[0]?.id ?? '');
              }}
            />
            {partnerCandidates.length === 0 && <p className="hint">{t.noPartnersHint}</p>}
            {fullSelection.synastry !== undefined && (
              <div className="settings-card-indent">
                <Select
                  label={t.partnerLabelSynastry}
                  value={fullSelection.synastry.partnerId}
                  onChange={(value) => {
                    patchSynastry({ partnerId: value });
                  }}
                  options={partnerCandidates.map((candidate) => ({
                    value: candidate.id,
                    label: candidate.displayName || t.unnamedOption,
                  }))}
                />
                <br />
                <Checkbox
                  label={t.wheelLabel}
                  checked={fullSelection.synastry.wheel}
                  onChange={(value) => {
                    patchSynastry({ wheel: value });
                  }}
                />{' '}
                <Checkbox
                  label={t.aspectsTableLabel}
                  checked={fullSelection.synastry.aspectsTable}
                  onChange={(value) => {
                    patchSynastry({ aspectsTable: value });
                  }}
                />{' '}
                <Checkbox
                  label={t.relationshipSummaryLabel}
                  checked={fullSelection.synastry.relationshipSummary}
                  onChange={(value) => {
                    patchSynastry({ relationshipSummary: value });
                  }}
                />
              </div>
            )}
          </div>
          <div>
            <Checkbox
              label={t.compositeLabel}
              checked={fullSelection.composite !== undefined}
              disabled={partnerCandidates.length === 0}
              onChange={(value) => {
                toggleComposite(value, partnerCandidates[0]?.id ?? '');
              }}
            />
            {fullSelection.composite !== undefined && (
              <div className="settings-card-indent">
                <Select
                  label={t.partnerLabelComposite}
                  value={fullSelection.composite.partnerId}
                  onChange={(value) => {
                    patchComposite({ partnerId: value });
                  }}
                  options={partnerCandidates.map((candidate) => ({
                    value: candidate.id,
                    label: candidate.displayName || t.unnamedOption,
                  }))}
                />
                <br />
                <Checkbox
                  label={t.wheelLabel}
                  checked={fullSelection.composite.wheel}
                  onChange={(value) => {
                    patchComposite({ wheel: value });
                  }}
                />{' '}
                {PDF_CHART_TABLES.map((table) => (
                  <Checkbox
                    key={table}
                    label={t.tableLabels[table]}
                    checked={fullSelection.composite?.tables.includes(table) ?? false}
                    onChange={(value) => {
                      toggleCompositeTable(table, value);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </Disclosure>

      <Disclosure title={t.transitsLegend} showLabel={t.showSection} hideLabel={t.hideSection} defaultOpen>
        <div className="field-group" role="group" aria-label={t.transitsLegend}>
          <div>
            <Checkbox
              label={t.transitsLabel}
              checked={fullSelection.transits !== undefined}
              onChange={(value) => {
                toggleTransits(value);
              }}
            />
            {fullSelection.transits !== undefined && (
              <div className="settings-card-indent">
                <Select
                  label={t.filterPresetLabel}
                  value={fullSelection.transits.filterPreset}
                  onChange={(value) => {
                    patchTransits({ filterPreset: value as PdfTransitFilterPreset });
                  }}
                  options={(['important', 'all'] as const).map((preset) => ({
                    value: preset,
                    label: t.filterPresetOptions[preset],
                  }))}
                />
                <br />
                <Checkbox
                  label={t.wheelLabel}
                  checked={fullSelection.transits.wheel}
                  onChange={(value) => {
                    patchTransits({ wheel: value });
                  }}
                />{' '}
                <Checkbox
                  label={t.aspectsTableLabel}
                  checked={fullSelection.transits.aspectsTable}
                  onChange={(value) => {
                    patchTransits({ aspectsTable: value });
                  }}
                />{' '}
                <DateField
                  label={t.asOfDateLabel}
                  value={fullSelection.transits.asOfDate ?? ''}
                  onChange={(value) => {
                    patchTransits({ asOfDate: value });
                  }}
                />
              </div>
            )}
          </div>

          <div>
            <Checkbox
              label={t.forecastLabel}
              checked={fullSelection.forecast !== undefined}
              onChange={(value) => {
                toggleForecast(value);
              }}
            />
            {fullSelection.forecast !== undefined && (
              <div className="settings-card-indent">
                <Select
                  label={t.filterPresetLabel}
                  value={fullSelection.forecast.filterPreset}
                  onChange={(value) => {
                    patchForecast({ filterPreset: value as PdfTransitFilterPreset });
                  }}
                  options={(['important', 'all'] as const).map((preset) => ({
                    value: preset,
                    label: t.filterPresetOptions[preset],
                  }))}
                />
                <br />
                <Checkbox
                  label={t.forecastDailyLabel}
                  checked={fullSelection.forecast.daily}
                  onChange={(value) => {
                    patchForecast({ daily: value });
                  }}
                />{' '}
                <Checkbox
                  label={t.forecastWeeklyLabel}
                  checked={fullSelection.forecast.weekly}
                  onChange={(value) => {
                    patchForecast({ weekly: value });
                  }}
                />{' '}
                <Checkbox
                  label={t.forecastMonthlyLabel}
                  checked={fullSelection.forecast.monthly}
                  onChange={(value) => {
                    patchForecast({ monthly: value });
                  }}
                />{' '}
                <Checkbox
                  label={t.forecastYearlyLabel}
                  checked={fullSelection.forecast.yearly}
                  onChange={(value) => {
                    patchForecast({ yearly: value });
                  }}
                />{' '}
                <DateField
                  label={t.asOfDateLabel}
                  value={fullSelection.forecast.asOfDate ?? ''}
                  onChange={(value) => {
                    patchForecast({ asOfDate: value });
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </Disclosure>

      <Disclosure title={t.eclipsesLegend} showLabel={t.showSection} hideLabel={t.hideSection} defaultOpen>
        <div className="field-group" role="group" aria-label={t.eclipsesLegend}>
          <Checkbox
            label={t.eclipsesLabel}
            checked={fullSelection.eclipses !== undefined}
            onChange={(value) => {
              toggleEclipses(value);
            }}
          />
          {fullSelection.eclipses !== undefined && (
            <div className="settings-card-indent">
              <NumberField
                label={t.fromYearLabel}
                step="any"
                value={String(fullSelection.eclipses.fromYear ?? '')}
                onChange={(value) => {
                  if (value === '') return;
                  patchEclipses({ fromYear: Number(value) });
                }}
              />{' '}
              <NumberField
                label={t.toYearLabel}
                step="any"
                value={String(fullSelection.eclipses.toYear ?? '')}
                onChange={(value) => {
                  if (value === '') return;
                  patchEclipses({ toYear: Number(value) });
                }}
              />
            </div>
          )}
        </div>
      </Disclosure>

      <Disclosure title={t.predictiveLegend} showLabel={t.showSection} hideLabel={t.hideSection} defaultOpen>
        <div className="field-group" role="group" aria-label={t.predictiveLegend}>
          <div>
            <Checkbox
              label={t.progressionsLabel}
              checked={fullSelection.progressions !== undefined}
              onChange={(value) => {
                toggleProgressions(value);
              }}
            />
            {fullSelection.progressions !== undefined && (
              <div className="settings-card-indent">
                <Select
                  label={t.progressionTechniqueLabel}
                  value={fullSelection.progressions.technique}
                  onChange={(value) => {
                    patchProgressions({ technique: value as PdfProgressionTechnique });
                  }}
                  options={(['secondary', 'tertiary', 'minor'] as const).map((technique) => ({
                    value: technique,
                    label: t.progressionTechniqueOptions[technique],
                  }))}
                />{' '}
                {fullSelection.progressions.technique === 'secondary' && (
                  <>
                    <Select
                      label={t.mcMethodLabel}
                      value={fullSelection.progressions.mcMethod}
                      onChange={(value) => {
                        patchProgressions({ mcMethod: value as ProgressedMcMethod });
                      }}
                      options={(['quotidian', 'naibod', 'solarArc'] as const).map((method) => ({
                        value: method,
                        label: t.mcMethodOptions[method],
                      }))}
                    />{' '}
                  </>
                )}
                <br />
                <Checkbox
                  label={t.positionsTableLabel}
                  checked={fullSelection.progressions.positionsTable}
                  onChange={(value) => {
                    patchProgressions({ positionsTable: value });
                  }}
                />{' '}
                <Checkbox
                  label={t.contactsTableLabel}
                  checked={fullSelection.progressions.contactsTable}
                  onChange={(value) => {
                    patchProgressions({ contactsTable: value });
                  }}
                />{' '}
                <DateField
                  label={t.asOfDateLabel}
                  value={fullSelection.progressions.asOfDate ?? ''}
                  onChange={(value) => {
                    patchProgressions({ asOfDate: value });
                  }}
                />
              </div>
            )}
          </div>

          <div>
            <Checkbox
              label={t.solarArcLabel}
              checked={fullSelection.solarArc !== undefined}
              onChange={(value) => {
                toggleSolarArc(value);
              }}
            />
            {fullSelection.solarArc !== undefined && (
              <div className="settings-card-indent">
                <Checkbox
                  label={t.positionsTableLabel}
                  checked={fullSelection.solarArc.positionsTable}
                  onChange={(value) => {
                    patchSolarArc({ positionsTable: value });
                  }}
                />{' '}
                <Checkbox
                  label={t.contactsTableLabel}
                  checked={fullSelection.solarArc.contactsTable}
                  onChange={(value) => {
                    patchSolarArc({ contactsTable: value });
                  }}
                />{' '}
                <DateField
                  label={t.asOfDateLabel}
                  value={fullSelection.solarArc.asOfDate ?? ''}
                  onChange={(value) => {
                    patchSolarArc({ asOfDate: value });
                  }}
                />
              </div>
            )}
          </div>

          <div>
            <Checkbox
              label={t.profectionsLabel}
              checked={fullSelection.profections !== undefined}
              onChange={(value) => {
                toggleProfections(value);
              }}
            />
            {fullSelection.profections !== undefined && (
              <div className="settings-card-indent">
                <Checkbox
                  label={t.profectionsTableLabel}
                  checked={fullSelection.profections.table}
                  onChange={(value) => {
                    patchProfections({ table: value });
                  }}
                />{' '}
                <Checkbox
                  label={t.meaningsLabel}
                  checked={fullSelection.profections.meanings}
                  onChange={(value) => {
                    patchProfections({ meanings: value });
                  }}
                />{' '}
                <DateField
                  label={t.asOfDateLabel}
                  value={fullSelection.profections.asOfDate ?? ''}
                  onChange={(value) => {
                    patchProfections({ asOfDate: value });
                  }}
                />
              </div>
            )}
          </div>

          <div>
            <Checkbox
              label={t.astrocartographyLabel}
              checked={fullSelection.astrocartography !== undefined}
              onChange={(value) => {
                toggleAstrocartography(value);
              }}
            />
            {fullSelection.astrocartography !== undefined && (
              <div className="settings-card-indent">
                {(() => {
                  const acg = fullSelection.astrocartography;
                  return (
                    <>
                      <Checkbox
                        label={t.astrocartographyMapLabel}
                        checked={acg.map}
                        onChange={(value) => {
                          patchAstrocartography({ map: value });
                        }}
                      />{' '}
                      <Checkbox
                        label={t.meaningsLabel}
                        checked={acg.meanings}
                        onChange={(value) => {
                          patchAstrocartography({ meanings: value });
                        }}
                      />{' '}
                      <Checkbox
                        label={t.localSpaceLabel}
                        checked={acg.localSpace}
                        onChange={(value) => {
                          patchAstrocartography({ localSpace: value });
                        }}
                      />
                      <br />
                      <span>{t.lineTypesLabel}: </span>
                      {PDF_ACG_LINE_TYPES.map((lineType) => (
                        <Checkbox
                          key={lineType}
                          label={t.lineTypeOptions[lineType]}
                          checked={acg.lineTypes.includes(lineType)}
                          onChange={(value) => {
                            toggleAstrocartographyLineType(lineType, value);
                          }}
                        />
                      ))}
                      <br />
                      <span>{t.bodiesLabel}: </span>
                      {[...TRADITIONAL_ACG_BODY_IDS, ...EXTENDED_ACG_BODY_IDS].map((body) => (
                        <Checkbox
                          key={body}
                          label={bodyDisplayName(bodyById(body)?.key ?? String(body), locale)}
                          checked={acg.bodies.includes(body)}
                          onChange={(value) => {
                            toggleAstrocartographyBody(body, value);
                          }}
                        />
                      ))}
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      </Disclosure>

      <div className="sticky-actions">
        <Button
          variant="primary"
          disabled={person === undefined || empty || status.kind === 'building' || needsAiConsentButMissing}
          aria-describedby={`${id}-status`}
          onClick={() => {
            void handleBuild();
          }}
        >
          {t.buildButton}
        </Button>
        {empty && <span className="muted">{t.selectSomething}</span>}
      </div>
      <p id={`${id}-status`} className="status" role="status" aria-live="polite">
        {status.kind === 'building' && t.buildingStatus}
        {status.kind === 'done' && status.skipped === 0 && '✓'}
        {status.kind === 'done' && status.skipped > 0 && t.someSectionsSkipped(String(status.skipped))}
      </p>
      {status.kind === 'error' && <StatusMessage kind="error">{status.message}</StatusMessage>}
    </main>
  );
}
