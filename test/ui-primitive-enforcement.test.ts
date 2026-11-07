/**
 * Control markup comes from the shared primitives (#514): no screen draws its own text/number/date input, select,
 * textarea, checkbox, radio or modal dialog. The only things allowed raw are controls the primitives deliberately do
 * not cover — a range slider — and the primitives themselves. A new raw control fails here, so a second visual or
 * behavioural version of a control cannot creep back in.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const RAW_CONTROL = /<(?:input|select|textarea|dialog)\b/g;
/** Specialised visualisation controls with no primitive, by the `type` they declare. */
const EXEMPT_INPUT_TYPES = new Set(['range']);

function screens(dir: string): readonly string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'primitives' ? [] : screens(path);
    return entry.name.endsWith('.tsx') ? [path] : [];
  });
}

describe('shared control primitives (#514)', () => {
  it('are the only place a raw input, select, textarea or dialog is written', () => {
    const offenders: string[] = [];
    for (const file of screens('src/ui')) {
      const source = readFileSync(file, 'utf-8')
        // Prose in comments may name the elements; only markup counts.
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      for (const match of source.matchAll(RAW_CONTROL)) {
        const tag = source.slice(match.index, source.indexOf('>', match.index) + 1);
        const type = /type="(\w+)"/.exec(tag)?.[1];
        if (type !== undefined && EXEMPT_INPUT_TYPES.has(type)) continue;
        offenders.push(`${file}: ${tag.slice(0, 40)}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

/**
 * Spacing comes from the `--space-*` tokens (#1074, guidelines §11). A padding, margin or gap written as a literal
 * rem or px value fails here. The exceptions are deliberate and narrow:
 * - hairlines (2px or less) and optical nudges under 0.2rem, which sit below the smallest token;
 * - page-layout offsets above 3rem (`--space-12`), such as the shell's top and bottom padding;
 * - negative offsets and `calc()` expressions, which position rather than space;
 * - `em` values, which scale with their own text on purpose;
 * - chart and visualisation geometry (§11 exempts it), by selector;
 * - the documented exceptions in EXCEPTIONS, each with its reason.
 */
describe('spacing tokens (#1074)', () => {
  const SPACING =
    /^(?:padding|margin)(?:-(?:top|right|bottom|left|block|inline)(?:-start|-end)?)?$|^(?:row-|column-)?gap$/;
  const VISUALISATION =
    /chart-wheel|wheel-|\bwheel\b|mgrid|cycle-diagram|acg-map|svg|glyph|aspect-grid|matrix|elements-grid|dial/;

  /** Literal values kept on purpose, by selector and value. */
  const EXCEPTIONS: readonly { readonly selector: RegExp; readonly value: string; readonly reason: string }[] = [
    {
      selector: /^\.data-table th,\s*\.data-table td$/,
      value: '0.35rem var(--space-3)',
      reason: 'fine-pointer table rows (#513), between two tokens; the #895 Consultation balance is measured with it',
    },
  ];

  function allowed(value: string, selector: string): boolean {
    if (value.includes('calc(') || VISUALISATION.test(selector)) return true;
    if (EXCEPTIONS.some((e) => e.selector.test(selector) && e.value === value)) return true;
    for (const part of value.split(/\s+/)) {
      const literal = /^(-?)(\d*\.?\d+)(rem|px)$/.exec(part);
      if (literal === null) continue;
      const [, negative, number, unit] = literal;
      if (negative === '-') continue;
      const rem = unit === 'rem' ? Number(number) : Number(number) / 14;
      if (unit === 'px' && Number(number) <= 2) continue;
      if (rem < 0.2 || rem > 3) continue;
      return false;
    }
    return true;
  }

  it('uses a token for every padding, margin and gap in app.css', () => {
    const css = readFileSync('src/ui/app.css', 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '');
    const offenders: string[] = [];
    for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = (rule[1] ?? '').trim();
      for (const declaration of (rule[2] ?? '').split(';')) {
        const colon = declaration.indexOf(':');
        if (colon === -1) continue;
        const property = declaration.slice(0, colon).trim();
        const value = declaration.slice(colon + 1).trim();
        if (SPACING.test(property) && !allowed(value, selector))
          offenders.push(`${selector} { ${property}: ${value} }`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('sizes buttons and fields from the control-height tokens', () => {
    const css = readFileSync('src/ui/app.css', 'utf-8');
    expect(css).toMatch(/--control-height:\s*[\d.]+rem;/);
    expect(css).toMatch(/--control-height-compact:\s*[\d.]+rem;/);
    // The standard button group and the field rule both take their height from the token, not a literal.
    expect(css).toMatch(/\.primitive-button-primary \{\s*min-height: var\(--control-height\);/);
    expect(css).toMatch(/\.extended-settings-trigger \{\s*min-height: var\(--control-height-compact\);/);
    expect(css).toMatch(/\.primitive-field select \{\s*min-height: var\(--control-height\);/);
  });
});

describe('data table header tokens (#826)', () => {
  it('sets the header rule to the muted text colour token', () => {
    const css = readFileSync('src/ui/app.css', 'utf-8');
    const rule = /^\.data-table th \{([^}]*)\}/m.exec(css)?.[1] ?? '';
    expect(rule).toMatch(/(?:^|;)\s*color:\s*var\(--muted\)\s*;/);
  });
});

/**
 * Route screens that must draw their action buttons through the `Button` primitive (#1161, guidelines §6 and §11).
 * A bare `<button>` (no class) is `<Button variant="plain">`, which keeps its look, and `ref` passes through
 * `Button`; the raw buttons that remain carry a class of their own or are shell controls, and each screen's count is
 * pinned so a new raw button fails here. The shell toggles
 * (language, theme, symbol, sidebar) are outside this list by owner decision.
 */
const BUTTON_SCREENS: Readonly<Record<string, { readonly rawButtons: number; readonly reason: string }>> = {
  'src/ui/SetPasswordForm.tsx': { rawButtons: 0, reason: 'all buttons use Button' },
  'src/ui/SetupForm.tsx': { rawButtons: 0, reason: 'all buttons use Button' },
  'src/ui/AdminPanel.tsx': { rawButtons: 0, reason: 'all buttons use Button' },
  'src/ui/CorpusOverridesPanel.tsx': { rawButtons: 0, reason: 'all buttons use Button' },
  'src/ui/People.tsx': { rawButtons: 0, reason: 'all buttons use Button' },
  'src/ui/PersonForm.tsx': { rawButtons: 0, reason: 'all classed buttons use Button' },
  'src/ui/PreferencesView.tsx': { rawButtons: 0, reason: 'all buttons use Button' },
  'src/ui/EventSearchView.tsx': { rawButtons: 0, reason: 'all buttons use Button' },
  'src/ui/CyclesView.tsx': { rawButtons: 0, reason: 'all classed buttons use Button' },
  'src/ui/RectificationView.tsx': { rawButtons: 0, reason: 'all classed buttons use Button' },
  'src/ui/ReportView.tsx': { rawButtons: 0, reason: 'all buttons use Button' },
  'src/ui/ChartView.tsx': { rawButtons: 0, reason: 'all classed buttons use Button' },
  'src/ui/RelocatedChartView.tsx': { rawButtons: 0, reason: 'all classed buttons use Button' },
  'src/ui/FocusInterpretation.tsx': { rawButtons: 0, reason: 'all classed buttons use Button' },
  'src/ui/SavedInterpretationsPanel.tsx': { rawButtons: 0, reason: 'all buttons use Button' },
  'src/ui/BirthPlaceSearch.tsx': { rawButtons: 0, reason: 'popup rows use Button' },
  'src/ui/AspectMatrixGrid.tsx': {
    rawButtons: 1,
    reason: 'a matrix cell toggle with its own mgrid-pair look, not an action button',
  },
  'src/ui/BiWheelSelectionPanel.tsx': { rawButtons: 0, reason: 'all classed buttons use Button' },
  'src/ui/TransitFilterPanel.tsx': { rawButtons: 0, reason: 'all classed buttons use Button' },
  'src/ui/ChartOverlaySettingsPanel.tsx': {
    rawButtons: 1,
    reason: 'the drawer trigger has its own class, which Button does not take',
  },
  'src/ui/MapSettingsDialog.tsx': { rawButtons: 0, reason: 'all buttons use Button' },
  'src/ui/OrbLibraryEditor.tsx': { rawButtons: 0, reason: 'all classed buttons use Button' },
  'src/ui/AccountPanel.tsx': { rawButtons: 0, reason: 'all buttons use Button' },
  'src/ui/ExtendedSettingsPanel.tsx': {
    rawButtons: 1,
    reason: 'the drawer trigger has its own class, which Button does not take',
  },
  'src/ui/ProfileTile.tsx': {
    rawButtons: 5,
    reason: 'the account tile and its menu are shell controls with their own looks and refs, like the shell toggles',
  },
};

describe('route screens use the Button primitive (#1161)', () => {
  it('writes no raw <button> beyond the pinned, reasoned count per screen', () => {
    const counts: Record<string, number> = {};
    for (const [file, entry] of Object.entries(BUTTON_SCREENS)) {
      const source = readFileSync(file, 'utf-8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      counts[file] = [...source.matchAll(/<button\b/g)].length;
      expect(entry.reason).not.toBe('');
    }
    const expected: Record<string, number> = {};
    for (const [file, entry] of Object.entries(BUTTON_SCREENS)) expected[file] = entry.rawButtons;
    expect(counts).toEqual(expected);
  });
});
