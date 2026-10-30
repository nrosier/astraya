/**
 * Renders a chart entirely from a #65 share link's query — no local store, no saved
 * person, no account. Everything the wheel and tables need is recomputed in this browser
 * from what the link carries, the same offline/no-server principle `PersonForm.tsx`'s
 * offset resolution follows for a stored birth moment, extended here to a whole chart.
 */
/**
 * @module SharedChartView
 * @purpose Renders a chart entirely from a #65 share link's URL query — no local store, no saved person, no account.
 * @conventions Nothing here reads the local store; uses SharedChartView.messages.ts for en/nl text via useMessages().
 * @exports SharedChartView
 */
import { useEffect, useMemo, useState } from 'react';
import { chartViewFromHash, type ChartViewKind } from './chart-sections.js';
import { ChartDataView } from './ChartView.js';
import { buildChartArtifact } from './chart-artifact.js';
import type { CalculationArtifact } from '../domain/calculation-artifact.js';
import { toChartCalculationOptions } from '../chart/extended-settings.js';
import { chartSheetMetaLines } from '../domain/chart-tables.js';
import { computeChartData, type ChartData } from '../domain/chart-compute.js';
import { decodeChartShareLink, type ChartShareData } from '../domain/chart-share.js';
import { decodeCalculationSnapshot, type CalculationSnapshot } from '../domain/calculation-snapshot.js';
import { useEphemerisProvider } from './EphemerisProviderContext.js';
import { useLocale } from './locale.js';
import { useMessages } from './messages.js';
import { sharedChartViewMessages } from './SharedChartView.messages.js';
import { StatusMessage } from './primitives/StatusMessage.js';
import { BackLink } from './BackLink.js';
import { replaceRoute } from './nav-history.js';
import { PageHeader } from './PageHeader.js';

type Load =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly data: ChartData; readonly artifact?: CalculationArtifact | undefined }
  | { readonly kind: 'error'; readonly message: string };

/**
 * Reads the shared chart from the URL query, once, at mount. The sender's settings go through the
 * strict decoder here (#717): a link from a newer app, or one naming an unregistered house system,
 * ayanamsa or orb scale, is refused with a reason rather than shown as a different chart.
 */
function fromLocation(): { data?: ChartShareData; snapshot?: CalculationSnapshot; error?: string } {
  const query = window.location.hash.split('?')[1] ?? '';
  try {
    const data = decodeChartShareLink(new URLSearchParams(query));
    return { data, snapshot: decodeCalculationSnapshot(data.settings) };
  } catch (error) {
    // A bad or truncated link must say so, not silently show nothing or a wrong chart.
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/** This screen's own view-href shape (#511): the share-link token's query, with `view` set or removed. */
function sharedViewHref(view: ChartViewKind): string {
  const query = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
  if (view === 'wheel') query.delete('view');
  else query.set('view', view);
  const text = query.toString();
  return text === '' ? '#/shared' : `#/shared?${text}`;
}

export function SharedChartView(): React.JSX.Element {
  const t = useMessages(sharedChartViewMessages);
  const [locale] = useLocale();
  const initial = useMemo(fromLocation, []);
  // The sender's own effective settings (#541), not this viewer's ambient device preference —
  // a shared chart must recompute under what the sender actually had in force, not whatever
  // this browser happens to default to. `decodeCalculationSnapshot` returns a complete, valid
  // snapshot (full app defaults for an old pre-#541 link whose `settings` bag is empty).
  const { snapshot } = initial;
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const { provider } = useEphemerisProvider();
  // More volatile than the share-token data above, so this reads the hash itself on every
  // navigation, not once at mount (#511).
  const [view, setView] = useState<ChartViewKind>(() => chartViewFromHash(window.location.hash) ?? 'wheel');
  useEffect(() => {
    const onHashChange = (): void => {
      setView(chartViewFromHash(window.location.hash) ?? 'wheel');
    };
    window.addEventListener('hashchange', onHashChange);
    return () => {
      window.removeEventListener('hashchange', onHashChange);
    };
  }, []);

  useEffect(() => {
    if (initial.data === undefined || snapshot === undefined || provider === undefined) return undefined;
    const { moment } = initial.data;
    const effect = { cancelled: false };

    void (async () => {
      try {
        // The sender's own formula points too (#582) — without them the recipient's chart would
        // silently show fewer objects than the one that was shared.
        const data = await computeChartData(moment, provider, {
          ...toChartCalculationOptions(snapshot.settings),
          rulership: snapshot.rulership,
          ...(snapshot.customPoints.length === 0 ? {} : { customPoints: snapshot.customPoints }),
        });
        const artifact = await buildChartArtifact(snapshot, moment, data, provider);
        if (!effect.cancelled) setLoad({ kind: 'ready', data, artifact });
      } catch (error) {
        if (!effect.cancelled)
          setLoad({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
      }
    })();

    return () => {
      effect.cancelled = true;
    };
  }, [initial.data, snapshot, provider]);

  return (
    <main className="shell shell--wide">
      <BackLink fallback="#/people" />
      <PageHeader title={t.sharedChart} />
      <p className="hint">{t.hint}</p>

      {initial.error !== undefined && <StatusMessage kind="error">{t.linkCouldNotBeRead(initial.error)}</StatusMessage>}

      {initial.data !== undefined && snapshot !== undefined && (
        <ChartDataView
          load={load}
          displayName={t.sharedChart}
          showHouses={initial.data.housesKnown}
          metaLines={chartSheetMetaLines(t.sharedChart, initial.data.moment, locale)}
          rulership={snapshot.rulership}
          extendedSettings={snapshot.settings}
          view={view}
          onViewChange={(next) => {
            replaceRoute(sharedViewHref(next));
          }}
          buildViewHref={sharedViewHref}
        />
      )}
    </main>
  );
}
