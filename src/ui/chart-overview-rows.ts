/**
 * @module ui/chart-overview-rows
 * @purpose Words a `ChartOverview` (#691) as term/value rows in the reader's language, so the Report, the PDF and the consultation page show the same lines.
 * @conventions Pure; sign, body, element, modality and sect names come from the shared catalogues (astro-names, ChartView.messages). A row is left out when its fact is unknown (no birth time), never shown empty.
 * @exports OverviewRow, chartOverviewRows
 */
import { SIGNS } from '../astrology/signs.js';
import type { ChartOverview, OverviewPlacement } from '../domain/chart-overview.js';
import type { Locale } from '../interpretation/schema.js';
import { bodyDisplayName, signDisplayName } from './astro-names.messages.js';
import { chartOverviewMessages } from './chart-overview.messages.js';
import { chartViewMessages } from './ChartView.messages.js';
import { formatSignDegree } from './format.js';

export interface OverviewRow {
  readonly term: string;
  readonly value: string;
}

export function chartOverviewRows(overview: ChartOverview, locale: Locale): readonly OverviewRow[] {
  const t = chartOverviewMessages[locale];
  const chartT = chartViewMessages[locale];
  const body = (key: string): string => bodyDisplayName(key, locale);
  const placement = (value: OverviewPlacement): string =>
    t.placement(signDisplayName(SIGNS[value.sign]?.name ?? '', locale), formatSignDegree(value.longitude));
  const rows: OverviewRow[] = [];
  const add = (term: string, value: string | undefined): void => {
    if (value !== undefined) rows.push({ term, value });
  };

  add(t.sun, overview.sun === undefined ? undefined : placement(overview.sun));
  add(t.moon, overview.moon === undefined ? undefined : placement(overview.moon));
  add(t.ascendant, overview.ascendant === undefined ? undefined : placement(overview.ascendant));
  add(
    t.chartRuler,
    overview.chartRulers.length === 0 ? undefined : overview.chartRulers.map(body).join(t.rulerSeparator),
  );
  add(t.sect, overview.sect === undefined ? undefined : overview.sect === 'day' ? chartT.dayChart : chartT.nightChart);
  add(
    t.elements,
    t.balance(
      (['fire', 'earth', 'air', 'water'] as const)
        .map((element) => `${chartT.elementNames[element]} ${String(overview.elements[element])}`)
        .join(t.listSeparator),
      chartT.elementNames[overview.dominantElement].toLowerCase(),
    ),
  );
  add(
    t.modalities,
    t.balance(
      (['cardinal', 'fixed', 'mutable'] as const)
        .map((modality) => `${chartT.modalityNames[modality]} ${String(overview.modalities[modality])}`)
        .join(t.listSeparator),
      chartT.modalityNames[overview.dominantModality].toLowerCase(),
    ),
  );
  add(t.temperament, t.temperaments[overview.temperament]);
  add(t.dominantPlanet, overview.dominantPlanet === undefined ? undefined : body(overview.dominantPlanet));
  add(
    t.finalDispositor,
    overview.dispositors === undefined
      ? undefined
      : overview.dispositors.finalDispositor === undefined
        ? t.noFinalDispositor
        : body(overview.dispositors.finalDispositor),
  );
  return rows;
}
