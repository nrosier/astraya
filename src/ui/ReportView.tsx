/**
 * Renders one `Report` (#61) as a list of named sections, each a list of
 * paragraphs — the "Report" tab `ChartView.tsx` wires in. A "Show provenance"
 * toggle exposes, per paragraph, where its text came from (a corpus entry,
 * the mechanical fallback, or a chart-derived sentence) and, when the rule
 * engine ranked it, the factors behind that ranking — #62's "why this text?"
 * requirement.
 *
 * Thin wiring only: every string shown here is pre-formatted by
 * `report-provenance.ts`, which is plain and Vitest-testable, following the
 * same "thin `.tsx`, tested `.ts`" split `SortableTable.tsx`/`table-sort.ts`
 * already use.
 *
 * Language is a shared, app-wide setting (`locale.ts`), not this component's own state — this
 * view only consumes it. Tone and style are the AI-customised panel's job (#429 removed the
 * corpus-level advisor voices).
 *
 * Fetches its corpus chunk at runtime via `loadRuntimeCorpus` rather than
 * importing `CORPUS` from `../interpretation/index.js` — that export is the
 * full, synchronous, every-locale corpus the test suite needs,
 * and importing it here would inline all of it into this app's JS bundle.
 * See corpus-client.ts for why.
 *
 * A second, always-visible control (#527), `DegreeSymbolSetting`, shows or hides degree-symbol
 * (Sabian symbol) paragraphs altogether — a persisted per-device preference
 * (`degree-symbol-setting.ts`), unlike "Show provenance", which is a dev-only, page-local one.
 * It's its own named-and-explained section, the same label+explanation+control shape as
 * `RulershipSetting`, not a bare checkbox. A shown degree-symbol paragraph also carries a small
 * labelled block (`.sabian-label`, linking `<GlossaryTerm id="sabianSymbol">`) so it reads as a
 * distinct kind of note, not just another `.hint`-styled one. Since #653 its text is set apart: the
 * traditional image in quotation marks, then the reading under a "Key insight" label in italics
 * (`splitSabianText`; the corpus keeps one flat string per entry).
 */
/**
 * @module ReportView
 * @purpose Renders an interpretation Report's sections/paragraphs with a provenance toggle and a degree-symbol (Sabian symbol) visibility toggle, plus the Tier 2 opt-in AI-customized interpretation sub-tab (grounded restyle or freeform full-chart modes).
 * @conventions Thin wiring over report-provenance.ts; fetches its corpus chunk at runtime via corpus-client.ts rather than importing the full synchronous CORPUS; uses ReportView.messages.ts for en/nl text via useMessages(); the degree-symbol toggle's own label/explanation/control lives in DegreeSymbolSetting.tsx (controlled); this file owns the value via useShowDegreeSymbol() from degree-symbol-setting.ts, passes it down, and uses it to filter paragraphs.
 * @exports ReportView
 */
import { Fragment, useEffect, useId, useState } from 'react';
import { assembleReport, reportPlacementKeys, type Report, type ReportParagraph } from '../interpretation/report.js';
import { loadRuntimeCorpus } from '../interpretation/corpus-client.js';
import type { CorpusEntry, Locale } from '../interpretation/schema.js';
import { checkCustomPrompt, type GuardrailIssue } from '../interpretation/prompt-guardrail.js';
import { TextAreaField } from './primitives/TextAreaField.js';
import { Select } from './primitives/Select.js';
import { Checkbox } from './primitives/Checkbox.js';
import { useOnline } from './online-status.js';
import { StatusMessage } from './primitives/StatusMessage.js';
import { sharedMessages } from './shared.messages.js';
import { describeParagraphProvenance } from './report-provenance.js';
import { savedKindLabel } from './result-basis-label.js';
import { formatSavedTime } from './saved-time.js';
import { useLocale } from './locale.js';
import { useMessages } from './messages.js';
import { Tabs, tabPanelProps } from './primitives/Tabs.js';
import { RulershipSetting } from './RulershipSetting.js';
import { useRulershipChoice } from './rulership-setting.js';
import { splitSabianText } from '../interpretation/sabian-split.js';
import { groupParagraphsByBody } from '../interpretation/report-groups.js';
import { reportParagraphLabel, sabianDegreeLabel } from './placement-label.js';
import { placementBadges } from './report-placement-badges.js';
import { Badge } from './primitives/Badge.js';
import { chartOverview } from '../domain/chart-overview.js';
import { chartOverviewRows } from './chart-overview-rows.js';
import { chartOverviewMessages } from './chart-overview.messages.js';
import { bodyDisplayName } from './astro-names.messages.js';
import { useShowDegreeSymbol } from './degree-symbol-setting.js';
import { DegreeSymbolSetting } from './DegreeSymbolSetting.js';
import { SavedInterpretationsPanel } from './SavedInterpretationsPanel.js';
import { GlossaryTerm } from './GlossaryTerm.js';
import { useSessionUserOrUndefined } from './session-context.js';
import { reportViewMessages } from './ReportView.messages.js';
import {
  generateTier2Interpretation,
  toTier2ChartPayload,
  listSavedInterpretations,
  getSavedInterpretation,
  Tier2Error,
  type Tier2Section,
  type SavedInterpretationSummary,
} from '../interpretation/tier2-client.js';
import type { RulershipChoice } from '../astrology/rulership.js';
import type { ChartData } from '../domain/chart-compute.js';
import { NO_EXCLUSIONS, type InterpretationExclusions } from '../interpretation/rules.js';

type InterpretationTabKey = 'standard' | 'ai' | 'past';
const TAB_ORDER: readonly InterpretationTabKey[] = ['standard', 'ai', 'past'];

function tabLabels(t: typeof reportViewMessages.en): Record<InterpretationTabKey, string> {
  return { standard: t.standardTabLabel, ai: t.aiTabLabel, past: t.pastTabLabel };
}

/** One localized sentence per guardrail rule — never `issue.message` itself, which is English-only diagnostic text shared with the server's 400 response, not a user-facing string. */
function guardrailIssueMessage(t: typeof reportViewMessages.en, issue: GuardrailIssue): string {
  switch (issue.rule) {
    case 'length':
      return t.guardrailIssueLength;
    case 'prompt-injection':
      return t.guardrailIssuePromptInjection;
    case 'fatalistic-phrasing':
      return t.guardrailIssueFatalisticPhrasing;
    case 'medical-legal-financial-claim':
      return t.guardrailIssueMedicalLegalFinancialClaim;
    case 'pii-shape':
      return t.guardrailIssuePiiShape;
    case 'off-topic':
      return t.guardrailIssueOffTopic;
    case 'fabrication-request':
      return t.guardrailIssueFabricationRequest;
    case 'relationship-verdict':
      return t.guardrailIssueRelationshipVerdict;
  }
}

// degree-symbol (#405/#484) is a flat, always-secondary supplement next to the placement it
// sits beside (never scored into rules.ts's ranking). Shared between the toggle's filter and
// `Paragraph`'s own rendering, so the two never drift out of sync with each other.
function isDegreeSymbolParagraph(paragraph: ReportParagraph): boolean {
  return paragraph.placement?.category === 'degree-symbol';
}

/**
 * A Sabian paragraph (#653): the traditional image in quotation marks, then the reading under a "Key insight" label
 * in italics. The label, not the italics, carries the structure, so it reads the same to a screen reader.
 */
function SabianText({
  text,
  degree,
  locale,
}: {
  readonly text: string;
  readonly degree: number;
  readonly locale: Locale;
}): React.JSX.Element {
  const t = useMessages(reportViewMessages);
  const { image, insight } = splitSabianText(text);
  // A bordered, left-accented block (#802): the label (the glossary term, uppercased by CSS) and the degree it
  // belongs to, then the image, then the reading under its "Key insight" tag. One compact block, the same in print.
  return (
    <div className="sabian-callout">
      <p className="sabian-label">
        <GlossaryTerm id="sabianSymbol" />
      </p>
      <p className="sabian-degree">{sabianDegreeLabel(degree, locale)}</p>
      <p className="sabian-image">&ldquo;{image}&rdquo;</p>
      {insight !== undefined && (
        <p className="sabian-insight">
          <strong className="sabian-insight-tag">{t.keyInsightLabel}</strong> <em>{insight}</em>
        </p>
      )}
    </div>
  );
}

/** The facts under a placement's title (#802): sign and degree, house when it has one, and Retrograde only when it is. */
function PlacementBadgeList({
  chart,
  bodyKey,
  locale,
}: {
  readonly chart: ChartData;
  readonly bodyKey: string;
  readonly locale: Locale;
}): React.JSX.Element | null {
  const badges = placementBadges(chart, bodyKey, locale);
  if (badges === undefined) return null;
  return (
    <ul className="placement-badges">
      <li>
        <Badge>{badges.signDegree}</Badge>
      </li>
      {badges.houseBadge !== undefined && (
        <li>
          <Badge>{badges.houseBadge}</Badge>
        </li>
      )}
      {badges.retrogradeLabel !== undefined && (
        <li className="placement-badge-retro">
          <Badge>{badges.retrogradeLabel}</Badge>
        </li>
      )}
    </ul>
  );
}

function Paragraph({
  paragraph,
  showProvenance,
  locale,
  underBodyHeading = false,
}: {
  readonly paragraph: ReportParagraph;
  readonly showProvenance: boolean;
  readonly locale: Locale;
  /** True under a body's heading, whose name the label then leaves out (#666). */
  readonly underBodyHeading?: boolean;
}): React.JSX.Element {
  const provenance = describeParagraphProvenance(paragraph);
  // What the paragraph is about, in words and (for a sign) its degree (#654). A paragraph with no placement has no label.
  const label =
    paragraph.placement === undefined || paragraph.placement.category === 'degree-symbol'
      ? undefined
      : reportParagraphLabel(paragraph.placement, locale, paragraph.longitude, underBodyHeading);
  // Rendered visually de-emphasized, the same muted/smaller style every other secondary note in
  // this app already uses (`.hint`) — plus, since #527, a small named badge (not just `.hint`)
  // so a reader can tell a Sabian-symbol note apart from an ordinary secondary one, and look up
  // what it means without leaving the page.
  return (
    <li className="report-paragraph">
      {label !== undefined && <p className="report-placement-label">{label}</p>}
      {paragraph.placement?.category === 'degree-symbol' ? (
        <SabianText text={paragraph.text} degree={paragraph.placement.degree} locale={locale} />
      ) : (
        <p>{paragraph.text}</p>
      )}
      {showProvenance && (
        <p className="report-provenance hint">
          {provenance.placement !== undefined && <>{provenance.placement} &middot; </>}
          {provenance.source}
          {provenance.factors !== undefined && <> &mdash; {provenance.factors}</>}
        </p>
      )}
    </li>
  );
}

type Tier2Mode = 'grounded' | 'freeform';

/**
 * Tier 2 (#360): opt-in, authenticated, per-request-consented LLM-customized
 * interpretation — the "AI-Customized" sub-tab alongside the Tier-1
 * "Standard" one below. Consent is a plain checkbox, unchecked every
 * render — never persisted — since it authorizes one specific request, not
 * a standing preference.
 *
 * The one free-text field (style/tone/focus instructions) is run through
 * `checkCustomPrompt` on every keystroke so a rejected prompt is visible
 * before Generate is even clickable — a UX nicety only. The server runs the
 * same check authoritatively and does not trust this client-side pass, then
 * has a model verify the prompt (#411) before generating anything — a
 * rejection from that phase renders as its own alert, not a generic error.
 */
function AiCustomizedPanel({
  report,
  locale,
  chart,
  chartKind,
  exclude,
  personId,
}: {
  readonly report: Report;
  readonly locale: Locale;
  readonly chart: ChartData;
  /** What kind of chart `chart` is (#454) — the model needs to know when it isn't an ordinary natal chart. */
  readonly chartKind: 'natal' | 'composite';
  /** Objects left out of the reading (#721): not sent to the model either. */
  readonly exclude: InterpretationExclusions;
  /** The person the report is for (#768); absent, nothing is listed or generated. */
  readonly personId: string | undefined;
}): React.JSX.Element {
  const t = useMessages(reportViewMessages);
  const shared = useMessages(sharedMessages);
  const online = useOnline();
  const user = useSessionUserOrUndefined();
  const [consent, setConsent] = useState(false);
  const [mode, setMode] = useState<Tier2Mode>('grounded');
  const [customPrompt, setCustomPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<readonly Tier2Section[] | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [rejection, setRejection] = useState<{ readonly reason: string | undefined } | undefined>(undefined);
  const [savedResults, setSavedResults] = useState<readonly SavedInterpretationSummary[]>([]);
  const [openSavedId, setOpenSavedId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (user === undefined || personId === undefined) {
      setSavedResults([]);
      return;
    }
    // Empty (not an error) when the server has no ASTRAYA_ENCRYPTION_KEY configured — saving is
    // additive, so there's simply nothing to list, not a failure to surface (#392).
    void listSavedInterpretations({ personId }, locale)
      .then(setSavedResults)
      .catch(() => undefined);
  }, [user, personId, locale]);

  if (user === undefined) {
    return (
      <section className="report-section ai-customized-panel">
        <h3>{t.tier2Heading}</h3>
        <p className="hint">{t.tier2SignInPrompt}</p>
      </section>
    );
  }

  const placementKeys = reportPlacementKeys(report);
  // The AI-written mode's instruction is optional, so an empty one has nothing to guard.
  const guardrailIssues = mode === 'freeform' && customPrompt.trim() === '' ? [] : checkCustomPrompt(customPrompt);
  // Only shown once the user has typed something — otherwise the empty-prompt "length"
  // issue would announce itself on mount and re-announce on every keystroke, before the
  // user has had a chance to write anything.
  const visibleGuardrailIssues = customPrompt === '' ? [] : guardrailIssues;
  const disabledReason = !consent
    ? t.tier2GenerateDisabledConsent
    : mode === 'grounded' && customPrompt === ''
      ? t.tier2GenerateDisabledEmpty
      : guardrailIssues.length > 0
        ? t.tier2GenerateDisabledGuardrail
        : undefined;

  function handleGenerate(): void {
    if (personId === undefined) return;
    setGenerating(true);
    setError(undefined);
    setRejection(undefined);
    // Consent authorizes one specific request, not a standing preference (ADR 0003) — spent the
    // moment this request is dispatched, so a second "Generate" click (or a mode switch
    // afterward sending a broader payload) requires a fresh tick, not a leftover one (#391).
    setConsent(false);
    const request =
      mode === 'grounded'
        ? { mode: 'grounded' as const, placementKeys, customPrompt, locale, personId }
        : {
            mode: 'freeform' as const,
            chartData: toTier2ChartPayload(chart, exclude),
            ...(chartKind === 'natal' ? {} : { chartKind }),
            ...(customPrompt.trim() === '' ? {} : { customPrompt }),
            locale,
            personId,
          };
    generateTier2Interpretation(request)
      .then((sections) => {
        setResult(sections);
        // Refreshes the list so a just-saved generation (if saving is enabled on this server)
        // shows up without a reload — best-effort, same as the initial load (#392).
        void listSavedInterpretations({ personId }, locale)
          .then(setSavedResults)
          .catch(() => undefined);
      })
      .catch((caught: unknown) => {
        if (caught instanceof Tier2Error && caught.code === 'customization-rejected') {
          setRejection({ reason: caught.reason });
          return;
        }
        setError(caught instanceof Tier2Error ? caught.message : String(caught));
      })
      .finally(() => {
        setGenerating(false);
      });
  }

  function openSaved(id: string): void {
    setOpenSavedId(id);
    setError(undefined);
    setRejection(undefined);
    getSavedInterpretation(id)
      .then((detail) => {
        setResult(detail.sections);
      })
      .catch((caught: unknown) => {
        setError(caught instanceof Tier2Error ? caught.message : String(caught));
      })
      .finally(() => {
        setOpenSavedId(undefined);
      });
  }

  return (
    <section className="report-section ai-customized-panel">
      <h3>{t.tier2Heading}</h3>
      <Select
        label={t.tier2ModeLabel}
        value={mode}
        help={mode === 'grounded' ? t.tier2ModeGroundedDescription : t.tier2ModeFreeformDescription}
        options={[
          { value: 'grounded', label: t.tier2ModeGrounded },
          { value: 'freeform', label: t.tier2ModeFreeform },
        ]}
        onChange={(value) => {
          setMode(value as Tier2Mode);
          // The consent statement's wording depends on mode (what it discloses sending
          // differs) — switching mode re-requires a tick rather than carrying over consent
          // given under a different, narrower claim (#391).
          setConsent(false);
        }}
      />
      <Checkbox
        label={t.tier2ConsentLabel(mode)}
        checked={consent}
        onChange={(value) => {
          setConsent(value);
        }}
      />
      <TextAreaField
        label={t.customPromptLabel}
        optional={mode === 'freeform'}
        placeholder={t.customPromptPlaceholder}
        value={customPrompt}
        onChange={(value) => {
          setCustomPrompt(value);
          setRejection(undefined);
        }}
      />
      {visibleGuardrailIssues.length > 0 && (
        <div className="ai-customized-guardrail-issues warning" aria-live="polite">
          <ul>
            {visibleGuardrailIssues.map((issue) => (
              <li key={issue.rule}>{guardrailIssueMessage(t, issue)}</li>
            ))}
          </ul>
        </div>
      )}
      <button
        type="button"
        disabled={
          !consent ||
          (mode === 'grounded' && customPrompt === '') ||
          guardrailIssues.length > 0 ||
          generating ||
          !online
        }
        aria-label={disabledReason === undefined ? undefined : `${t.tier2Generate} — ${disabledReason}`}
        onClick={handleGenerate}
      >
        {generating ? t.tier2Generating : t.tier2Generate}
      </button>
      {!online && <StatusMessage kind="offline">{shared.offlineNeeded}</StatusMessage>}
      {error !== undefined && <StatusMessage kind="error">{t.tier2Error(error)}</StatusMessage>}
      {rejection !== undefined && (
        <div className="ai-customized-rejection warning" role="alert">
          <p>{t.tier2CustomizationRejected}</p>
          {rejection.reason !== undefined && <p>{t.tier2CustomizationRejectedReason(rejection.reason)}</p>}
        </div>
      )}
      {result !== undefined && (
        <div className="tier2-result">
          {result.map((section) => (
            <article key={section.heading}>
              <h4>{section.heading}</h4>
              <p>{section.body}</p>
            </article>
          ))}
        </div>
      )}
      {savedResults.length > 0 && (
        <div className="tier2-saved-results">
          <h4>{t.tier2SavedHeading}</h4>
          <ul>
            {savedResults.map((saved) => (
              <li key={saved.id}>
                <button
                  type="button"
                  className="quiet"
                  disabled={openSavedId !== undefined}
                  onClick={() => {
                    openSaved(saved.id);
                  }}
                >
                  {t.tier2SavedEntry(
                    formatSavedTime(saved.createdAt, locale),
                    savedKindLabel(saved, locale),
                    saved.description,
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export function ReportView({
  chart,
  chartKind = 'natal',
  exclude = NO_EXCLUSIONS,
  personId,
  rulership: rulershipProp,
  onRulershipChange,
}: {
  readonly chart: ChartData;
  /**
   * Objects the practitioner left out of the written reading (#721), from the chart's object policy. The reading
   * and the AI payload both honour it, and the page says what it covers. Empty (every object read) by default, so a
   * view that has no object policy of its own behaves as before.
   */
  readonly exclude?: InterpretationExclusions;
  /**
   * What kind of chart `chart` is (#454) — defaults to `'natal'`, which every caller except
   * `CompositeView.tsx` is. A composite chart's facts are a two-person midpoint synthesis, not
   * an individual's own placements; the Tier 2 freeform-mode model needs to be told so, the
   * same framing gap #450 separately covers for the pre-generated corpus report.
   */
  readonly chartKind?: 'natal' | 'composite';
  /** The person the report is for (#768): its AI readings list and save under them. Absent (until every caller passes it), nothing is listed or generated. */
  readonly personId?: string | undefined;
  /**
   * The planetary rulers for this report (#806): the person's own choice. Left out for a composite, which belongs to
   * no single person, the report follows the device default rulership.
   */
  readonly rulership?: RulershipChoice | undefined;
  /** Saves a changed ruler choice on the person; left out (a composite), the control edits the device default rulership. */
  readonly onRulershipChange?: ((rulership: RulershipChoice) => void | Promise<void>) | undefined;
}): React.JSX.Element {
  const t = useMessages(reportViewMessages);
  const overviewT = useMessages(chartOverviewMessages);
  const [activeTab, setActiveTab] = useState<InterpretationTabKey>('standard');
  const [showProvenance, setShowProvenance] = useState(false);
  const [locale] = useLocale();
  const [deviceRulership, setDeviceRulership] = useRulershipChoice();
  const rulership = rulershipProp ?? deviceRulership;
  const [showDegreeSymbol, setShowDegreeSymbol] = useShowDegreeSymbol();
  const [corpus, setCorpus] = useState<readonly CorpusEntry[] | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const configHeadingId = `report-config-${useId().replace(/:/g, '')}`;

  useEffect(() => {
    let cancelled = false;
    setCorpus(undefined);
    setLoadError(undefined);
    loadRuntimeCorpus(locale)
      .then((loaded) => {
        if (!cancelled) setCorpus(loaded);
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  if (loadError !== undefined) {
    return (
      <div className="report">
        <p role="alert">{t.couldNotLoad(loadError)}</p>
      </div>
    );
  }
  if (corpus === undefined) {
    return (
      <div className="report">
        <p>{t.loadingInterpretation}</p>
      </div>
    );
  }

  const report: Report = assembleReport(chart, locale, corpus, rulership, chartKind, exclude);

  const controls = (
    <div className="report-controls">
      <div className="config-block" role="group" aria-labelledby={configHeadingId}>
        <h3 id={configHeadingId} className="config-block-heading">
          {t.configurationHeading}
        </h3>
        <RulershipSetting value={rulership} onChange={onRulershipChange ?? setDeviceRulership} />
        <DegreeSymbolSetting show={showDegreeSymbol} onChange={setShowDegreeSymbol} />
      </div>
      {!import.meta.env.PROD && (
        <Checkbox
          label={t.showProvenance}
          checked={showProvenance}
          onChange={(value) => {
            setShowProvenance(value);
          }}
        />
      )}
    </div>
  );

  return (
    <div className="report">
      <Tabs
        idBase="interpretation"
        label={t.interpretationTablist}
        items={TAB_ORDER.map((tab) => ({ key: tab, label: tabLabels(t)[tab] }))}
        active={activeTab}
        onSelect={setActiveTab}
      />

      <div {...tabPanelProps('interpretation', activeTab)}>
        <p className="hint">{t.interpretationDisclaimer}</p>
        {exclude.size > 0 && (
          // What the reading leaves out (#721), so the scope can be checked without comparing it to the chart.
          <p className="hint report-scope">
            {t.reportScopeExcludes(
              [...exclude]
                .map((key) => bodyDisplayName(key, locale))
                .sort((a, b) => a.localeCompare(b, locale))
                .join(', '),
            )}
          </p>
        )}
        {activeTab === 'standard' ? (
          <>
            {controls}
            {chartKind === 'natal' && (
              // The chart's headline facts, the same rows the PDF and the consultation page show (#691).
              <section className="chart-overview" aria-labelledby="chart-overview-heading">
                <h3 id="chart-overview-heading">{overviewT.heading}</h3>
                <dl>
                  {chartOverviewRows(chartOverview(chart, rulership), locale).map((row) => (
                    <Fragment key={row.term}>
                      <dt>{row.term}</dt>
                      <dd>{row.value}</dd>
                    </Fragment>
                  ))}
                </dl>
              </section>
            )}
            <nav className="report-toc" aria-label={t.tocAriaLabel}>
              <h3>{t.tocHeading}</h3>
              <ul>
                {report.sections.map((section) => (
                  <li key={section.id}>
                    {/* Not a plain in-page `<a href="#...">`: the app's own hash-based router
                        (`route.ts`) treats every `hashchange` as a navigation, and a bare
                        anchor click here would match no known route and bounce to the people
                        list instead of scrolling (#373). Scroll and focus the target directly,
                        without touching `window.location.hash`. */}
                    <a
                      href={`#report-section-${section.id}`}
                      onClick={(event) => {
                        event.preventDefault();
                        document.getElementById(`report-section-${section.id}`)?.focus();
                      }}
                    >
                      {section.title}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
            {report.sections.map((section) => (
              <section key={section.id} id={`report-section-${section.id}`} className="report-section" tabIndex={-1}>
                <h3>{section.title}</h3>
                {groupParagraphsByBody(
                  section.paragraphs.filter((paragraph) => showDegreeSymbol || !isDegreeSymbolParagraph(paragraph)),
                ).map((group, groupIndex) =>
                  group.bodyKey === undefined ? (
                    <ul key={`${section.id}-${String(groupIndex)}`}>
                      {group.paragraphs.map((paragraph, index) => (
                        <Paragraph
                          key={`${section.id}-${String(groupIndex)}-${String(index)}`}
                          paragraph={paragraph}
                          showProvenance={showProvenance}
                          locale={locale}
                        />
                      ))}
                    </ul>
                  ) : (
                    <section
                      key={`${section.id}-${String(groupIndex)}`}
                      className="report-body-group"
                      aria-label={bodyDisplayName(group.bodyKey, locale)}
                    >
                      <h4 className="report-body-heading">{bodyDisplayName(group.bodyKey, locale)}</h4>
                      <PlacementBadgeList chart={chart} bodyKey={group.bodyKey} locale={locale} />
                      <ul>
                        {group.paragraphs.map((paragraph, index) => (
                          <Paragraph
                            key={`${section.id}-${String(groupIndex)}-${String(index)}`}
                            paragraph={paragraph}
                            showProvenance={showProvenance}
                            locale={locale}
                            underBodyHeading
                          />
                        ))}
                      </ul>
                    </section>
                  ),
                )}
              </section>
            ))}
          </>
        ) : activeTab === 'ai' ? (
          <AiCustomizedPanel
            report={report}
            locale={locale}
            chart={chart}
            chartKind={chartKind}
            exclude={exclude}
            personId={personId}
          />
        ) : (
          <SavedInterpretationsPanel personId={personId} />
        )}
      </div>
    </div>
  );
}
