/**
 * #860: the preset-only screens (relocated, draconic, return, report, consultation, timeline) compute with the person's
 * chosen fixed stars, read from the same `person.fixedStars` register the natal chart uses. Rendering each screen needs
 * a full store and router, so this asserts the wiring in source. The Report screen's rendered path is covered by
 * `ui-report-screen.test.tsx`; the snapshot, artifact, shared view and export have their own suites.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..');
const read = (file: string): string => readFileSync(join(ROOT, file), 'utf-8');

const PRESET_ONLY_SCREENS = [
  'src/ui/RelocatedChartView.tsx',
  'src/ui/DraconicView.tsx',
  'src/ui/ReturnView.tsx',
  'src/ui/ReportScreen.tsx',
  'src/ui/ConsultationView.tsx',
  'src/ui/TimingTimelineView.tsx',
];

describe('the preset-only screens use the chosen fixed stars (#860)', () => {
  it.each(PRESET_ONLY_SCREENS)('%s reads the person’s chosen stars', (file) => {
    expect(read(file)).toContain('useStableBy(person?.fixedStars');
  });

  it('Consultation and Timeline recompute when the chosen stars change', () => {
    expect(read('src/ui/ConsultationView.tsx')).toContain('[person?.moment, fixedStars, provider');
    expect(read('src/ui/TimingTimelineView.tsx')).toContain('[asOf, person?.moment, fixedStars, provider');
  });
});
