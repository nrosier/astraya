/**
 * The Charts page's two axes, and what a URL names of them.
 *
 * - The **type** of chart: natal, draconic, harmonic, solar return, lunar return. Each is a complete chart
 *   cast for one person, so they share everything below. Carried as `?type=draconic`; no `type` means natal.
 * - The **section** of the chart screen (#430), in reading order: the wheel, the shape, and the tables.
 *   Carried as `?section=shape`; no `section` means the wheel.
 *
 * The header's Charts menu lists the types and the chart screen shows the sections as tabs, so the menu,
 * the type selector and the tabs have to agree: that is this file. Both are in the URL
 * (`#/chart/<id>?type=draconic&section=shape`), which makes every view linkable and keeps the menu's
 * highlight in step with what is open.
 *
 * Pure, like `route.ts`, so the parsing is tested without a DOM. Labels are translated and live with
 * the chart screen's messages (`chartSectionLabels`), looked up by key.
 */
import type { chartViewMessages } from './ChartView.messages.js';

export const CHART_SECTIONS = ['chart', 'shape', 'positions', 'houses', 'aspects', 'dignities', 'derived'] as const;
export type ChartSection = (typeof CHART_SECTIONS)[number];

export const CHART_TYPES = ['natal', 'draconic', 'harmonic', 'solar-return', 'lunar-return'] as const;
export type ChartType = (typeof CHART_TYPES)[number];

export function isChartType(value: unknown): value is ChartType {
  return typeof value === 'string' && (CHART_TYPES as readonly string[]).includes(value);
}

/** The chart type a hash names in its query, or `undefined` when it names none (natal) or an unknown one. */
export function chartTypeFromHash(hash: string): ChartType | undefined {
  const query = hash.split('?')[1];
  if (query === undefined) return undefined;
  const value = new URLSearchParams(query).get('type');
  return isChartType(value) ? value : undefined;
}

export function isChartSection(value: unknown): value is ChartSection {
  return typeof value === 'string' && (CHART_SECTIONS as readonly string[]).includes(value);
}

/** The section a hash names in its query, or `undefined` when it names none or an unknown one. */
export function chartSectionFromHash(hash: string): ChartSection | undefined {
  const query = hash.split('?')[1];
  if (query === undefined) return undefined;
  const value = new URLSearchParams(query).get('section');
  return isChartSection(value) ? value : undefined;
}

/** The hash of a person's chart of `type` (natal when omitted), opened at `section` (the wheel when omitted). */
export function chartHref(personId: string, section?: ChartSection, type?: ChartType): string {
  const query = new URLSearchParams();
  if (type !== undefined && type !== 'natal') query.set('type', type);
  if (section !== undefined && section !== 'chart') query.set('section', section);
  const text = query.toString();
  return text === '' ? `#/chart/${personId}` : `#/chart/${personId}?${text}`;
}

/** The label of each section, from the chart screen's messages. */
export function chartSectionLabels(t: typeof chartViewMessages.en): Record<ChartSection, string> {
  return {
    chart: t.chartTabLabel,
    shape: t.shapeTabLabel,
    positions: t.positionsCaption,
    houses: t.housesCaption,
    aspects: t.aspectsCaption,
    dignities: t.dignitiesCaption,
    derived: t.derivedPointsCaption,
  };
}
