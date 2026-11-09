/**
 * @module ui/acg-map-equivalent
 * @purpose The rows of the Astrocartography map's text equivalent (#1371): one per line and marker the map draws, with its body, line type and geography, in the reader's language.
 * @conventions Pure; built only from `acgMapEntries`/`acgMapPlaces` of the same `AcgMapInput` the map is drawn from, so the table and the map cannot disagree. Coordinates use `formatCoordinate`; words come from AstrocartographyView.messages and astro-names.
 * @exports AcgEquivalentRow, acgEquivalentRows
 */
import { acgMapEntries, acgMapPlaces, type AcgMapEntry, type AcgMapInput, type AcgMapPoint } from '../chart/acg-map.js';
import type { Locale } from '../interpretation/schema.js';
import { bodyDisplayName } from './astro-names.messages.js';
import { astrocartographyViewMessages } from './AstrocartographyView.messages.js';
import { formatCoordinate, formatFixed } from './format.js';

/** One row of the map's text equivalent: a drawn line, or a marked place (whose body is empty). */
export interface AcgEquivalentRow {
  readonly key: string;
  readonly body: string;
  readonly shownAs: string;
  readonly where: string;
}

type Messages = typeof astrocartographyViewMessages.en;

function place(point: AcgMapPoint, t: Messages, locale: Locale): string {
  return t.coordinates(
    formatCoordinate(point.latitude, 'lat', locale),
    formatCoordinate(point.longitude, 'lon', locale),
  );
}

function kindName(entry: AcgMapEntry, t: Messages): string {
  switch (entry.kind) {
    case 'MC':
      return t.mc;
    case 'IC':
      return t.ic;
    case 'AC':
      return t.ac;
    case 'DC':
      return t.dc;
    case 'localSpace':
      return t.localSpaceLegend;
  }
}

function whereOf(entry: AcgMapEntry, t: Messages, locale: Locale): string {
  switch (entry.kind) {
    case 'MC':
    case 'IC':
      return t.meridianWhere(formatCoordinate(entry.longitude, 'lon', locale));
    case 'AC':
    case 'DC': {
      const spans = entry.spans
        .map((span) =>
          t.horizonSpan(formatCoordinate(span.from, 'lat', locale), formatCoordinate(span.to, 'lat', locale)),
        )
        .join(t.listSeparator);
      const crossings = entry.crossings.map((point) =>
        t.horizonCrossing(
          formatCoordinate(point.latitude, 'lat', locale),
          formatCoordinate(point.longitude, 'lon', locale),
        ),
      );
      return [t.horizonWhere(spans), ...crossings].join(t.listSeparator);
    }
    case 'localSpace':
      return t.localSpaceWhere(
        place(entry.origin, t, locale),
        formatFixed(entry.azimuth, 2),
        formatFixed(entry.reverseAzimuth, 2),
      );
  }
}

/** The map's text equivalent for `input`: every drawn line in drawing order, then the birthplace and relocation markers. */
export function acgEquivalentRows(input: AcgMapInput, locale: Locale): readonly AcgEquivalentRow[] {
  const t = astrocartographyViewMessages[locale];
  const lines = acgMapEntries(input).map((entry) => ({
    key: `${entry.kind}-${entry.bodyKey}`,
    body: bodyDisplayName(entry.bodyKey, locale),
    shownAs: kindName(entry, t),
    where: whereOf(entry, t, locale),
  }));
  const places = acgMapPlaces(input);
  const markers: AcgEquivalentRow[] = [
    { key: 'marker-natal', body: '', shownAs: t.birthplaceMarker, where: place(places.natal, t, locale) },
  ];
  if (places.relocation !== undefined) {
    markers.push({
      key: 'marker-relocation',
      body: '',
      shownAs: t.relocationMarker,
      where: place(places.relocation, t, locale),
    });
  }
  return [...lines, ...markers];
}
