/**
 * @module ui/overview-health
 * @purpose The birth-data health checklist of the person Overview (#1173): what is missing or uncertain in a birth record, and which birth-record field fixes each item.
 * @conventions Pure: reads the person and the time resolution only, so the Overview and its tests cannot disagree about what is wrong. An item is `missing` (the chart cannot be drawn without it) or `uncertain` (the chart is drawn, but the record says it is shaky); a record with nothing wrong has no items. `focus` names the field the birth record puts the cursor in when the fix link is followed (`data-health-field`).
 * @exports HealthItem, HealthFocus, birthDataHealth, birthRecordFixHref
 */
import type { Person } from '../domain/person.js';
import { resolveMoment } from '../time/resolve.js';
import { hrefFor } from './feature-registry.js';

/** The birth-record field a fix link focuses. */
export type HealthFocus = 'date' | 'accuracy' | 'place' | 'source';

export interface HealthItem {
  readonly kind: 'missing' | 'uncertain';
  readonly what:
    'date' | 'place' | 'placeName' | 'timeUnknown' | 'timeApproximate' | 'timeRemembered' | 'timezone' | 'source';
  readonly focus: HealthFocus;
}

/** What is missing or uncertain in a person's birth data, most serious first. */
export function birthDataHealth(person: Person): readonly HealthItem[] {
  const items: HealthItem[] = [];
  if (person.missing.includes('civil')) items.push({ kind: 'missing', what: 'date', focus: 'date' });
  if (person.missing.includes('coordinates')) items.push({ kind: 'missing', what: 'place', focus: 'place' });
  if (person.timeAccuracy === 'unknown') items.push({ kind: 'uncertain', what: 'timeUnknown', focus: 'accuracy' });
  if (person.timeAccuracy === 'approximate') {
    items.push({ kind: 'uncertain', what: 'timeApproximate', focus: 'accuracy' });
  }
  if (person.timeAccuracy === 'remembered')
    items.push({ kind: 'uncertain', what: 'timeRemembered', focus: 'accuracy' });
  if (person.moment !== undefined) {
    if (person.placeLabel === '') items.push({ kind: 'uncertain', what: 'placeName', focus: 'place' });
    // The offset the resolution settled on has something to say (a boundary, an ambiguous hour, pre-standard time).
    if (resolveMoment(person.moment).warnings.length > 0) {
      items.push({ kind: 'uncertain', what: 'timezone', focus: 'place' });
    }
  }
  // Last: the chart does not depend on it, but a record that does not say where its data came from is a shaky one (#1262).
  if (person.sourceKind === undefined) items.push({ kind: 'uncertain', what: 'source', focus: 'source' });
  return items;
}

/** The birth record, with the field to put the cursor in (the form reads `?focus=` when it opens). */
export function birthRecordFixHref(personId: string, focus: HealthFocus): string {
  return `${hrefFor('birth-record', { personId })}?focus=${focus}`;
}
