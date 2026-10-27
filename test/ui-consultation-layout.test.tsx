/**
 * #800: the consultation layout contract. The key-metric tiles sit in a consultation-only grid of 2, 4 and 6
 * columns by container width (the shared StatList is untouched); the main grid is 60/40 from 48rem and one column
 * below; the transits to the Ascendant and Midheaven are one group, and so one Disclosure, per angle (D-800a); a
 * contact with no further exact pass shows an em dash named "No further exact pass" (D-800b).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { AngleTransit } from '../src/domain/angle-transits.ts';
import { consultationViewMessages } from '../src/ui/ConsultationView.messages.ts';
import { angleGroups, ANGLE_ORDER, nextExactJd } from '../src/ui/consultation-transit-rows.ts';

const css = readFileSync(new URL('../src/ui/app.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const view = readFileSync(new URL('../src/ui/ConsultationView.tsx', import.meta.url), 'utf8');

/** The declarations of `selector` inside `@container consultation (min-width: <width>)`, or at top level if omitted. */
function columnsAt(selector: string, width?: string): string | undefined {
  const scope =
    width === undefined
      ? css
      : (new RegExp(`@container consultation \\(min-width: ${width}\\)\\s*\\{([\\s\\S]*?\\})\\s*\\}`).exec(css)?.[1] ??
        '');
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const body = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(scope)?.[1];
  return /grid-template-columns:\s*([^;]+);/.exec(body ?? '')?.[1]?.trim();
}

function contact(angle: 'asc' | 'mc', transitingKey: string, exactJds: readonly number[] = []): AngleTransit {
  return { transitingKey, aspectKey: 'conjunction', angle, orb: 0.5, applying: true, exactJds };
}

describe('consultation tile grid (#800)', () => {
  it('is 2 columns by default, 4 from 40rem and 6 from 64rem of container width', () => {
    expect(columnsAt('dl.consultation-tiles')).toBe('repeat(2, minmax(0, 1fr))');
    expect(columnsAt('dl.consultation-tiles', '40rem')).toBe('repeat(4, minmax(0, 1fr))');
    expect(columnsAt('dl.consultation-tiles', '64rem')).toBe('repeat(6, minmax(0, 1fr))');
  });

  it('is drawn by the view on its own dl, not the shared StatList', () => {
    expect(view).toContain('className="consultation-tiles"');
    expect(view).not.toMatch(/\bStatList\b/);
    expect(css).toMatch(/\.primitive-stat-list > div\s*\{\s*flex: 1 1 10rem;/);
  });

  it('uses tokens only: no colour literals in the consultation rules', () => {
    const bodies = [...css.matchAll(/[^{}]*\.consultation[^{]*\{([^}]*)\}/g)].map((m) => m[1] ?? '').join('\n');
    expect(bodies).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
  });
});

describe('consultation main grid (#800)', () => {
  it('is one column below 48rem and 60/40 (3fr/2fr) from 48rem', () => {
    expect(columnsAt('.consultation-grid')).toBe('minmax(0, 1fr)');
    expect(columnsAt('.consultation-grid', '48rem')).toBe('minmax(0, 3fr) minmax(0, 2fr)');
  });

  it('keeps the general shell width, not the wide shell', () => {
    expect(view).toContain('className="shell consultation"');
    expect(view).not.toContain('shell--wide');
  });
});

describe('secondary transits, one Disclosure per angle (D-800a)', () => {
  it('groups the angle transits into one Ascendant and one Midheaven group, in that order', () => {
    const groups = angleGroups([contact('mc', 'pluto'), contact('asc', 'saturn'), contact('asc', 'mars')]);
    expect(groups.map((group) => group.angle)).toEqual(['asc', 'mc']);
    expect(groups[0]?.contacts.map((c) => c.transitingKey)).toEqual(['saturn', 'mars']);
    expect(groups[1]?.contacts.map((c) => c.transitingKey)).toEqual(['pluto']);
  });

  it('still gives an angle with no contact its own group', () => {
    expect(angleGroups([contact('asc', 'mars')]).map((group) => group.contacts.length)).toEqual([1, 0]);
    expect(angleGroups([])).toHaveLength(ANGLE_ORDER.length);
  });

  it('renders each group in its own Disclosure, titled by its angle', () => {
    expect(view).toMatch(/angleGroups\(load\.angles\)\.map\(\(group\) => \(\s*<Disclosure/);
    for (const locale of ['en', 'nl'] as const) {
      const t = consultationViewMessages[locale];
      expect(t.ascTransitsTitle).not.toBe(t.mcTransitsTitle);
    }
    expect(consultationViewMessages.en.ascTransitsTitle).toBe('Transits to the Ascendant');
    expect(consultationViewMessages.en.mcTransitsTitle).toBe('Transits to the Midheaven');
  });
});

describe('next exact date (D-800b)', () => {
  it('is the first exact pass at or after now', () => {
    expect(nextExactJd([10, 30, 20], 15)).toBe(20);
    expect(nextExactJd([15], 15)).toBe(15);
  });

  it('is undefined when every pass is behind or none is known', () => {
    expect(nextExactJd([1, 2], 15)).toBeUndefined();
    expect(nextExactJd([], 15)).toBeUndefined();
    expect(nextExactJd(undefined, 15)).toBeUndefined();
  });
});
