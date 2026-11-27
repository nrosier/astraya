/**
 * @module PlanetaryHourLine
 * @purpose One hint line naming the planetary day and hour at a moment and place (#2019), shown on the Horary screen and, for the centre date, on the Timing timeline.
 * @conventions The calculation is `domain/planetary-hour` (Lilly 1659, p. 356; sunrise and sunset at the visible horizon). Renders nothing until the result is in, and the no-sunrise sentence where the Sun does not both rise and set. `at` states the moment when the line is not for the chart's own moment. Text comes from PlanetaryHourLine.messages.ts.
 * @exports PlanetaryHourLine
 */
import { useEffect, useState } from 'react';
import { planetaryHourAtPlace, type PlanetaryHourAtPlace } from '../domain/planetary-hour.js';
import type { EphemerisProvider, GeoPosition, JulianDayUT } from '../ephemeris/types.js';
import type { Locale } from '../interpretation/schema.js';
import { bodyDisplayName } from './astro-names.messages.js';
import { useMessages } from './messages.js';
import { planetaryHourLineMessages } from './PlanetaryHourLine.messages.js';

export function PlanetaryHourLine({
  provider,
  jd,
  latitude,
  longitude,
  locale,
  at,
}: {
  readonly provider: EphemerisProvider;
  readonly jd: JulianDayUT;
  readonly latitude: number;
  readonly longitude: number;
  readonly locale: Locale;
  /** The moment in words, when the line is read at a stated time rather than the chart's own moment. */
  readonly at?: string | undefined;
}): React.JSX.Element | null {
  const t = useMessages(planetaryHourLineMessages);
  const [result, setResult] = useState<PlanetaryHourAtPlace | undefined>(undefined);

  useEffect(() => {
    const effect = { cancelled: false };
    const place: GeoPosition = { latitude, longitude, altitude: 0 };
    setResult(undefined);
    planetaryHourAtPlace(provider, jd, place)
      .then((next) => {
        if (!effect.cancelled) setResult(next);
      })
      .catch(() => {
        // A failed search leaves the line out rather than showing a wrong hour.
        if (!effect.cancelled) setResult(undefined);
      });
    return () => {
      effect.cancelled = true;
    };
  }, [provider, jd, latitude, longitude]);

  if (result === undefined) return null;
  if (result.kind === 'no-sunrise') return <p className="hint planetary-hour-line">{t.noSunrise}</p>;
  const { hour } = result;
  const day = bodyDisplayName(hour.dayRuler, locale);
  const ruler = bodyDisplayName(hour.ruler, locale);
  const part = hour.isDay ? t.parts.day : t.parts.night;
  return (
    <p className="hint planetary-hour-line">
      {at === undefined ? t.line(day, ruler, part, hour.hourOfPart) : t.lineAt(at, day, ruler, part, hour.hourOfPart)}
    </p>
  );
}
