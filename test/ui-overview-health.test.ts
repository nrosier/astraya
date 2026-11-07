// @vitest-environment jsdom
/**
 * The Overview's birth-data health checklist and the last chart a person opened (#1173): what is missing or uncertain
 * in a birth record, which birth-record field each fix names, and the per-person device memory of the chart screen.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { buildPerson } from '../src/domain/person.js';
import { readLastChart, writeLastChart } from '../src/ui/last-chart.js';
import { birthDataHealth, birthRecordFixHref } from '../src/ui/overview-health.js';

const civil = { year: 1879, month: 3, day: 14, hour: 11, minute: 30, second: 0 };
const ulm = { latitude: 48.4, longitude: 9.99 };

function person(fields: Record<string, unknown>) {
  return buildPerson('p-test', new Map(Object.entries(fields)));
}

describe('birthDataHealth (#1173)', () => {
  it('finds nothing wrong in a recorded, named, resolved birth', () => {
    expect(
      birthDataHealth(
        person({ civil, coordinates: ulm, placeLabel: 'Ulm', timeAccuracy: 'recorded', zoneOverride: 'Europe/Berlin' }),
      ).filter((item) => item.what !== 'timezone'),
    ).toEqual([]);
  });

  it('lists a missing date and a missing place as missing, each naming the field that fixes it', () => {
    const items = birthDataHealth(person({ timeAccuracy: 'recorded' }));
    expect(items.map((item) => [item.what, item.kind, item.focus])).toEqual([
      ['date', 'missing', 'date'],
      ['place', 'missing', 'place'],
    ]);
  });

  it('flags an unknown, remembered or approximate time as uncertain, fixed through how the time is known', () => {
    for (const [accuracy, what] of [
      ['unknown', 'timeUnknown'],
      ['remembered', 'timeRemembered'],
      ['approximate', 'timeApproximate'],
    ] as const) {
      const items = birthDataHealth(person({ civil, coordinates: ulm, placeLabel: 'Ulm', timeAccuracy: accuracy }));
      expect(items).toContainEqual({ kind: 'uncertain', what, focus: 'accuracy' });
    }
  });

  it('flags coordinates with no place name', () => {
    expect(birthDataHealth(person({ civil, coordinates: ulm, timeAccuracy: 'recorded' }))).toContainEqual({
      kind: 'uncertain',
      what: 'placeName',
      focus: 'place',
    });
  });

  it('links each fix to the birth record with the field to focus', () => {
    expect(birthRecordFixHref('p-abc', 'accuracy')).toBe('#/people/p-abc/birth-record?focus=accuracy');
  });
});

describe('the last chart a person opened (#1173)', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('remembers a chart screen of that person and returns it', () => {
    writeLastChart('p-abc', '#/people/p-abc/charts/natal/wheel');
    expect(readLastChart('p-abc')).toBe('#/people/p-abc/charts/natal/wheel');
    expect(readLastChart('p-other')).toBeUndefined();
  });

  it('ignores a hash that is not a chart screen of that person, written or read', () => {
    writeLastChart('p-abc', '#/people/p-abc/consultation');
    writeLastChart('p-abc', '#/people/p-other/charts/natal/wheel');
    expect(readLastChart('p-abc')).toBeUndefined();
    localStorage.setItem('astraya:lastChart:p-abc', '#/admin');
    expect(readLastChart('p-abc')).toBeUndefined();
  });
});
