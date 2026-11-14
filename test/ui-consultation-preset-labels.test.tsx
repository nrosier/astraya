/**
 * Pins the en labels of the consultation presets and the "No preset" option (#1545). The expected strings are
 * literals, so a relabelled or removed preset fails here instead of passing against the same messages it is read from.
 */
import { describe, expect, it } from 'vitest';
import { aspectFamilyControlsMessages } from '../src/ui/AspectFamilyControls.messages.js';
import { CONSULTATION_PRESETS } from '../src/ui/aspect-family-filter.js';

const en = aspectFamilyControlsMessages.en;

describe('consultation preset labels (#1545)', () => {
  it('pins the preset keys, in order', () => {
    expect(CONSULTATION_PRESETS.map((preset) => preset.key)).toEqual([
      'standardOverview',
      'natalCore',
      'predictiveTiming',
      'dynamicSynastry',
    ]);
  });

  it('pins the en label of each preset as a literal string, including dynamicSynastry', () => {
    expect(CONSULTATION_PRESETS.map((preset) => en.presets[preset.key])).toEqual([
      'Standard overview: major and nodal and angular, orbs 8 and 6',
      'Natal and core temperament: major and parallels, orbs 7 and 5',
      'Predictive and timing: major and hard minor',
      'Dynamic synastry: major and nodal and angular, orb 6',
    ]);
  });

  it('pins the en label of the No preset option as a literal string', () => {
    expect(en.noPreset).toBe('No preset (default view)');
  });
});
