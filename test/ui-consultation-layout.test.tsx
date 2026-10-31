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

/** The second `.consultation-col` and everything after it: the right-hand column of the 60/40 grid. */
function rightColumn(): string {
  const first = view.indexOf('className="consultation-col"');
  const second = view.indexOf('className="consultation-col"', first + 1);
  return view.slice(second, view.indexOf('</main>', second));
}

/** The body of the `<section>` whose heading carries `headingId`. */
function sectionBody(source: string, headingId: string): string {
  return (
    new RegExp(`<section className="consultation-section" aria-labelledby="${headingId}">([\\s\\S]*?)</section>`).exec(
      source,
    )?.[1] ?? ''
  );
}

describe('consultation right column (#800)', () => {
  it('holds the time-lords card and the releasing and directions card, not the transits', () => {
    const right = rightColumn();
    expect(right).toContain('aria-labelledby="consultation-year-heading"');
    expect(right).toContain('aria-labelledby="consultation-releasing-heading"');
    expect(right).not.toContain('aria-labelledby="consultation-transits-heading"');
  });

  it('puts the time-lords card before the releasing and directions card', () => {
    const right = rightColumn();
    expect(right.indexOf('consultation-year-heading')).toBeLessThan(right.indexOf('consultation-releasing-heading'));
  });

  it('fills the time-lords card with profection, firdaria and the progressed Moon', () => {
    const body = sectionBody(view, 'consultation-year-heading');
    expect(body).toContain('className="consultation-lords"');
    expect(body).toContain('{t.profectionYear}');
    expect(body).toContain('{t.firdaria}');
    expect(body).toContain('{t.progressedMoon}');
    expect(body).toContain('load.year.profection !== undefined');
    expect(body).toContain('load.year.firdaria !== undefined');
  });

  it('fills the releasing and directions card with releasing badges and the directions list', () => {
    const body = sectionBody(view, 'consultation-releasing-heading');
    expect(body).toContain('{t.releasingDirectionsHeading}');
    expect(body).toContain('releasingBadges.map(');
    expect(body).toContain('<h3>{t.directionsHeading}</h3>');
    expect(body).toContain('directionList(directions.slice(0, SHOWN_DIRECTION_COUNT))');
  });

  it('shows a .consultation-date pill on each direction row, from the datePills helper', () => {
    const directionRows = /const directionList = [\s\S]*?\n {2}\);/.exec(view)?.[0] ?? '';
    expect(directionRows).toContain('<li key=');
    expect(directionRows).toContain('{datePills(event)}');

    const pills = /const datePills = [\s\S]*?\n {2}const directionList/.exec(view)?.[0] ?? '';
    expect(pills).toContain('className="consultation-pills"');
    expect(pills).toContain('className="consultation-date"');
    expect(pills).toContain('t.datePill(');
    expect(pills).toContain('t.startPill(');
    expect(pills).toContain('t.endPill(');
  });
});

describe('consultation round 2 (#800, approved 2026-10-30)', () => {
  it('titles the page Consultation and names the person only in the basis line', () => {
    expect(consultationViewMessages.en.heading).toBe('Consultation');
    expect(consultationViewMessages.nl.heading).toBe('Consultatie');
    expect(view).toContain('title={t.heading}');
    expect(view).toContain('basis={t.basisLine(');
  });

  it('drops the date picker and keeps the static date', () => {
    expect(view).not.toMatch(/type="date"|DateField|<select/);
    expect(view).toContain('t.asOf(');
  });

  it('opens the chart wheel on the selected day through the chart route', () => {
    expect(view).toMatch(/chartHref\(personId, 'wheel', 'natal', undefined, selectedDay\)/);
    expect(view).toMatch(/const selectedDay = `/);
  });

  it('links the time-lord card to Progressions and the directions card to Directions', () => {
    expect(view).toContain("hrefFor('progressions', { personId })");
    expect(view).toContain("hrefFor('primary-directions', { personId })");
  });

  it('links the Ascendant and Midheaven disclosures to the Transits view', () => {
    const disclosure = /angleGroups\(load\.angles\)\.map[\s\S]*?<\/Disclosure>/.exec(view)?.[0] ?? '';
    expect(disclosure).toContain("hrefFor('transit', { personId })");
    expect(disclosure).toContain('t.openTransitsLink');
  });

  it('uses the approved count wording for each Disclosure', () => {
    expect(consultationViewMessages.en.groupCount(2)).toBe('2 active');
    expect(consultationViewMessages.nl.groupCount(2)).toBe('2 actief');
  });

  it('mounts the notes card last in the right column', () => {
    const right = rightColumn();
    expect(right.indexOf('consultation-releasing-heading')).toBeLessThan(right.indexOf('<ConsultationNotesCard'));
  });
});

describe('applying and separating badge, treatment D (#815)', () => {
  it('draws a filled accent dot for applying and a hollow muted dot for separating, with the label kept', () => {
    expect(css).toMatch(/\.aspect-state--applying \.aspect-state-dot\s*\{\s*background: var\(--accent\);/);
    expect(css).toMatch(
      /\.aspect-state--separating \.aspect-state-dot\s*\{\s*border: 1px solid var\(--muted\);\s*background: transparent;/,
    );
  });

  it('has no pill on the state: the label is plain text beside the dot', () => {
    const rule = /\.aspect-state\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).not.toMatch(/border-radius|padding|background/);
  });
});

describe('consultation strings have matching en and nl keys (i18n parity)', () => {
  it('gives every key in en a counterpart in nl, and the reverse', () => {
    const { en, nl } = consultationViewMessages;
    expect(Object.keys(nl).sort()).toEqual(Object.keys(en).sort());
  });
});

describe('right-column keys and Open links (#800)', () => {
  /** Every `t.<key>` the right-column cards read, from the time-lords card through the notes card mount. */
  function rightColumnKeys(): string[] {
    const keys = new Set<string>();
    for (const match of rightColumn().matchAll(/\bt\.([A-Za-z]\w*)/g)) {
      if (match[1] !== undefined) keys.add(match[1]);
    }
    return [...keys];
  }

  it('gives every right-column key an en and an nl string', () => {
    const { en, nl } = consultationViewMessages;
    const keys = rightColumnKeys();
    expect(keys).toContain('openProfections');
    expect(keys).toContain('openTimingTimeline');
    for (const key of keys) {
      expect(en, `en.${key}`).toHaveProperty(key);
      expect(nl, `nl.${key}`).toHaveProperty(key);
    }
  });

  it('renders an Open link on the profection and firdaria cards in en and nl', () => {
    const body = sectionBody(view, 'consultation-year-heading');
    const profectionRow =
      /<li>\s*<span className="consultation-lord-key">\{t\.profectionYear\}[\s\S]*?<\/li>/.exec(body)?.[0] ?? '';
    const firdariaRow =
      /<li>\s*<span className="consultation-lord-key">\{t\.firdaria\}[\s\S]*?<\/li>/.exec(body)?.[0] ?? '';
    expect(profectionRow).toContain("hrefFor('profections', { personId })");
    expect(profectionRow).toContain('{t.openProfections}');
    expect(firdariaRow).toContain("hrefFor('timing-timeline', { personId })");
    expect(firdariaRow).toContain('{t.openTimingTimeline}');
    expect(consultationViewMessages.en.openProfections).toBe('Open profections');
    expect(consultationViewMessages.nl.openProfections).toBe('Profecties openen');
    expect(consultationViewMessages.en.openTimingTimeline).toBe('Open timing timeline');
    expect(consultationViewMessages.nl.openTimingTimeline).toBe('Tijdlijn openen');
  });
});
