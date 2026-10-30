// @vitest-environment jsdom
/**
 * Opt-in glossary tooltips in prose (#902): a term in a report paragraph becomes a tooltip in en and nl, only its first
 * mention per paragraph is marked, headings and buttons are never wrapped, and matching stays fast on long text.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { astroGlossaryMessages } from '../src/ui/astro-glossary.messages.js';
import { GlossaryText } from '../src/ui/GlossaryText.js';
import { splitGlossaryText } from '../src/ui/glossary-match.js';
import { setLocale } from '../src/ui/locale.js';
import type { Locale } from '../src/interpretation/schema.js';

let container: HTMLElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  setLocale('en');
});

const render = (node: React.ReactNode): void => {
  act(() => {
    root.render(node);
  });
};
const termTriggers = (): HTMLButtonElement[] => [
  ...container.querySelectorAll<HTMLButtonElement>('button.primitive-tooltip-trigger'),
];

describe('splitGlossaryText (#902)', () => {
  it('marks a multi-word phrase whole, without its single words being matched separately', () => {
    const segments = splitGlossaryText('The Chart ruler governs the chart.', 'en');
    expect(segments).toContainEqual({ kind: 'term', text: 'Chart ruler', id: 'chartRuler' });
    expect(segments.filter((segment) => segment.kind === 'term')).toHaveLength(1);
  });

  it('matches case-insensitively and only at whole words', () => {
    const hits = splitGlossaryText('Houses are not hotels; a HOUSE is one.', 'en').filter((s) => s.kind === 'term');
    expect(hits.map((s) => s.text)).toEqual(['Houses']);
  });

  it('matches a per-locale alias in the locale it belongs to', () => {
    // "house" is an en alias of Houses only; the nl alias is "huis".
    expect(splitGlossaryText('The house is ours.', 'en').some((s) => s.kind === 'term')).toBe(true);
    expect(splitGlossaryText('Het house is ours.', 'nl').some((s) => s.kind === 'term')).toBe(false);
    expect(splitGlossaryText('Het huis is ours.', 'nl').some((s) => s.kind === 'term')).toBe(true);
  });

  it('marks a term once per paragraph, at its first occurrence', () => {
    const hits = splitGlossaryText('Aspect one. Aspect two. Aspects three.', 'en').filter((s) => s.kind === 'term');
    expect(hits).toEqual([{ kind: 'term', text: 'Aspect', id: 'aspect' }]);
  });

  it('uses Unicode word edges, so Dutch and accented letters do not split a word', () => {
    expect(splitGlossaryText('Huizené', 'nl').some((s) => s.kind === 'term')).toBe(false);
    expect(splitGlossaryText('Huizen', 'nl').some((s) => s.kind === 'term')).toBe(true);
    expect(splitGlossaryText('Éaspect', 'en').some((s) => s.kind === 'term')).toBe(false);
  });

  it('returns the plain text unchanged when no term occurs', () => {
    expect(splitGlossaryText('Nothing to explain here.', 'en')).toEqual([
      { kind: 'text', text: 'Nothing to explain here.' },
    ]);
  });
});

describe('GlossaryText in prose (#902)', () => {
  it.each(['en', 'nl'] as const)('wraps the first term in a paragraph as a tooltip in %s', (locale: Locale) => {
    setLocale(locale);
    const id = 'dispositor';
    const name = astroGlossaryMessages[locale][id].name;
    render(<p>{<GlossaryText text={`Read ${name} and ${name} again.`} />}</p>);
    const triggers = termTriggers();
    expect(triggers).toHaveLength(1);
    expect(triggers[0]?.textContent).toBe(name);
    act(() => {
      triggers[0]?.focus();
    });
    expect(container.querySelector('[role="tooltip"]')?.textContent).toBe(astroGlossaryMessages[locale][id].definition);
    expect(triggers[0]?.getAttribute('aria-describedby')).toBe(container.querySelector('[role="tooltip"]')?.id);
  });

  it('leaves a heading or button outside the prose wrapper unwrapped', () => {
    setLocale('en');
    render(
      <div>
        <h4>Dispositor</h4>
        <button type="button">Dispositor</button>
        <p>
          <GlossaryText text="The Dispositor shows the chain." />
        </p>
      </div>,
    );
    expect(container.querySelector('h4')?.querySelector('button')).toBeNull();
    expect(container.querySelector('h4')?.textContent).toBe('Dispositor');
    expect(container.querySelector('button:not(.primitive-tooltip-trigger)')?.textContent).toBe('Dispositor');
    expect(termTriggers()).toHaveLength(1);
  });

  it('keeps the paragraph text intact for screen readers (no HTML is injected)', () => {
    setLocale('en');
    render(<p>{<GlossaryText text="A <b>bold</b> Aspect." />}</p>);
    expect(container.querySelector('b')).toBeNull();
    expect(container.textContent).toBe('A <b>bold</b> Aspect.');
  });

  it('matches a long paragraph quickly and reuses one compiled pattern', () => {
    setLocale('en');
    const long = 'The chart shows a Dispositor and an Aspect with plain prose around them. '.repeat(400);
    const started = performance.now();
    splitGlossaryText(long, 'en');
    splitGlossaryText(long, 'en');
    const elapsed = performance.now() - started;
    expect(elapsed).toBeLessThan(1000);
  });
});
