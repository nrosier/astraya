/**
 * @module ChartViewPatterns
 * @purpose Renders the Patterns & condition chart view: chart shape, lunar phase, sect, aspect patterns, dignities, condition, dispositors and receptions.
 * @conventions Pure move out of ChartView.tsx (#817): same markup and strings, no behaviour change; takes the chart data and message bundle as arguments and never imports ChartView.
 * @exports dignityColumns, almutenCandidateColumns, conditionColumns, dispositorColumns, receptionColumns, renderDignitiesTable, renderPatternsView
 */
import { Tooltip } from './primitives/Tooltip.js';
import { GlossaryTerm } from './GlossaryTerm.js';
import {
  almutenOfAscendant,
  chartShapeOf,
  conditionRows,
  dignityRows,
  dispositorRows,
  receptionRows,
  type AlmutenCandidateRow,
  type ConditionRow,
  type DignityRow,
  type DispositorRow,
  type PointVisibilityOptions,
  type ReceptionRow,
} from '../domain/chart-tables.js';
import { type ChartData } from '../domain/chart-compute.js';
import { deriveExportFilename } from '../domain/export-filename.js';
import { renderJonesShapeDiagramSvg } from '../chart/jones-shape-diagram.js';
import { lunarPhaseOf } from '../astrology/lunar-phase.js';
import type { DignityType } from '../astrology/reception.js';
import { jonesBodyPositions } from '../astrology/jones-shapes.js';
import { bodyById, bodyByKey } from '../astrology/bodies.js';
import { besiegementRescueList } from './besiegement-rescue-label.js';
import { bodyDisplayName } from './astro-names.messages.js';
import type { chartViewMessages } from './ChartView.messages.js';
import { findAspectPatterns, PATTERN_BODY_KEYS } from '../astrology/aspect-patterns.js';
import type { RulershipChoice } from '../astrology/rulership.js';
import type { BoundsScheme } from '../astrology/bounds.js';
import { SortableTable } from './SortableTable.js';
import type { TableColumn } from './table-sort.js';
import type { Locale } from '../interpretation/schema.js';

export function dignityColumns(t: typeof chartViewMessages.en, locale: Locale): readonly TableColumn<DignityRow>[] {
  return [
    {
      key: 'bodyName',
      label: t.bodyLabel,
      valueOf: (row) => row.bodyName,
      render: (row) => bodyDisplayName(row.bodyKey, locale),
    },
    {
      key: 'ruler',
      label: t.rulerLabel,
      labelTooltip: t.rulerTooltip,
      valueOf: (row) => row.ruler,
      align: 'center',
      render: (row) => (row.ruler ? '✓' : ''),
    },
    {
      key: 'exalted',
      label: t.exaltedLabel,
      labelTooltip: t.exaltedTooltip,
      valueOf: (row) => row.exalted,
      align: 'center',
      render: (row) => (row.exalted ? '✓' : ''),
    },
    {
      key: 'detriment',
      label: t.detrimentLabel,
      labelTooltip: t.detrimentTooltip,
      valueOf: (row) => row.detriment,
      align: 'center',
      render: (row) => (row.detriment ? '✓' : ''),
    },
    {
      key: 'fall',
      label: t.fallLabel,
      labelTooltip: t.fallTooltip,
      valueOf: (row) => row.fall,
      align: 'center',
      render: (row) => (row.fall ? '✓' : ''),
    },
    {
      key: 'triplicity',
      label: t.triplicityLabel,
      labelTooltip: t.triplicityTooltip,
      valueOf: (row) => row.triplicity,
      align: 'center',
      render: (row) => (row.triplicity ? '✓' : ''),
    },
    {
      key: 'bound',
      label: t.boundLabel,
      labelTooltip: t.boundTooltip,
      valueOf: (row) => row.bound,
      align: 'center',
      render: (row) => (row.bound ? '✓' : ''),
    },
    {
      key: 'face',
      label: t.faceLabel,
      labelTooltip: t.faceTooltip,
      valueOf: (row) => row.face,
      align: 'center',
      render: (row) => (row.face ? '✓' : ''),
    },
    { key: 'points', label: t.dignityPointsLabel, valueOf: (row) => row.points },
    {
      key: 'peregrine',
      label: t.peregrineLabel,
      labelTooltip: t.peregrineTooltip,
      valueOf: (row) => row.peregrine,
      align: 'center',
      render: (row) => (row.peregrine ? '✓' : ''),
    },
  ];
}

/** Every Almuten-of-the-Ascendant candidate's own score breakdown (#551) — not only the winner's name. */
export function almutenCandidateColumns(
  t: typeof chartViewMessages.en,
  locale: Locale,
): readonly TableColumn<AlmutenCandidateRow>[] {
  return [
    {
      key: 'bodyName',
      label: t.bodyLabel,
      valueOf: (row) => row.bodyName,
      render: (row) => bodyDisplayName(row.bodyKey, locale),
    },
    {
      key: 'ruler',
      label: t.rulerLabel,
      valueOf: (row) => row.ruler,
      align: 'center',
      render: (row) => (row.ruler ? '✓' : ''),
    },
    {
      key: 'exalted',
      label: t.exaltedLabel,
      valueOf: (row) => row.exalted,
      align: 'center',
      render: (row) => (row.exalted ? '✓' : ''),
    },
    {
      key: 'triplicity',
      label: t.triplicityLabel,
      valueOf: (row) => row.triplicity,
      align: 'center',
      render: (row) => (row.triplicity ? '✓' : ''),
    },
    {
      key: 'bound',
      label: t.boundLabel,
      valueOf: (row) => row.bound,
      align: 'center',
      render: (row) => (row.bound ? '✓' : ''),
    },
    {
      key: 'face',
      label: t.faceLabel,
      valueOf: (row) => row.face,
      align: 'center',
      render: (row) => (row.face ? '✓' : ''),
    },
    { key: 'points', label: t.dignityPointsLabel, valueOf: (row) => row.points },
  ];
}

/** The traditional planetary-condition table (#547) — sect alignment, angularity, hayz, motion, besiegement, solar phase/proximity. */
export function conditionColumns(
  t: typeof chartViewMessages.en,
  locale: Locale,
  motionScoreVisible = false,
): readonly TableColumn<ConditionRow>[] {
  const sectAlignmentLabel = (row: ConditionRow): string =>
    row.sectAlignment === 'ofSect' ? t.ofSect : row.sectAlignment === 'contraSect' ? t.contraSect : t.sectNeutral;
  const angularityLabel = (row: ConditionRow): string =>
    row.angularity === 'angular'
      ? t.angular
      : row.angularity === 'succedent'
        ? t.succedent
        : row.angularity === 'cadent'
          ? t.cadent
          : '—';
  const motionLabel = (row: ConditionRow): string =>
    row.motion === 'retrograde'
      ? t.retrogradeLabel
      : row.motion === 'stationary'
        ? row.stationType === 'first'
          ? t.stationaryFirstLabel
          : row.stationType === 'second'
            ? t.stationarySecondLabel
            : t.stationaryLabel
        : t.directLabel;
  const solarPhaseLabel = (row: ConditionRow): string =>
    row.solarPhase === 'oriental' ? t.oriental : row.solarPhase === 'occidental' ? t.occidental : '—';
  const solarConditionLabel = (row: ConditionRow): string =>
    row.solarCondition === 'cazimi'
      ? t.cazimi
      : row.solarCondition === 'combust'
        ? t.combust
        : row.solarCondition === 'underTheBeams'
          ? t.underTheBeams
          : row.solarCondition === 'free'
            ? t.solarConditionFree
            : '—';
  return [
    {
      key: 'bodyName',
      label: t.bodyLabel,
      valueOf: (row) => row.bodyName,
      render: (row) => bodyDisplayName(row.bodyKey, locale),
    },
    { key: 'points', label: t.dignityPointsLabel, valueOf: (row) => row.points },
    {
      key: 'peregrine',
      label: t.peregrineLabel,
      labelTooltip: t.peregrineTooltip,
      valueOf: (row) => row.peregrine,
      align: 'center',
      render: (row) => (row.peregrine ? '✓' : ''),
    },
    {
      key: 'sectAlignment',
      label: t.sectAlignmentLabel,
      labelTooltip: t.sectAlignmentTooltip,
      valueOf: (row) => row.sectAlignment,
      render: sectAlignmentLabel,
    },
    {
      key: 'angularity',
      label: t.angularityLabel,
      labelTooltip: t.angularityTooltip,
      valueOf: (row) => row.angularity ?? '',
      render: angularityLabel,
    },
    { key: 'motion', label: t.motionLabel, valueOf: (row) => row.motion, render: motionLabel },
    // Only with the motion score on (#724), so the table is unchanged while it is off.
    ...(motionScoreVisible
      ? [
          {
            key: 'motionScore',
            label: t.motionScoreLabel,
            labelTooltip: t.motionScoreTooltip,
            valueOf: (row: ConditionRow) => row.motionScore ?? '',
            align: 'center' as const,
            render: (row: ConditionRow) =>
              row.motionScore === undefined
                ? '—'
                : row.motionScore > 0
                  ? `+${String(row.motionScore)}`
                  : String(row.motionScore),
          },
        ]
      : []),
    {
      key: 'inHayz',
      label: t.hayzLabel,
      labelTooltip: t.hayzTooltip,
      valueOf: (row) => row.inHayz ?? false,
      align: 'center',
      render: (row) => (row.inHayz === true ? '✓' : row.inHayz === false ? '' : '—'),
    },
    {
      key: 'besieged',
      label: t.besiegedLabel,
      labelTooltip: t.besiegedTooltip,
      valueOf: (row) => row.besieged,
      align: 'center',
      render: (row) =>
        !row.besieged
          ? ''
          : row.besiegementRescuedBy === undefined
            ? '✓'
            : `✓ (${t.besiegedEased(besiegementRescueList(row.besiegementRescuedBy, locale))})`,
    },
    {
      key: 'solarPhase',
      label: t.solarPhaseLabel,
      labelTooltip: t.solarPhaseTooltip,
      valueOf: (row) => row.solarPhase ?? '',
      render: solarPhaseLabel,
    },
    {
      key: 'solarCondition',
      label: t.solarConditionLabel,
      labelTooltip: t.solarConditionTooltip,
      valueOf: (row) => row.solarCondition ?? '',
      render: solarConditionLabel,
    },
  ];
}

export function dispositorColumns(
  t: typeof chartViewMessages.en,
  locale: Locale,
): readonly TableColumn<DispositorRow>[] {
  return [
    {
      key: 'bodyName',
      label: t.bodyLabel,
      valueOf: (row) => row.bodyName,
      render: (row) => bodyDisplayName(row.bodyKey, locale),
    },
    {
      key: 'chain',
      label: t.chainLabel,
      valueOf: (row) =>
        row.chain.map((key) => bodyByKey(key)?.name ?? key).join(' → ') +
        (row.coDispositorKey === undefined
          ? ''
          : ` (+ ${bodyByKey(row.coDispositorKey)?.name ?? row.coDispositorKey})`),
      render: (row) =>
        row.chain.map((key) => bodyDisplayName(key, locale)).join(' → ') +
        (row.coDispositorKey === undefined ? '' : ` (+ ${bodyDisplayName(row.coDispositorKey, locale)})`),
    },
    {
      key: 'finalDispositorName',
      label: t.finalDispositorLabel,
      valueOf: (row) => row.finalDispositorName ?? '',
      render: (row) => (row.finalDispositorKey === undefined ? '—' : bodyDisplayName(row.finalDispositorKey, locale)),
    },
    { key: 'cycle', label: t.cycleLabel, valueOf: (row) => row.cycle, render: (row) => (row.cycle ? '✓' : '') },
    {
      key: 'mutualReception',
      label: t.mutualReceptionLabel,
      valueOf: (row) => row.mutualReception,
      align: 'center',
      render: (row) => (row.mutualReception ? '✓' : ''),
    },
  ];
}

/** Short, translated dignity-type name, reusing the exact labels `dignityColumns`' own headers already use. */
function dignityTypeLabel(t: typeof chartViewMessages.en, dignityType: DignityType): string {
  switch (dignityType) {
    case 'domicile':
      return t.rulerLabel;
    case 'exaltation':
      return t.exaltedLabel;
    case 'triplicity':
      return t.triplicityLabel;
    case 'bound':
      return t.boundLabel;
    case 'face':
      return t.faceLabel;
    default:
      return dignityType;
  }
}

/** Every receiving pair among the traditional planets (#548) — mutual/one-way reception, by which dignity, and whether the pair is also in aspect. */
export function receptionColumns(t: typeof chartViewMessages.en, locale: Locale): readonly TableColumn<ReceptionRow>[] {
  return [
    {
      key: 'bodyAName',
      label: t.bodyALabel,
      valueOf: (row) => row.bodyAName,
      render: (row) => bodyDisplayName(row.bodyAKey, locale),
    },
    {
      key: 'bodyBName',
      label: t.bodyBLabel,
      valueOf: (row) => row.bodyBName,
      render: (row) => bodyDisplayName(row.bodyBKey, locale),
    },
    {
      key: 'kind',
      label: t.receptionKindLabel,
      valueOf: (row) => row.kind,
      render: (row) => (row.kind === 'mutual' ? t.mutualReceptionKind : t.oneWayReceptionKind),
    },
    {
      key: 'aFromBTypes',
      label: t.receptionAFromBLabel,
      valueOf: (row) => row.aFromBTypes.join(','),
      render: (row) => row.aFromBTypes.map((type) => dignityTypeLabel(t, type)).join(', '),
    },
    {
      key: 'bFromATypes',
      label: t.receptionBFromALabel,
      valueOf: (row) => row.bFromATypes.join(','),
      render: (row) => row.bFromATypes.map((type) => dignityTypeLabel(t, type)).join(', '),
    },
    {
      key: 'sameDignityType',
      label: t.receptionSameTypeLabel,
      labelTooltip: t.receptionSameTypeTooltip,
      valueOf: (row) => row.sameDignityType,
      align: 'center',
      render: (row) => (row.sameDignityType ? '✓' : ''),
    },
    {
      key: 'aspectLinked',
      label: t.aspectLinkedLabel,
      labelTooltip: t.aspectLinkedTooltip,
      valueOf: (row) => row.aspectLinked,
      align: 'center',
      render: (row) => (row.aspectLinked ? '✓' : ''),
    },
  ];
}

/**
 * The chart-shape section (#430): the Jones shape with its diagram and an explanation worded as a
 * convention, then what else describes the chart's overall character rather than a position — the
 * Moon's phase and, when the chart has houses, its sect. The shape comes from the ten planets only
 * (`chartShapeOf`).
 */
function renderShapeSection(
  data: ChartData,
  hasHouses: boolean,
  t: typeof chartViewMessages.en,
  locale: Locale,
): React.ReactNode {
  const shape = chartShapeOf(data);
  const shapePositions = jonesBodyPositions(data.positions);
  const sunBody = bodyByKey('sun');
  const moonBody = bodyByKey('moon');
  const sunLongitude = data.positions.find((position) => position.body === sunBody?.id)?.longitude;
  const moonLongitude = data.positions.find((position) => position.body === moonBody?.id)?.longitude;
  const lunarPhase =
    sunLongitude === undefined || moonLongitude === undefined ? undefined : lunarPhaseOf(moonLongitude, sunLongitude);
  return (
    <>
      {shape === undefined ? (
        <p className="hint">{t.shapeCannotBeWorkedOut}</p>
      ) : (
        <div className="chart-shape-summary">
          <div>
            <p>
              <strong>
                {t.chartShapeSentence(
                  t.jonesShapeLabels[shape.shape],
                  shape.handle === undefined ? undefined : bodyDisplayName(bodyById(shape.handle)?.key ?? '', locale),
                )}
              </strong>
            </p>
            <p>{t.jonesShapeExplanations[shape.shape]}</p>
            <p className="hint">{t.shapeSourceNote}</p>
          </div>
          <div
            className="chart-shape-diagram-wrap"
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: renderJonesShapeDiagramSvg(shape, shapePositions, 140) }}
          />
        </div>
      )}
      {lunarPhase !== undefined && (
        <p className="lunar-phase-summary">
          {t.lunarPhaseSentence(
            t.lunarPhaseLabels[lunarPhase.phase],
            formatElongation(lunarPhase.elongation),
            lunarPhase.waxing,
            Math.round(lunarPhase.illumination * 100),
          )}
        </p>
      )}
      {hasHouses && (
        <p>
          {t.sectPrefix} {data.sect === 'day' ? t.dayChart : t.nightChart}
        </p>
      )}
      {renderAspectPatterns(data, t, locale)}
    </>
  );
}

/**
 * Aspect configurations (#640): the multi-body shapes among the ten planets, read off the chart's own aspects, so they
 * follow the orbs in force. Named only; no interpretation text exists for them yet.
 */
function renderAspectPatterns(data: ChartData, t: typeof chartViewMessages.en, locale: Locale): React.ReactNode {
  const planets = PATTERN_BODY_KEYS.flatMap((key) => {
    const body = bodyByKey(key);
    return body === undefined ? [] : [body.id];
  });
  const patterns = findAspectPatterns(data.aspects, planets);
  const name = (id: number): string => bodyDisplayName(bodyById(id)?.key ?? '', locale);
  return (
    <section aria-labelledby="aspect-patterns-heading">
      <h3 id="aspect-patterns-heading">{t.aspectPatternsHeading}</h3>
      {patterns.length === 0 ? (
        <p className="hint">{t.noAspectPatterns}</p>
      ) : (
        <ul>
          {patterns.map((pattern) => (
            <li key={`${pattern.kind}-${pattern.bodies.join('-')}`}>
              {t.aspectPatternLine(
                t.aspectPatternNames[pattern.kind],
                pattern.bodies.map(name).join(t.aspectPatternSeparator),
                pattern.kind === 't-square' || pattern.kind === 'yod' || pattern.kind === 'kite'
                  ? name(pattern.bodies[0] ?? -1)
                  : undefined,
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="hint">{t.aspectPatternsSourceNote}</p>
    </section>
  );
}

/** `337°28'`: an elongation to the minute, the way Astro-Seek prints it beside the phase name. */
function formatElongation(elongation: number): string {
  const totalMinutes = Math.round(elongation * 60) % (360 * 60);
  return `${String(Math.floor(totalMinutes / 60))}°${String(totalMinutes % 60).padStart(2, '0')}'`;
}

/** The Dignities, condition, dispositors and reception tables, one case of the old `renderTableTab`. */
export function renderDignitiesTable(
  data: ChartData,
  displayName: string,
  pointVisibility: PointVisibilityOptions,
  t: typeof chartViewMessages.en,
  locale: Locale,
  rulership: RulershipChoice,
  boundsScheme: BoundsScheme,
): React.ReactNode {
  // Always traditional (#545) — almutenOfAscendant no longer takes a rulership/display-choice parameter.
  const almuten = almutenOfAscendant(data, boundsScheme);
  return (
    <>
      {almuten !== undefined && (
        <>
          <p className="hint">
            {t.almutenOfAscendantSentence(almuten.almutens.map((key) => bodyDisplayName(key, locale)).join(', '))}{' '}
            <Tooltip text={t.almutenTooltip} label={t.almutenTooltipLabel}>
              ?
            </Tooltip>
          </p>
          <p className="hint">{t.almutenScopeNote}</p>
          {/* Every candidate's own breakdown, not only the winner's name (#551). */}
          <SortableTable
            caption={t.almutenBreakdownCaption}
            columns={almutenCandidateColumns(t, locale)}
            rows={almuten.candidates}
            getRowKey={(row) => row.bodyKey}
            downloadFilename={deriveExportFilename(displayName, 'almuten', 'csv')}
          />
        </>
      )}
      <SortableTable
        caption={t.dignitiesCaption}
        captionTerm="dignity"
        columns={dignityColumns(t, locale)}
        rows={dignityRows(data, pointVisibility, boundsScheme)}
        getRowKey={(row) => row.bodyKey}
        downloadFilename={deriveExportFilename(displayName, 'dignities', 'csv')}
      />
      <h4 className="condition-section-header" style={{ marginTop: '1.5rem', marginBottom: '0.5rem' }}>
        {t.conditionCaption}{' '}
        <Tooltip text={t.conditionTooltip} label={t.conditionTooltipLabel}>
          ?
        </Tooltip>
      </h4>
      <p className="hint">{t.conditionHint}</p>
      <SortableTable
        caption={t.conditionCaption}
        columns={conditionColumns(t, locale, pointVisibility.motionScoreVisible === true)}
        rows={conditionRows(data, undefined, boundsScheme, {
          motionScore: pointVisibility.motionScoreVisible === true,
        })}
        getRowKey={(row) => row.bodyKey}
        downloadFilename={deriveExportFilename(displayName, 'condition', 'csv')}
      />
      <h4 className="dispositors-section-header" style={{ marginTop: '1.5rem', marginBottom: '0.5rem' }}>
        <GlossaryTerm id="dispositor">{t.dispositorsCaption}</GlossaryTerm>{' '}
        {/* The shared Tooltip (#456, #508) shows the same visible popup on hover, click and
            keyboard focus — a bare <span title> or an unwired aria-label button only ever
            reached a mouse-hover user, and never anyone who clicked expecting something to
            open. */}
        <Tooltip text={t.dispositorsTooltip} label={t.dispositorsTooltipLabel}>
          ?
        </Tooltip>
      </h4>
      <p className="hint">{t.dispositorsHint}</p>
      <SortableTable
        caption={t.dispositorsCaption}
        captionTerm="dispositor"
        columns={dispositorColumns(t, locale)}
        rows={dispositorRows(data, pointVisibility, rulership)}
        getRowKey={(row) => row.bodyKey}
        downloadFilename={deriveExportFilename(displayName, 'dispositors', 'csv')}
      />
      <h4 className="reception-section-header" style={{ marginTop: '1.5rem', marginBottom: '0.5rem' }}>
        {t.receptionCaption}{' '}
        <Tooltip text={t.receptionTooltip} label={t.receptionTooltipLabel}>
          ?
        </Tooltip>
      </h4>
      <p className="hint">{t.receptionHint}</p>
      <SortableTable
        caption={t.receptionCaption}
        columns={receptionColumns(t, locale)}
        rows={receptionRows(data, boundsScheme)}
        getRowKey={(row) => `${row.bodyAKey}-${row.bodyBKey}`}
        downloadFilename={deriveExportFilename(displayName, 'reception', 'csv')}
      />
    </>
  );
}

/**
 * The Patterns & condition view (#511): the chart shape (with the Moon's phase and sect) next to its
 * own explanation, then dignities and dispositors — `docs/ui/UI-UX_GUIDELINES.md` §2's exact grouping.
 */
export function renderPatternsView(
  data: ChartData,
  displayName: string,
  pointVisibility: PointVisibilityOptions,
  housesRenderable: boolean,
  t: typeof chartViewMessages.en,
  locale: Locale,
  rulership: RulershipChoice,
  boundsScheme: BoundsScheme,
): React.ReactNode {
  return (
    <>
      <h3>{t.shapeTabLabel}</h3>
      {renderShapeSection(data, housesRenderable, t, locale)}
      {renderDignitiesTable(data, displayName, pointVisibility, t, locale, rulership, boundsScheme)}
    </>
  );
}
