/**
 * @module interpretation/report-groups
 * @purpose Groups a report section's paragraphs by the body they describe (#654), so a planet's sign, house and degree-symbol paragraphs sit together under one heading instead of reading as unrelated entries.
 * @conventions Pure, no locale, no ephemeris. A group is the run of consecutive paragraphs about one body, so the report's order is never changed; a paragraph with no body of its own (a derived one, an aspect, a cusp) is a group with no body and stands alone. A degree-symbol paragraph has no body of its own (it belongs to a degree, not a planet), so it joins the group of the paragraph before it, which is the placement it supplements (`coreIdentitySection` writes it straight after it). Only a group of two or more paragraphs about a body is given a heading; a lone one needs none.
 * @exports groupParagraphsByBody, ParagraphGroup
 */
import type { ReportParagraph } from './report.js';
import type { CorpusPlacement } from './schema.js';

export interface ParagraphGroup {
  /** The body these paragraphs are about, or `undefined` for a paragraph that stands alone. */
  readonly bodyKey: string | undefined;
  readonly paragraphs: readonly ReportParagraph[];
}

/** The body a placement is about, for the categories that are about one body's own position. */
function bodyOf(placement: CorpusPlacement | undefined): string | undefined {
  if (placement === undefined) return undefined;
  if (
    placement.category === 'planet-in-sign' ||
    placement.category === 'planet-in-house' ||
    placement.category === 'composite-planet-in-sign' ||
    placement.category === 'composite-planet-in-house'
  ) {
    return placement.body;
  }
  return undefined;
}

export function groupParagraphsByBody(paragraphs: readonly ReportParagraph[]): readonly ParagraphGroup[] {
  const runs: { bodyKey: string | undefined; paragraphs: ReportParagraph[] }[] = [];
  for (const paragraph of paragraphs) {
    const body = bodyOf(paragraph.placement);
    const last = runs[runs.length - 1];
    const joinsLast =
      last?.bodyKey !== undefined && (body === last.bodyKey || paragraph.placement?.category === 'degree-symbol');
    if (joinsLast) last.paragraphs.push(paragraph);
    else runs.push({ bodyKey: body, paragraphs: [paragraph] });
  }
  // A body with a single paragraph is not a group worth a heading: it stands alone, labelled by its own sub-label.
  return runs.map((run) =>
    run.bodyKey !== undefined && run.paragraphs.length < 2 ? { bodyKey: undefined, paragraphs: run.paragraphs } : run,
  );
}
