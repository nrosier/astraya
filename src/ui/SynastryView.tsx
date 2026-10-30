/**
 * Synastry bi-wheel comparing a saved person against a second saved person (#172), using
 * #51's cross-chart aspect engine and #52's multi-ring renderer.
 *
 * The second person is picked from within this screen, not carried in the URL: every other
 * multi-word route in `route.ts` names exactly one person, and a synastry pairing changes far
 * more often within one visit (trying several comparisons) than it's worth making shareable
 * as a link. The picker only offers people with a complete, known-time birth moment — the
 * same requirement `person` itself is gated on below — since a bi-wheel needs houses on both
 * rings.
 *
 * The wheel bypasses `AstroChartWheel.tsx` (single-chart only) the same way `TransitView.tsx`
 * does, calling `renderMultiWheelSvg` directly. Unlike a transit wheel, neither side is a
 * "reference at rest" the other moves against, so `computeSynastry` uses each chart's own real
 * speed on both sides (see that module's doc comment) — and correspondingly there is no
 * inner/outer convention rooted in the astrology here, only in the SVG's ring order.
 */
/**
 * @module SynastryView
 * @purpose Synastry bi-wheel screen comparing a saved person against a second saved person: cross-chart aspects, ranked contacts, house overlays via RelationshipSummary, and interpretation text.
 * @conventions Calls renderMultiWheelSvg directly like TransitView.tsx does, bypassing the single-chart AstroChartWheel; uses SynastryView.messages.ts for en/nl text via useMessages(). Carries its own PrintProvenance footer (#564) labelled with engine defaults, since computeSynastry doesn't yet take a user-configurable calculation snapshot.
 * @exports SynastryView, aspectColumns
 */
import { Select } from './primitives/Select.js';
import { formatOrb, formatTimestamp } from './format.js';
import { personHref } from './route.js';
import { houseSystemLabel, rulershipLabel, zodiacLabel } from './ChartView.js';
import { PrintProvenance } from './PrintProvenance.js';
import { DEFAULT_EXTENDED_SETTINGS, settingsForContext, withOrbsOf } from '../chart/extended-settings.js';
import { DEFAULT_RULERSHIP_CHOICE } from '../astrology/rulership.js';
import { usePersonCalculationSettings } from './person-calculation-settings.js';
import { UnreadableSettingsNotice } from './UnreadableSettingsNotice.js';
import { useOrbContextSource, useOrbLibrary } from './orb-library-store.js';
import { DEFAULT_ORB_CONFIG } from '../astrology/aspects.js';
import { buildCalculationSnapshot, snapshotCalculationOptions } from '../domain/calculation-snapshot.js';
import type { CalculationArtifact } from '../domain/calculation-artifact.js';
import { artifactProvenanceIdentity, buildTechniqueChartArtifact } from './chart-artifact.js';
import { useSymbolClass } from './symbol-setting.js';
import { useGlyphVariants } from './glyph-variant-setting.js';
import { useEffect, useMemo, useState } from 'react';
import { useEphemerisProvider } from './EphemerisProviderContext.js';
import { chartWheelRing, crossAspectRows, type AspectRow } from '../domain/chart-tables.js';
import { deriveExportFilename } from '../domain/export-filename.js';
import { computeSynastry, rankedSynastryAspects, type SynastryData } from '../domain/synastry.js';
import { bodyById } from '../astrology/bodies.js';
import { renderMultiWheelSvg, type CrossRingAspects } from '../chart/multi-wheel.js';
import { aspectDisplayName, bodyDisplayName } from './astro-names.messages.js';
import { BiWheelSelectionPanel } from './BiWheelSelectionPanel.js';
import { biWheelSelectionPanelMessages } from './BiWheelSelectionPanel.messages.js';
import { resolveBiWheelSelection } from './bi-wheel-selection.js';
import { useWheelIsolation } from './wheel-interaction.js';
import { useLocale } from './locale.js';
import { useMessages } from './messages.js';
import { ordered } from './people-list.js';
import { PersonNotFound } from './PersonNotFound.js';
import { RelationshipSummary } from './RelationshipSummary.js';
import { SortableTable } from './SortableTable.js';
import { useStoreState } from './store-context.js';
import { synastryViewMessages } from './SynastryView.messages.js';
import type { TableColumn } from './table-sort.js';
import type { CorpusEntry, Locale } from '../interpretation/schema.js';
import { synastryText } from './synastry-text.js';
import { wheelCorpus } from './wheel-corpus.js';
import { StatusMessage } from './primitives/StatusMessage.js';
import { useStableMoment } from './use-stable-moment.js';
import { BackLink } from './BackLink.js';
import { PageHeader } from './PageHeader.js';

type Load =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | {
      readonly kind: 'ready';
      readonly data: SynastryData;
      /** The calculation's artifact (#582), when one could be built. */
      readonly artifact?: CalculationArtifact | undefined;
    }
  | { readonly kind: 'error'; readonly message: string };

const bodyKeyOf = (id: number): string => bodyById(id)?.key ?? String(id);

/** Exported for the PDF export builder (#441), which reuses the same columns a CSV download would. */
export function aspectColumns(
  t: typeof synastryViewMessages.en,
  locale: Locale,
  interpretationOf: (row: AspectRow) => string,
  importanceOf: (row: AspectRow) => number,
): readonly TableColumn<AspectRow>[] {
  return [
    {
      key: 'bodyAName',
      label: t.personALabel,
      valueOf: (row) => row.bodyAName,
      render: (row) => bodyDisplayName(row.bodyAKey, locale),
    },
    {
      key: 'aspect',
      label: t.aspectLabel,
      valueOf: (row) => row.aspect,
      render: (row) => aspectDisplayName(row.aspectKey, locale),
    },
    {
      key: 'bodyBName',
      label: t.personBLabel,
      valueOf: (row) => row.bodyBName,
      render: (row) => bodyDisplayName(row.bodyBKey, locale),
    },
    { key: 'orb', label: t.orbLabel, valueOf: (row) => row.orb, render: (row) => formatOrb(row.orb) },
    {
      key: 'applying',
      label: t.applyingLabel,
      valueOf: (row) => row.applying,
      render: (row) => (row.applying ? t.applying : t.separating),
    },
    {
      key: 'importance',
      label: t.importanceLabel,
      valueOf: importanceOf,
      render: (row) => String(Math.round(importanceOf(row) * 100)),
    },
    {
      key: 'interpretation',
      label: t.interpretationLabel,
      valueOf: interpretationOf,
      wrapText: true,
    },
  ];
}

export function SynastryView({ personId }: { personId: string }): React.JSX.Element {
  const state = useStoreState();
  const person = state.people.get(personId);
  const personMoment = useStableMoment(person?.moment);
  const t = useMessages(synastryViewMessages);
  const [symbolClass] = useSymbolClass();
  // The wheel's markup is cached on these, so a change of symbol form redraws it.
  const [variants] = useGlyphVariants();
  const [locale] = useLocale();

  const candidates = useMemo(
    () =>
      ordered(state.people).filter(
        (candidate) =>
          candidate.id !== personId && candidate.moment !== undefined && candidate.timeAccuracy !== 'unknown',
      ),
    [state.people, personId],
  );
  const [partnerId, setPartnerId] = useState<string>('');
  const partner = partnerId === '' ? undefined : state.people.get(partnerId);
  const partnerMoment = useStableMoment(partner?.moment);

  const { provider } = useEphemerisProvider();
  const [load, setLoad] = useState<Load>({ kind: 'idle' });
  // The orbs are the device's Extended settings (#590), tightened for synastry (#543); everything else stays at
  // the engine defaults, as this screen's footer says.
  const { settings: extendedSettings, unreadable: settingsUnreadable } = usePersonCalculationSettings(personId);
  const orbLibrary = useOrbLibrary();
  const orbSources = useOrbContextSource();
  const snapshot = useMemo(
    () =>
      buildCalculationSnapshot(
        withOrbsOf(DEFAULT_EXTENDED_SETTINGS, settingsForContext(extendedSettings, 'synastry', orbLibrary, orbSources)),
        DEFAULT_RULERSHIP_CHOICE,
      ),
    [extendedSettings, orbLibrary, orbSources],
  );

  useEffect(() => {
    if (personMoment === undefined || partnerMoment === undefined || provider === undefined || settingsUnreadable) {
      setLoad({ kind: 'idle' });
      return undefined;
    }
    const momentA = personMoment;
    const momentB = partnerMoment;
    const effect = { cancelled: false };
    setLoad({ kind: 'loading' });

    void (async () => {
      try {
        const options = snapshotCalculationOptions(snapshot);
        const data = await computeSynastry(momentA, momentB, provider, options);
        const artifact = await buildTechniqueChartArtifact(
          snapshot,
          momentA,
          // The orbs given, not the tightened result: replay tightens them again, exactly once.
          { kind: 'synastry', partner: momentB, orbConfig: options.orbConfig ?? DEFAULT_ORB_CONFIG },
          data.chartA,
          data,
          provider,
        );
        if (!effect.cancelled) setLoad({ kind: 'ready', data, artifact });
      } catch (error) {
        if (!effect.cancelled)
          setLoad({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
      }
    })();

    return () => {
      effect.cancelled = true;
    };
  }, [settingsUnreadable, personMoment, partnerMoment, provider, snapshot]);

  // The reviewed interpretation texts are fetched once a synastry is on screen, and kept per language;
  // until they arrive (or if they cannot) the rows show the mechanical sentence.
  const [corpus, setCorpus] = useState<readonly CorpusEntry[]>([]);
  const synastryReady = load.kind === 'ready';
  useEffect(() => {
    if (!synastryReady) return undefined;
    let cancelled = false;
    wheelCorpus(locale).then(
      (loaded) => {
        if (!cancelled) setCorpus(loaded);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [synastryReady, locale]);

  const wheelMarkup = useMemo(() => {
    if (load.kind !== 'ready') return undefined;
    const nameA: string = person?.displayName ?? '';
    const nameB: string = partner?.displayName ?? '';
    // The legend names which ring is whose by stating outer/inner directly (#448), not just
    // through the ring's own line colour/dash — "outer"/"inner" is unambiguous even before a
    // reader learns to read the dash pattern, since the bi-wheel only ever has these two rings.
    // This is physical radius order (`resolveRingBands`: a higher ring index gets the larger
    // radius, so ring 1 is the one actually drawn further out), NOT the `outerRingIndex`/
    // `innerRingIndex` naming just below, which is a different, unrelated convention (which
    // side of a cross-chart aspect a ring resolves) that happens to assign chartA/ring 0 the
    // "outer" role there despite chartA being the physically inner ring here.
    const ringA = chartWheelRing(load.data.chartA, `${nameA || t.personALabel}${t.innerRingSuffix}`);
    const ringB = chartWheelRing(load.data.chartB, `${nameB || t.personBLabel}${t.outerRingSuffix}`);
    const crossAspects: readonly CrossRingAspects[] = [
      // `computeSynastry`'s aspects run bodyA from chartA (ring 0), bodyB from chartB (ring
      // 1) — outerRingIndex/innerRingIndex name which side of the aspect a ring resolves,
      // not radius order, so chartA is "outer" here even though it's drawn as ring 0.
      { outerRingIndex: 0, innerRingIndex: 1, aspects: load.data.aspects },
    ];
    return renderMultiWheelSvg([ringA, ringB], crossAspects);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the wheel renderers read the glyph settings from module state, so these are cache keys, not inputs the callback reads.
  }, [load, person, partner, t, symbolClass, variants]);

  const wheelT = useMessages(biWheelSelectionPanelMessages);
  const {
    wheelRef,
    selectionKey,
    clear: clearIsolation,
    onClick: handleWheelClick,
    onKeyDown: handleWheelKeyDown,
  } = useWheelIsolation(wheelMarkup);
  const nameA: string = person?.displayName ?? '';
  const nameB: string = partner?.displayName ?? '';
  const ringLabels = [nameA || t.personALabel, nameB || t.personBLabel];
  // The contacts most important first (#422): the same contacts, reordered, each with its score.
  const rankedRows = useMemo(
    () => (load.kind === 'ready' ? crossAspectRows(rankedSynastryAspects(load.data).map((r) => r.aspect)) : []),
    [load],
  );
  const importanceByRow = useMemo(
    () =>
      new Map(
        load.kind === 'ready'
          ? rankedSynastryAspects(load.data).map(({ aspect, importance }) => [
              `${bodyKeyOf(aspect.bodyA)}-${aspect.aspect.key}-${bodyKeyOf(aspect.bodyB)}`,
              importance,
            ])
          : [],
      ),
    [load],
  );
  const importanceOf = (row: AspectRow): number =>
    importanceByRow.get(`${row.bodyAKey}-${row.aspectKey}-${row.bodyBKey}`) ?? 0;

  const interpretationOf = (row: AspectRow): string => {
    const { text, speaksFrom } = synastryText(row, locale, corpus);
    const name = speaksFrom === 'a' ? ringLabels[0] : ringLabels[1];
    return speaksFrom === undefined || name === undefined ? text : `${t.seenFromSide(name)}${text}`;
  };
  const biWheelFacts = useMemo(() => {
    if (load.kind !== 'ready' || selectionKey === undefined) return undefined;
    return resolveBiWheelSelection(selectionKey, {
      rings: [
        { label: nameA || t.personALabel, data: load.data.chartA },
        { label: nameB || t.personBLabel, data: load.data.chartB },
      ],
      cross: crossAspectRows(load.data.aspects),
      // Each aspect's first end is person A (ring 0), its second the partner (ring 1).
      crossRingOfA: 0,
      crossRingOfB: 1,
    });
  }, [load, selectionKey, nameA, nameB, t]);

  if (person === undefined) {
    return <PersonNotFound />;
  }

  if (settingsUnreadable) {
    return <UnreadableSettingsNotice personId={personId} name={person.displayName || ''} />;
  }

  if (person.moment === undefined || person.timeAccuracy === 'unknown') {
    return (
      <main className="shell">
        <BackLink fallback={personHref(personId)} />
        <PageHeader title={t.synastryFallback} />
        <p>
          {t.needsCompleteRecord(person.displayName || t.thisPerson)}{' '}
          <a href={personHref(personId)}>{t.personPageLink}</a>.
        </p>
      </main>
    );
  }

  return (
    <main className="shell">
      {/* Invisible outside @media print (#564) — see app.css's own `.print-provenance` rule.
          This screen doesn't yet thread a user-configurable calculation snapshot through
          `computeSynastry` (see PrintProvenance.tsx's doc comment), so the footer truthfully
          names the engine defaults both charts are actually computed with. */}
      <PrintProvenance
        houseSystem={houseSystemLabel(DEFAULT_EXTENDED_SETTINGS.houseSystem)}
        zodiac={zodiacLabel(DEFAULT_EXTENDED_SETTINGS.zodiac)}
        rulership={rulershipLabel(DEFAULT_RULERSHIP_CHOICE)}
        snapshotIdentity={artifactProvenanceIdentity(load.kind === 'ready' ? load.artifact : undefined, snapshot)}
        generatedAt={formatTimestamp(new Date())}
      />
      <BackLink fallback={personHref(personId)} />
      <PageHeader title={person.displayName ? t.heading(person.displayName) : t.synastryFallback} />
      <p className="hint">{t.hint}</p>
      <p className="hint">{t.overlayContext}</p>

      <p>
        <Select
          label={t.compareWithLabel}
          value={partnerId}
          onChange={setPartnerId}
          options={[
            { value: '', label: t.choosePersonOption },
            ...candidates.map((candidate) => ({
              value: candidate.id,
              label: candidate.displayName || t.unnamedOption,
            })),
          ]}
        />
      </p>

      {partnerId !== '' && candidates.every((candidate) => candidate.id !== partnerId) && (
        <StatusMessage kind="error">{t.partnerGoneWarning}</StatusMessage>
      )}

      {/* The result region: busy while the synastry (re)calculates, as the Astrocartography map is. */}
      <div aria-busy={load.kind === 'loading'}>
        {load.kind === 'loading' && <StatusMessage kind="loading">{t.calculating}</StatusMessage>}

        {load.kind === 'error' && <StatusMessage kind="error">{t.error(load.message)}</StatusMessage>}

        {load.kind === 'ready' && wheelMarkup !== undefined && (
          <>
            {/* App-generated SVG from just-computed chart data, never user-supplied markup —
              the same trust boundary ChartView.tsx's sheet markup is injected under. */}
            <p className="hint chart-wheel-hint">{wheelT.hint}</p>
            <div
              ref={wheelRef}
              className="chart-wheel chart-wheel-interactive"
              dangerouslySetInnerHTML={{ __html: wheelMarkup }}
              onClick={handleWheelClick}
              onKeyDown={handleWheelKeyDown}
            />
            {biWheelFacts !== undefined && (
              <BiWheelSelectionPanel
                facts={biWheelFacts}
                ringLabels={ringLabels}
                locale={locale}
                onClear={clearIsolation}
              />
            )}

            <RelationshipSummary
              data={load.data}
              nameA={nameA || t.personALabel}
              nameB={nameB || t.personBLabel}
              locale={locale}
              personId={personId}
            />

            <p className="hint">{t.rankingHint}</p>

            <SortableTable
              caption={t.aspectsCaption}
              captionTerm="aspect"
              columns={aspectColumns(t, locale, interpretationOf, importanceOf)}
              rows={rankedRows}
              getRowKey={(row) => `${row.bodyAKey}-${row.aspect}-${row.bodyBKey}`}
              downloadFilename={deriveExportFilename(
                `${person.displayName || 'person'}-${(partner?.displayName ?? '') || 'partner'}`,
                'synastry-aspects',
                'csv',
              )}
            />
          </>
        )}
      </div>
    </main>
  );
}
