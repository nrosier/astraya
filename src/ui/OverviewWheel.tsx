/**
 * @module ui/OverviewWheel
 * @purpose The natal wheel card and the Sun, Moon and Rising card for the person Overview (#1173): a small static wheel linking to the chart, drawn by the chart screen's own dial renderer, and the three placements read from the same computed chart.
 * @conventions Computes the chart with the same options as ChartView (`toChartCalculationOptions` over the person's saved settings and natal orb profile) and draws `renderChartDialSvg`; no astronomy lives here. Renders nothing while loading, without an engine or a birth time that gives houses, or if the calculation fails: the Overview has no use for an error here, the chart screen reports it. The picture is decorative (`aria-hidden`); the link carries the name.
 * @exports OverviewWheel
 */
import { useEffect, useMemo, useState } from 'react';
import { renderChartDialSvg } from '../chart/chart-sheet.js';
import {
  settingsForContext,
  toChartCalculationOptions,
  toPointVisibilityOptions,
  toSignWedgeStyle,
  type ExtendedSettings,
} from '../chart/extended-settings.js';
import { resolveWheelDisplayOptions } from '../chart/wheel-options.js';
import { chartSheetInput } from '../domain/chart-tables.js';
import { computeChartData, housesAreDefined, type ChartData } from '../domain/chart-compute.js';
import type { RulershipChoice } from '../astrology/rulership.js';
import type { BirthMomentInput } from '../time/types.js';
import { bodyByKey } from '../astrology/bodies.js';
import { houseOf } from '../astrology/emphasis.js';
import { degreeParts } from '../domain/degree-parts.js';
import { bodyDisplayName, bodyShortName, signDisplayName } from './astro-names.messages.js';
import { formatSignDegree } from './format.js';
import { useMessages } from './messages.js';
import { overviewMessages } from './Overview.messages.js';
import { ordinal } from './placement-label.js';
import { useEphemerisProvider } from './EphemerisProviderContext.js';
import { useLocale } from './locale.js';
import { useOrbContextSource, useOrbLibrary } from './orb-library-store.js';

export function OverviewWheel({
  moment,
  settings: cardSettings,
  rulership,
  name,
  href,
  heading,
  label,
}: {
  readonly moment: BirthMomentInput;
  readonly settings: ExtendedSettings;
  readonly rulership: RulershipChoice;
  readonly name: string;
  readonly href: string;
  readonly heading: string;
  readonly label: string;
}): React.JSX.Element | null {
  const { provider } = useEphemerisProvider();
  const [locale] = useLocale();
  const orbLibrary = useOrbLibrary();
  const orbSources = useOrbContextSource();
  const settings = useMemo(
    () => settingsForContext(cardSettings, 'natal', orbLibrary, orbSources),
    [cardSettings, orbLibrary, orbSources],
  );
  const [data, setData] = useState<ChartData | undefined>(undefined);

  useEffect(() => {
    setData(undefined);
    if (provider === undefined) return undefined;
    const effect = { cancelled: false };
    void (async () => {
      try {
        const computed = await computeChartData(moment, provider, {
          ...toChartCalculationOptions(settings),
          rulership,
        });
        if (!effect.cancelled) setData(computed);
      } catch {
        // The chart screen reports a failed calculation; here the picture is simply left out.
      }
    })();
    return () => {
      effect.cancelled = true;
    };
  }, [moment, provider, settings, rulership]);

  const markup = useMemo(() => {
    if (data === undefined || !housesAreDefined(data.houses)) return undefined;
    const input = chartSheetInput(data, [name], name, toPointVisibilityOptions(settings), (bodyKey) =>
      bodyShortName(bodyKey, locale),
    );
    return renderChartDialSvg(input, {
      ...resolveWheelDisplayOptions({}),
      signWedgeStyle: toSignWedgeStyle(settings),
    }).markup;
  }, [data, name, settings, locale]);

  const t = useMessages(overviewMessages);
  const placements = useMemo(() => {
    if (data === undefined) return [];
    const housesKnown = housesAreDefined(data.houses);
    const line = (longitude: number, withHouse: boolean): string =>
      t.placementLine(
        signDisplayName(degreeParts(longitude).sign, locale),
        formatSignDegree(longitude),
        withHouse && housesKnown ? ordinal(houseOf(longitude, data.houses.cusps), locale) : undefined,
      );
    const lights = ['sun', 'moon'].flatMap((key) => {
      const body = bodyByKey(key);
      const position = body === undefined ? undefined : data.positions.find((p) => p.body === body.id);
      return position === undefined
        ? []
        : [{ key, label: bodyDisplayName(key, locale), text: line(position.longitude, true) }];
    });
    return housesKnown
      ? [...lights, { key: 'rising', label: t.risingLabel, text: line(data.houses.ascendant, false) }]
      : lights;
  }, [data, locale, t]);

  if (markup === undefined) return null;
  return (
    <>
      <section className="overview-card overview-card--wheel" aria-labelledby="overview-wheel-heading">
        <h2 id="overview-wheel-heading">{heading}</h2>
        <a className="overview-wheel" href={href} aria-label={label}>
          {/* Generated by this app from data it just computed, never user-supplied markup (as on the chart screen). */}
          <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: markup }} />
        </a>
      </section>
      {placements.length > 0 && (
        <section className="overview-card overview-card--placements" aria-labelledby="overview-placements-heading">
          <h2 id="overview-placements-heading">{t.placementsHeading}</h2>
          <dl className="overview-placements">
            {placements.map((row) => (
              <div key={row.key}>
                <dt>{row.label}</dt>
                <dd>{row.text}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </>
  );
}
