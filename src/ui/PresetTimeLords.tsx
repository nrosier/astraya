/**
 * @module ui/PresetTimeLords
 * @purpose The two lines a consultation preset adds to the chart's Selection card (#1190): the active firdaria lord and the profected year, each linking to Consultation.
 * @conventions The values come from `consultationYear`, the function Consultation reads, so the two screens cannot disagree; calculated only while a preset that asks for it is chosen, and left out (nothing drawn) while loading, without a birth time that gives a profection, or if the calculation fails: the chart screen has no use for an error here, Consultation reports it. Text from `ChartView.messages.ts`.
 * @exports PresetTimeLords
 */
import { useEffect, useState } from 'react';
import { DEFAULT_RULERSHIP_CHOICE, type RulershipChoice } from '../astrology/rulership.js';
import { consultationYear, type ConsultationYear } from '../domain/consultation-year.js';
import { type ChartData } from '../domain/chart-compute.js';
import { julianDayFor } from '../time/julian.js';
import { resolveMoment } from '../time/resolve.js';
import type { BirthMomentInput } from '../time/types.js';
import { bodyDisplayName, signDisplayName } from './astro-names.messages.js';
import { chartViewMessages } from './ChartView.messages.js';
import { useEphemerisProvider } from './EphemerisProviderContext.js';
import { hrefFor } from './feature-registry.js';
import { useLocale } from './locale.js';
import { useMessages } from './messages.js';
import { ordinal } from './placement-label.js';
import { timelineSubjectLabel } from './timing-timeline-labels.js';
import { SIGNS } from '../astrology/signs.js';

export function PresetTimeLords({
  moment,
  natal,
  rulership,
  personId,
}: {
  readonly moment: BirthMomentInput;
  readonly natal: ChartData;
  readonly rulership: RulershipChoice | undefined;
  readonly personId: string | undefined;
}): React.JSX.Element | null {
  const t = useMessages(chartViewMessages);
  const [locale] = useLocale();
  const { provider } = useEphemerisProvider();
  const [year, setYear] = useState<ConsultationYear | undefined>(undefined);

  useEffect(() => {
    setYear(undefined);
    if (provider === undefined) return undefined;
    const effect = { cancelled: false };
    void (async () => {
      try {
        const now = new Date();
        const nowJd = await provider.julianDayFromUtc(
          now.getUTCFullYear(),
          now.getUTCMonth() + 1,
          now.getUTCDate(),
          now.getUTCHours(),
          now.getUTCMinutes(),
          now.getUTCSeconds(),
        );
        const natalJd = await julianDayFor(provider, resolveMoment(moment));
        const computed = await consultationYear(moment, natal, natalJd, nowJd, provider, rulership ?? DEFAULT_RULERSHIP_CHOICE);
        if (!effect.cancelled) setYear(computed);
      } catch {
        // Nothing is better than a wrong line; Consultation reports the calculation's own failure.
      }
    })();
    return () => {
      effect.cancelled = true;
    };
  }, [moment, natal, provider, rulership]);

  if (year === undefined || (year.profection === undefined && year.firdaria === undefined)) return null;
  const href = personId === undefined ? undefined : hrefFor('consultation', { personId });
  const lines = [
    year.firdaria === undefined
      ? undefined
      : t.presetTimeLord(timelineSubjectLabel({ kind: 'firdaria', ruler: year.firdaria.ruler }, locale)),
    year.profection === undefined
      ? undefined
      : t.presetProfection(
          signDisplayName(SIGNS[year.profection.sign]?.name ?? '', locale),
          ordinal(year.profection.house, locale),
          year.profection.lords.map((lord) => bodyDisplayName(lord, locale)).join(t.presetLordSeparator),
        ),
  ].filter((line): line is string => line !== undefined);
  return (
    <div className="selection-inspector-preset">
      <ul className="selection-inspector-preset-lines">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {href !== undefined && (
        <a className="standalone-link" href={href}>
          {t.presetSeeConsultation}
        </a>
      )}
    </div>
  );
}
