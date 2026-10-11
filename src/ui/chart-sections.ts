/**
 * The Charts page's two axes, and what a URL names of them.
 *
 * - The **type** of chart: natal, draconic, harmonic, solar return, lunar return. Each is a complete chart
 *   cast for one person, so they share everything below. Carried as `?type=draconic`; no `type` means natal.
 * - The **view** of the chart screen (#511): Wheel, Aspects, Aspect matrix, Placements, or Patterns & condition, per
 *   `docs/UI-UX_GUIDELINES.md` §2's target chart page. Carried as `?view=aspects`; no `view` means the wheel.
 *
 * These are route-level views with stable URLs and ordinary links — not ARIA tabs (the guideline's own
 * wording) — so the header's Charts menu, the type selector, and `ChartViewNav` all have to agree on the
 * same vocabulary: that is this file. Both axes are in the URL (`#/chart/<id>?type=draconic&view=aspects`),
 * which makes every view linkable and keeps the menu's highlight in step with what is open.
 *
 * Supersedes the old 7-value `section` model (`chart`/`shape`/`positions`/`houses`/`aspects`/`dignities`/
 * `derived`) with no compatibility alias: an old bookmarked `?section=` link simply falls back to the
 * `wheel` default, consistent with this app's stated position that its hash routes carry no production
 * compatibility requirement.
 *
 * Pure, like `route.ts`, so the parsing is tested without a DOM. Labels are translated and live with
 * the chart screen's messages (`chartViewLabels`), looked up by key.
 */
/**
 * @module ui/chart-sections
 * @purpose Defines and parses the Chart screen's two URL-encoded axes — chart type (natal/draconic/harmonic/solar-return/lunar-return) and view (wheel/aspects/matrix/placements/patterns) — so the header menu, type selector, and ChartViewNav stay in agreement.
 * @conventions Pure functions only (no DOM), parsed/tested like route.ts; labels are translated via ChartView's own messages object rather than owning its own *.messages.ts file. Views are route-level links per docs/UI-UX_GUIDELINES.md §2, not ARIA tabs.
 * @exports CHART_VIEWS, ChartViewKind, CHART_TYPES, ChartType, isChartType, chartTypeFromHash, isChartView, chartViewFromHash, chartHref, chartViewLabels
 */
import type { chartViewMessages } from './ChartView.messages.js';

export const CHART_VIEWS = ['wheel', 'aspects', 'matrix', 'placements', 'patterns'] as const;
export type ChartViewKind = (typeof CHART_VIEWS)[number];

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

export function isChartView(value: unknown): value is ChartViewKind {
  return typeof value === 'string' && (CHART_VIEWS as readonly string[]).includes(value);
}

/** The view a hash names in its query, or `undefined` when it names none or an unknown one. */
export function chartViewFromHash(hash: string): ChartViewKind | undefined {
  const query = hash.split('?')[1];
  if (query === undefined) return undefined;
  const value = new URLSearchParams(query).get('view');
  return isChartView(value) ? value : undefined;
}

/** The hash of a person's chart of `type` (natal when omitted), opened at `view` (the wheel when omitted). */
export function chartHref(personId: string, view?: ChartViewKind, type?: ChartType): string {
  const query = new URLSearchParams();
  if (type !== undefined && type !== 'natal') query.set('type', type);
  if (view !== undefined && view !== 'wheel') query.set('view', view);
  const text = query.toString();
  return text === '' ? `#/chart/${personId}` : `#/chart/${personId}?${text}`;
}

/** The label of each view, from the chart screen's messages. */
export function chartViewLabels(t: typeof chartViewMessages.en): Record<ChartViewKind, string> {
  return {
    wheel: t.wheelViewLabel,
    aspects: t.aspectsViewLabel,
    matrix: t.matrixViewLabel,
    placements: t.placementsViewLabel,
    patterns: t.patternsViewLabel,
  };
}
