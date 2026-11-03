/**
 * #1048: the Consultation header actions use the PageHeader button pattern. The header holds one
 * primary action (the wheel), the two route links are quiet buttons rather than underlined text,
 * and *Now* is a quiet compact `Button`. Source-level checks, as the other consultation layout tests.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const view = readFileSync(new URL('../src/ui/ConsultationView.tsx', import.meta.url), 'utf8');

/** The PageHeader element block: from its opening tag to its closing tag. */
function pageHeaderBlock(source: string): string {
  const start = source.indexOf('<PageHeader');
  const end = source.indexOf('</PageHeader>', start);
  if (start < 0 || end < 0) throw new Error('PageHeader block not found in ConsultationView.tsx');
  return source.slice(start, end);
}

describe('Consultation header actions (#1048)', () => {
  const header = pageHeaderBlock(view);

  it('keeps the header actions inside PageHeader children, with BackLink above it', () => {
    expect(view.indexOf('<BackLink')).toBeLessThan(view.indexOf('<PageHeader'));
    expect(header).toContain('<span className="consultation-date-field">');
  });

  it('has at most one primary action in the header, the wheel link', () => {
    const primaries = header.match(/primitive-button-primary/g) ?? [];
    expect(primaries).toHaveLength(1);
    expect(header).toMatch(/<a className="primitive-button-primary" href=\{chartHref\(/);
  });

  it('renders the two route links as quiet buttons, not underlined text links', () => {
    expect(header).toMatch(/<a className="quiet" href=\{hrefFor\('report', \{ personId \}\)\}>/);
    expect(header).toMatch(/<a className="quiet" href=\{hrefFor\('export-builder', \{\}\)\}>/);
    expect(header).not.toContain('<p className="actions">');
  });

  it('renders Now as a compact quiet Button', () => {
    expect(header).toMatch(/<Button\s+size="compact"\s+variant="quiet"/);
  });
});
