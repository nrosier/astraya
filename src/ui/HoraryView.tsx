/**
 * Horary chart (#406): a chart cast for the moment and place a question was asked, with the
 * traditional considerations before judgment checked against it. Needs no saved person and no
 * stored data — like the shared-chart screen it is computed entirely in this browser — so it lives
 * outside `Stored`. The chart itself is the same `ChartDataView` every other chart uses.
 *
 * It says whether the chart is fit to be judged and nothing more: reading the answer to the
 * question is the astrologer's work.
 */
/**
 * @module HoraryView
 * @purpose Renders the Horary chart tool screen: casts a chart for the moment/place a question was asked and checks the traditional considerations before judgment against it.
 * @conventions Needs no saved person (computed entirely in-browser), so it lives outside `Stored`, like ElectionalView; a judgment can be saved to the account store with its question (#1960), written as one `Store.mutate` batch from the record `ui/horary` builds, and the saved list is the `HoraryJudgments` card; it reports only whether the chart is fit to be judged, never an answer to the question itself. Reuses the shared `ChartDataView` and its controls slot (`ChartControlsOnly`, #1853). Text comes from co-located `HoraryView.messages.ts` via `useMessages()`.
 * @exports HoraryView
 */
import { GlossaryText } from './GlossaryText.js';
import { routeHref } from './route.js';
import { DateField } from './primitives/DateField.js';
import { Button } from './primitives/Button.js';
import { Select } from './primitives/Select.js';
import { TextField } from './primitives/TextField.js';
import { TimeField } from './primitives/TimeField.js';
import { useEffect, useState } from 'react';
import { newId } from '../domain/id.js';
import {
  HORARY_QUESTION_MAX_CHARACTERS,
  HoraryJudgmentRefusedError,
  horaryJudgmentCreate,
} from '../store/horary-judgments.js';
import { HoraryJudgments } from './HoraryJudgments.js';
import { useOptionalStore } from './store-context.js';
import { isRadical } from '../astrology/horary.js';
import { DEFAULT_EXTENDED_SETTINGS } from '../chart/extended-settings.js';
import { chartSheetMetaLines } from '../domain/chart-tables.js';
import { computeHoraryChart, HORARY_DEFAULT_HOUSE_SYSTEM, type HoraryChart } from '../domain/horary.js';
import { BirthPlaceSearch } from './BirthPlaceSearch.js';
import type { ChartViewKind } from './chart-sections.js';
import { ChartDataView } from './ChartView.js';
import { ChartControlsOnly } from './ChartTypeSelector.js';
import { useEphemerisProvider } from './EphemerisProviderContext.js';
import {
  buildHoraryRecord,
  HORARY_HOUSE_SYSTEMS,
  isHoraryQuestionSavable,
  nowFields,
  parseHoraryFields,
  saturnHouseOf,
  type HoraryFieldError,
} from './horary.js';
import { geocodeHost } from './geocode-provider.js';
import { horaryViewMessages } from './HoraryView.messages.js';
import { useLocale } from './locale.js';
import { useMessages } from './messages.js';
import { useRulershipChoice } from './rulership-setting.js';
import { transitViewMessages } from './TransitView.messages.js';
import { voidOfCourseSentence } from './void-of-course-text.js';
import type { BirthMomentInput } from '../time/types.js';
import { StatusMessage } from './primitives/StatusMessage.js';
import { formatFixed } from './format.js';
import { judgeHoraryWithMotion, type HoraryJudgment } from '../domain/horary-judgment.js';
import { replaceRoute } from './nav-history.js';
import { PageHeader } from './PageHeader.js';
import { useCalculationBasisLine } from './calculation-basis.js';

type Result =
  | { readonly kind: 'idle' }
  | { readonly kind: 'casting' }
  | {
      readonly kind: 'ready';
      readonly chart: HoraryChart;
      readonly moment: BirthMomentInput;
      /** The house system this chart was cast in, which a save records; the select may change before a recast. */
      readonly houseSystem: string;
      /** The place-search label for these coordinates, when a search filled them and they were not edited since. */
      readonly placeLabel: string | undefined;
    }
  | { readonly kind: 'error'; readonly message: string };

/** This screen's own view-href shape (#511): `#/horary`, with no person id or chart-type axis to carry. */
function horaryHref(view: ChartViewKind): string {
  return routeHref({ kind: 'horary', view });
}

export function HoraryView({ view }: { readonly view?: ChartViewKind | undefined }): React.JSX.Element {
  const t = useMessages(horaryViewMessages);
  const transit = useMessages(transitViewMessages);
  // A horary chart belongs to no saved person, so it follows the device default rulership (#806).
  const [rulership] = useRulershipChoice();
  const [locale] = useLocale();
  const { provider } = useEphemerisProvider();
  const [fields, setFields] = useState(() => ({ ...nowFields(), latitude: '', longitude: '' }));
  const [houseSystem, setHouseSystem] = useState(HORARY_DEFAULT_HOUSE_SYSTEM);
  const basisLine = useCalculationBasisLine({ ...DEFAULT_EXTENDED_SETTINGS, houseSystem }, rulership);
  const [quesitedHouse, setQuesitedHouse] = useState('7');
  const [coordsFromSearch, setCoordsFromSearch] = useState(false);
  const [fieldError, setFieldError] = useState<HoraryFieldError>();
  const [result, setResult] = useState<Result>({ kind: 'idle' });
  const [question, setQuestion] = useState('');
  const [placeLabel, setPlaceLabel] = useState<string>();
  const store = useOptionalStore();
  const [saveMessage, setSaveMessage] = useState<string>();
  const [saveError, setSaveError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const questionMax = String(HORARY_QUESTION_MAX_CHARACTERS);

  const cast = (): void => {
    if (provider === undefined) return;
    const parsed = parseHoraryFields(fields);
    if (!parsed.ok) {
      setFieldError(parsed.field);
      return;
    }
    setFieldError(undefined);
    setResult({ kind: 'casting' });
    setSaveMessage(undefined);
    setSaveError(undefined);
    const castSystem = houseSystem;
    const castLabel = placeLabel;
    void computeHoraryChart(parsed.moment, provider, castSystem).then(
      (chart) => {
        setResult({ kind: 'ready', chart, moment: parsed.moment, houseSystem: castSystem, placeLabel: castLabel });
      },
      (error: unknown) => {
        setResult({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
      },
    );
  };

  const edit = (patch: Partial<typeof fields>): void => {
    setFields((current) => ({ ...current, ...patch }));
  };

  const ready = result.kind === 'ready' ? result : undefined;
  const [judgment, setJudgment] = useState<HoraryJudgment>();

  useEffect(() => {
    if (ready?.chart.housesAvailable !== true || provider === undefined) {
      setJudgment(undefined);
      return undefined;
    }
    let cancelled = false;
    setJudgment(undefined);
    void judgeHoraryWithMotion(ready.chart.data, ready.chart.jd, provider, Number(quesitedHouse), {
      isVoidOfCourse: ready.chart.voidOfCourse.isVoid,
    }).then((next) => {
      if (!cancelled) setJudgment(next);
    });
    return () => {
      cancelled = true;
    };
  }, [provider, quesitedHouse, ready]);

  const canSave =
    store !== undefined && store.writable && judgment !== undefined && isHoraryQuestionSavable(question) && !saving;

  const save = (): void => {
    if (store === undefined || ready === undefined || judgment === undefined || !isHoraryQuestionSavable(question)) {
      return;
    }
    const trimmed = question.trim();
    const record = buildHoraryRecord({
      moment: ready.moment,
      houseSystem: ready.houseSystem,
      judgment,
      saturnHouse: saturnHouseOf(ready.chart.data),
      placeLabel: ready.placeLabel,
    });
    setSaving(true);
    setSaveError(undefined);
    setSaveMessage(undefined);
    void store
      .mutate(horaryJudgmentCreate(newId('h'), trimmed, record))
      .then(() => {
        setSaveMessage(t.saved(trimmed));
      })
      .catch((cause: unknown) => {
        if (cause instanceof HoraryJudgmentRefusedError) {
          setSaveError(cause.refusal === 'question-too-long' ? t.questionTooLong(questionMax) : t.invalidJudgment);
        } else {
          setSaveError(`${t.saveFailed} ${cause instanceof Error ? cause.message : String(cause)}`);
        }
      })
      .finally(() => {
        setSaving(false);
      });
  };

  return (
    <main className="shell shell--wide">
      <PageHeader title={t.heading} titleTerm="horary" basis={basisLine} basisEditHref={null} headingLevel={2} />
      <p className="hint">
        <GlossaryText text={t.hint} />
      </p>

      <div className="horary-form">
        <section className="horary-card horary-card--wide" aria-labelledby="horary-card-question">
          <h2 id="horary-card-question">{t.questionCardHeading}</h2>
          <TextField
            label={t.questionLabel}
            value={question}
            onChange={(value) => {
              setQuestion(value);
              setSaveMessage(undefined);
            }}
            help={t.questionHelp(questionMax)}
            autoComplete="off"
            inputProps={{ maxLength: HORARY_QUESTION_MAX_CHARACTERS }}
          />
        </section>

        <section className="horary-card" aria-labelledby="horary-card-datetime">
          <h2 id="horary-card-datetime">{t.dateTimeCardHeading}</h2>
          <div className="horary-timestamp">
            <DateField
              label={t.dateLabel}
              value={fields.date}
              onChange={(value) => {
                edit({ date: value });
              }}
            />
            <TimeField
              label={t.timeLabel}
              value={fields.time}
              onChange={(value) => {
                edit({ time: value });
              }}
            />
            <Button
              onClick={() => {
                edit(nowFields());
              }}
            >
              {t.setToNow}
            </Button>
          </div>
        </section>

        <section className="horary-card" aria-labelledby="horary-card-location">
          <h2 id="horary-card-location">{t.locationCardHeading}</h2>
          <BirthPlaceSearch
            onPick={(latitude, longitude, label) => {
              edit({ latitude: String(latitude), longitude: String(longitude) });
              setCoordsFromSearch(true);
              setPlaceLabel(label);
            }}
          />
          {/* Still editable; dimmed only to show a search has not filled them yet. */}
          <div className={coordsFromSearch ? 'horary-coords' : 'horary-coords horary-coords--pending'}>
            <TextField
              label={t.latitudeLabel}
              inputMode="decimal"
              value={fields.latitude}
              onChange={(value) => {
                edit({ latitude: value });
                setPlaceLabel(undefined);
              }}
            />
            <TextField
              label={t.longitudeLabel}
              inputMode="decimal"
              value={fields.longitude}
              onChange={(value) => {
                edit({ longitude: value });
                setPlaceLabel(undefined);
              }}
            />
          </div>
          <p className="hint">{t.geocodeNotice(geocodeHost)}</p>
        </section>

        <section className="horary-card horary-card--wide" aria-labelledby="horary-card-parameters">
          <h2 id="horary-card-parameters">{t.paramsCardHeading}</h2>
          <Select
            label={t.houseSystemLabel}
            value={houseSystem}
            options={HORARY_HOUSE_SYSTEMS.map((code) => ({ value: code, label: t.houseSystems[code] ?? code }))}
            onChange={setHouseSystem}
          />
          <Select
            label={t.quesitedHouseLabel}
            value={quesitedHouse}
            options={Array.from({ length: 12 }, (_, index) => ({
              value: String(index + 1),
              label: t.houseOption(index + 1),
            }))}
            onChange={setQuesitedHouse}
          />
        </section>

        {/* Not a <form>: BirthPlaceSearch renders its own, and forms may not nest. */}
        <div className="horary-actions">
          <Button variant="primary" disabled={provider === undefined || result.kind === 'casting'} onClick={cast}>
            {result.kind === 'casting' ? t.casting : t.castButton}
          </Button>
        </div>
      </div>

      {fieldError !== undefined && <StatusMessage kind="error">{t.fieldErrors[fieldError]}</StatusMessage>}
      {/* The result region: busy while the chart is cast, as the Astrocartography map is. */}
      <div aria-busy={result.kind === 'casting'}>
        {result.kind === 'error' && <StatusMessage kind="error">{t.error(result.message)}</StatusMessage>}

        {ready !== undefined && (
          <>
            <h2>{t.considerationsHeading}</h2>
            {/* Every consideration is a verdict on this chart, so none exists before one is cast. */}
            {!ready.chart.housesAvailable && (
              <StatusMessage kind="partial">
                <GlossaryText text={t.noHouses} />
              </StatusMessage>
            )}
            <p className={isRadical(ready.chart.considerations) ? 'horary-verdict' : 'horary-verdict warning'}>
              {isRadical(ready.chart.considerations)
                ? ready.chart.considerations.some((consideration) => consideration.applies)
                  ? t.radicalWithSoftened
                  : t.radical
                : t.notRadical(
                    ready.chart.considerations.filter(
                      (consideration) => consideration.applies && !consideration.softened,
                    ).length,
                  )}
            </p>
            <ul className="horary-considerations">
              {ready.chart.considerations.map((consideration) => {
                const copy = t.considerations[consideration.key];
                return (
                  <li key={consideration.key} className={consideration.applies ? 'applies' : 'clear'}>
                    <strong>{copy?.label ?? consideration.key}</strong>
                    {' — '}
                    <span className="horary-status">
                      {consideration.applies ? (consideration.softened ? t.appliesSoftened : t.applies) : t.clear}
                    </span>
                    <br />
                    <span className="hint">
                      {copy?.explanation === undefined ? undefined : <GlossaryText text={copy.explanation} />}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="hint">{voidOfCourseSentence(ready.chart.voidOfCourse, transit, locale)}</p>

            {judgment !== undefined && (
              <section aria-labelledby="horary-judgment-heading">
                <h2 id="horary-judgment-heading">{t.judgmentHeading}</h2>
                <p className="hint">
                  <GlossaryText text={t.judgmentSource} />
                </p>
                <p>
                  <GlossaryText
                    text={t.significators(
                      judgment.querent.rulerKey,
                      judgment.quesited.rulerKey,
                      judgment.quesited.house,
                    )}
                  />
                </p>
                {/* The verdict row (owner decision 3, #1960): the perfection line and Save share one row. */}
                <div className="horary-verdict-row">
                  <p>
                    <GlossaryText text={t.perfection[judgment.perfection.kind]} />
                  </p>
                  <Button variant="primary" disabled={!canSave} onClick={save}>
                    {t.saveJudgment}
                  </Button>
                </div>
                {!isHoraryQuestionSavable(question) && <p className="hint">{t.saveNeedsQuestion}</p>}
                {saveError !== undefined && <StatusMessage kind="error">{saveError}</StatusMessage>}
                {saveError === undefined && saveMessage !== undefined && (
                  <StatusMessage kind="success">{saveMessage}</StatusMessage>
                )}
                {judgment.perfection.timeToPerfectDays !== undefined && (
                  <p className="hint">{t.timing(formatFixed(judgment.perfection.timeToPerfectDays, 1))}</p>
                )}
                <p>{t.reception[judgment.reception.kind]}</p>
                {judgment.receptionAidsPerfection && <p className="hint">{t.receptionAidsPerfection}</p>}
              </section>
            )}

            <ChartDataView
              rulership={rulership}
              typeSelector={<ChartControlsOnly />}
              load={{ kind: 'ready', data: ready.chart.data }}
              displayName={t.chartName}
              showHouses={ready.chart.housesAvailable}
              metaLines={chartSheetMetaLines(t.chartName, ready.moment, locale)}
              view={view ?? 'wheel'}
              onViewChange={(next) => {
                replaceRoute(horaryHref(next));
              }}
              buildViewHref={horaryHref}
            />
          </>
        )}
      </div>

      <HoraryJudgments />
    </main>
  );
}
