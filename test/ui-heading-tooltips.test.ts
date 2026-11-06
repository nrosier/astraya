/**
 * The Consultation and Interpretation pages keep their context notes in a tooltip on the heading (#1226, #1230),
 * not as visible body text. Source-level, because both screens need a calculated chart to render.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { consultationViewMessages } from '../src/ui/ConsultationView.messages.js';
import { reportScreenMessages } from '../src/ui/ReportScreen.messages.js';

const read = (file: string): string => readFileSync(join(import.meta.dirname, '..', 'src', 'ui', file), 'utf8');

describe('heading tooltips (#1226, #1230)', () => {
  it('shows the ranking convention as a tooltip on the Major active transits heading, not as a hint', () => {
    const source = read('ConsultationView.tsx');
    expect(source).toContain('id="consultation-transits-heading"');
    expect(source).toMatch(/<Tooltip\s+text=\{t\.rankingConvention\}/);
    expect(source).not.toContain('<p className="hint">{t.rankingConvention}</p>');
  });

  it('shows the interpretation disclaimer as a tooltip on the page heading in every state, not under the tabs', () => {
    expect(read('ReportView.tsx')).not.toContain('t.interpretationDisclaimer');
    const screen = read('ReportScreen.tsx');
    expect(screen.match(/titleAside=\{disclaimer\}/g)).toHaveLength(3);
    expect(screen).toContain('text={viewT.interpretationDisclaimer}');
  });

  it('has both locales for the new tooltip labels', () => {
    for (const locale of ['en', 'nl'] as const) {
      expect(consultationViewMessages[locale].majorTransitsInfoLabel).not.toBe('');
      expect(reportScreenMessages[locale].disclaimerInfoLabel).not.toBe('');
    }
  });
});
