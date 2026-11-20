import { describe, expect, it } from 'vitest';
import { DEFAULT_EXTENDED_SETTINGS, type ExtendedSettings } from '../src/chart/extended-settings.js';
import { DEFAULT_RULERSHIP_CHOICE } from '../src/astrology/rulership.js';
import {
  buildCalculationSnapshot,
  calculationSnapshotToJson,
  decodeCalculationSnapshot,
  parseCalculationSnapshot,
} from '../src/domain/calculation-snapshot.js';

describe('the Fortune formula in the calculation snapshot codec (#1794)', () => {
  it('a default register omits the field, so it serializes as it did before the field existed', () => {
    const snapshot = buildCalculationSnapshot(DEFAULT_EXTENDED_SETTINGS, DEFAULT_RULERSHIP_CHOICE);
    const json = calculationSnapshotToJson(snapshot);
    expect(JSON.stringify(json.settings)).not.toContain('fortuneFormula');
  });

  it("a 'same-day-and-night' register writes the value and reads it back", () => {
    const settings: ExtendedSettings = { ...DEFAULT_EXTENDED_SETTINGS, fortuneFormula: 'same-day-and-night' };
    const snapshot = buildCalculationSnapshot(settings, DEFAULT_RULERSHIP_CHOICE);
    const json = calculationSnapshotToJson(snapshot);
    expect(json.settings).toMatchObject({ fortuneFormula: 'same-day-and-night' });
    const parsed = parseCalculationSnapshot(json);
    expect(parsed.settings.fortuneFormula).toBe('same-day-and-night');
    expect(parsed).toEqual(snapshot);
  });

  it("an old register without the field reads as 'sect-reversed', and the strict decoder accepts it", () => {
    const old = { version: 3, settings: { orbScalePercent: -10 }, rulership: 'modern' };
    expect(parseCalculationSnapshot(old).settings.fortuneFormula).toBe('sect-reversed');
    expect(() => decodeCalculationSnapshot(old)).not.toThrow();
    expect(decodeCalculationSnapshot(old).settings.fortuneFormula).toBe('sect-reversed');
  });

  it('an unknown value is still refused by the strict decoder', () => {
    const bad = { version: 4, settings: { fortuneFormula: 'bogus' }, rulership: 'modern' };
    expect(() => decodeCalculationSnapshot(bad)).toThrow();
  });
});
