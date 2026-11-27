/**
 * The fixed-star paran setting in the calculation snapshot and the settings register (#1407). Like #724's station window
 * and #1794's Fortune formula it is optional: absent means off, so a default snapshot keeps its identity and its serialized
 * form, and only a switched-on table is written. Reads back in canonical form, and the strict decoder refuses a bad one.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_RULERSHIP_CHOICE } from '../src/astrology/rulership.js';
import {
  DEFAULT_EXTENDED_SETTINGS,
  DEFAULT_FIXED_STAR_PARANS,
  withoutFixedStarParans,
  type ExtendedSettings,
} from '../src/chart/extended-settings.js';
import {
  buildCalculationSnapshot,
  calculationSnapshotIdentity,
  calculationSnapshotToJson,
  decodeCalculationSnapshot,
  parseCalculationSnapshot,
} from '../src/domain/calculation-snapshot.js';
import { serializeCalculationSettings } from '../src/domain/person.js';

const ON: ExtendedSettings = {
  ...DEFAULT_EXTENDED_SETTINGS,
  fixedStarParans: { orb: 2.5, events: ['rising', 'setting'] },
};

describe('the fixed-star paran setting in the snapshot (#1407)', () => {
  it('leaves the default snapshot identity and register as they were: off is the field absent', () => {
    const snapshot = buildCalculationSnapshot(DEFAULT_EXTENDED_SETTINGS, DEFAULT_RULERSHIP_CHOICE);
    // v4-85b6b5ff before #2045 changed the default midpoint orb (reported on #2045).
    expect(calculationSnapshotIdentity(snapshot)).toBe('v4-678ff471');
    expect(JSON.stringify(calculationSnapshotToJson(snapshot))).not.toContain('fixedStarParans');
    expect(JSON.stringify(serializeCalculationSettings(DEFAULT_EXTENDED_SETTINGS))).not.toContain('fixedStarParans');
  });

  it('is written when on and reads back unchanged, with the same identity in memory and after JSON', () => {
    const snapshot = buildCalculationSnapshot(ON, DEFAULT_RULERSHIP_CHOICE);
    const json = calculationSnapshotToJson(snapshot);
    expect(json.settings).toMatchObject({ fixedStarParans: { orb: 2.5, events: ['rising', 'setting'] } });
    const parsed = parseCalculationSnapshot(json);
    expect(parsed.settings.fixedStarParans).toEqual({ orb: 2.5, events: ['rising', 'setting'] });
    expect(parsed).toEqual(snapshot);
    expect(calculationSnapshotIdentity(parsed)).toBe(calculationSnapshotIdentity(snapshot));
    // A different identity from the default: it is part of what the snapshot says the chart was calculated with.
    expect(calculationSnapshotIdentity(snapshot)).not.toBe('v4-85b6b5ff');
  });

  it('reads the events back in canonical order, without duplicates or anything that is not an event', () => {
    const messy = {
      version: 4,
      settings: { fixedStarParans: { orb: 1, events: ['setting', 'rising', 'rising', 'bogus', 7] } },
      rulership: 'modern',
    };
    expect(parseCalculationSnapshot(messy).settings.fixedStarParans).toEqual({ orb: 1, events: ['rising', 'setting'] });
  });

  it('reads an unusable setting as off: no orb, an orb out of 0-10, or no event list', () => {
    for (const bad of [
      { events: ['rising'] },
      { orb: 11, events: [] },
      { orb: -1, events: [] },
      { orb: 'x', events: [] },
      { orb: 1 },
    ]) {
      const snapshot = parseCalculationSnapshot({
        version: 4,
        settings: { fixedStarParans: bad },
        rulership: 'modern',
      });
      expect(snapshot.settings.fixedStarParans, JSON.stringify(bad)).toBeUndefined();
    }
  });

  it('accepts an orb of 0 and of 10, the ends of the range Solar Fire allows', () => {
    for (const orb of [0, 10]) {
      const settings = parseCalculationSnapshot({
        version: 4,
        settings: { fixedStarParans: { orb, events: ['culminating'] } },
        rulership: 'modern',
      }).settings;
      expect(settings.fixedStarParans).toEqual({ orb, events: ['culminating'] });
    }
  });

  it('is refused by the strict decoder when invalid, and accepted when valid or absent', () => {
    for (const bad of [{ orb: 11, events: [] }, { orb: 1, events: ['bogus'] }, { orb: 1 }, 'on']) {
      expect(() =>
        decodeCalculationSnapshot({ version: 4, settings: { fixedStarParans: bad }, rulership: 'modern' }),
      ).toThrow();
    }
    const valid = decodeCalculationSnapshot({
      version: 4,
      settings: { fixedStarParans: { orb: 1, events: ['rising'] } },
      rulership: 'modern',
    });
    expect(valid.settings.fixedStarParans).toEqual({ orb: 1, events: ['rising'] });
    expect(() => decodeCalculationSnapshot({ version: 4, settings: {}, rulership: 'modern' })).not.toThrow();
  });

  it('switches off by removing the field, and a switched-on table starts at 1 degree with every event', () => {
    expect(withoutFixedStarParans(ON)).not.toHaveProperty('fixedStarParans');
    expect(withoutFixedStarParans(DEFAULT_EXTENDED_SETTINGS)).toEqual(DEFAULT_EXTENDED_SETTINGS);
    expect(DEFAULT_FIXED_STAR_PARANS).toEqual({
      orb: 1,
      events: ['rising', 'culminating', 'setting', 'anticulminating'],
    });
  });
});
