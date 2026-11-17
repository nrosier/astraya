/**
 * @module test/ui-in-scope-button-shapes
 * @purpose One list test for the in-scope buttons of #1650: each button is one row, grouped by surface, asserted for the class it carries on origin/main and its pill, circle or compact height from app.css.
 * @conventions Reads the source files and app.css the way the other button tests do, and takes labels from the en messages modules. Rows for a button that renders only after an action (opening a drawer or dialog, editing a row, a condition, the window toggle) are asserted from the source element that renders it, and the row's note says so. Owner decision on #1650 (2026-11-17, "Add capsule class in source (Recommended)"): the three orb presets and the two Now buttons carry shape="capsule", so their rows also assert the capsule class and its 999px radius.
 * @exports none
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { chartSearchPanelMessages } from '../src/ui/ChartSearchPanel.messages.js';
import { dateAnimationBarMessages } from '../src/ui/DateAnimationBar.messages.js';
import { extendedSettingsPanelMessages } from '../src/ui/ExtendedSettingsPanel.messages.js';
import { lifeEventsCardMessages } from '../src/ui/LifeEventsCard.messages.js';
import { lifeEventsDrawerMessages } from '../src/ui/LifeEventsDrawer.messages.js';
import { peopleMessages } from '../src/ui/People.messages.js';
import { personFormMessages } from '../src/ui/PersonForm.messages.js';
import { timingTimelineViewMessages } from '../src/ui/TimingTimelineView.messages.js';
import { transitFilterPanelMessages } from '../src/ui/TransitFilterPanel.messages.js';

/**
 * pill: a capsule, form-action or circle button (owner decision on #1650, 2026-11-17: the circle rows count), radius 999px from its class or the base button rule.
 * circle: an icon-only control, radius 999px from the circle class, with equal width and height.
 * compact: an orb preset, asserted by its compact height (2.25rem), not by a radius.
 * now: a Now button, which carries date-animation-now, with its radius from the base button rule.
 */
type Kind = 'pill' | 'circle' | 'compact' | 'now';

interface ButtonRow {
  readonly surface: string;
  /** The en text, or the en aria-label when the button has one. */
  readonly label: string;
  readonly file: string;
  /** Source text that sits inside the button's opening tag or its child; the nearest Button before it is the element. */
  readonly anchor: string;
  readonly kind: Kind;
  /** A NumberField stepper is wired from the ExtendedSettingsPanel call site; the row checks that line too. */
  readonly wiredBy?: { readonly file: string; readonly anchor: string };
  /** Set when the button only renders after an action; the row is then asserted from source. */
  readonly note?: string;
  /** Set when the button carries shape="capsule" in source; the row then asserts the capsule class and its 999px radius. */
  readonly capsule?: true;
}

const DRAWER_NOTE =
  'Rendered only after the Life events drawer is opened (from the Birth record card); asserted from source.';
const EXTENDED_NOTE = 'Rendered only after the Extended settings drawer is opened; asserted from source.';
const FILTER_NOTE = 'Rendered only after the Transits filter dialog is opened; asserted from source.';
const DATE_NOTE =
  'Rendered only in the date animation bar, which the Transits, Progressions and Solar Arc views show; asserted from source.';

const EXTENDED = 'src/ui/ExtendedSettingsPanel.tsx';
const NUMBER_FIELD = 'src/ui/primitives/NumberField.tsx';
const DRAWER = 'src/ui/LifeEventsDrawer.tsx';
const DATE_BAR = 'src/ui/DateAnimationBar.tsx';
const DAY = dateAnimationBarMessages.en.intervalNames.day;

/** The four NumberField steppers of Special points: each has a Decrease and an Increase circle. */
function stepperRows(
  field: 'antisciaMaxOrb' | 'declinationMaxOrb' | 'midpointTreeOrb' | 'stationWindowK',
  note?: string,
): readonly ButtonRow[] {
  const decreaseKey = `${field}DecreaseLabel` as const;
  const increaseKey = `${field}IncreaseLabel` as const;
  const decrease = extendedSettingsPanelMessages.en[decreaseKey];
  const increase = extendedSettingsPanelMessages.en[increaseKey];
  const common = {
    surface: 'Extended settings, Special points',
    kind: 'circle' as const,
    ...(note === undefined ? {} : { note }),
  };
  return [
    {
      ...common,
      label: decrease,
      file: NUMBER_FIELD,
      anchor: 'aria-label={decreaseLabel}',
      wiredBy: { file: EXTENDED, anchor: `decreaseLabel={t.${decreaseKey}}` },
    },
    {
      ...common,
      label: increase,
      file: NUMBER_FIELD,
      anchor: 'aria-label={increaseLabel}',
      wiredBy: { file: EXTENDED, anchor: `increaseLabel={t.${increaseKey}}` },
    },
  ];
}

const ROWS: readonly ButtonRow[] = [
  // Life events drawer.
  {
    surface: 'Life events drawer',
    label: lifeEventsDrawerMessages.en.rowSave,
    file: DRAWER,
    anchor: '{t.rowSave}',
    kind: 'pill',
    note: `${DRAWER_NOTE} Edit row only.`,
  },
  {
    surface: 'Life events drawer',
    label: lifeEventsDrawerMessages.en.rowCancel,
    file: DRAWER,
    anchor: '{t.rowCancel}',
    kind: 'pill',
    note: `${DRAWER_NOTE} Edit row only.`,
  },
  {
    surface: 'Life events drawer',
    label: lifeEventsDrawerMessages.en.addNew,
    file: DRAWER,
    anchor: '{t.addNew}',
    kind: 'pill',
    note: DRAWER_NOTE,
  },
  {
    surface: 'Life events drawer',
    label: lifeEventsDrawerMessages.en.quickAddButton,
    file: DRAWER,
    anchor: '{t.quickAddButton}',
    kind: 'pill',
    note: DRAWER_NOTE,
  },
  {
    surface: 'Life events drawer',
    label: lifeEventsDrawerMessages.en.importButton,
    file: DRAWER,
    anchor: 'buttonLabel={t.importButton}',
    kind: 'pill',
    note: `${DRAWER_NOTE} The visible button is the FileInput button.`,
  },
  {
    surface: 'Life events drawer',
    label: lifeEventsDrawerMessages.en.exportButton,
    file: DRAWER,
    anchor: '{t.exportButton}',
    kind: 'pill',
    note: DRAWER_NOTE,
  },
  {
    surface: 'Life events drawer',
    label: lifeEventsDrawerMessages.en.clearAll,
    file: DRAWER,
    anchor: '{t.clearAll}',
    kind: 'pill',
    note: DRAWER_NOTE,
  },
  // Birth record.
  {
    surface: 'Birth record',
    label: lifeEventsCardMessages.en.manageButton,
    file: 'src/ui/LifeEventsCard.tsx',
    anchor: '{t.manageButton}',
    kind: 'pill',
  },
  {
    surface: 'Birth record',
    label: 'Delete <name>',
    file: 'src/ui/PersonForm.tsx',
    anchor: '{t.deleteButton(',
    kind: 'pill',
    note: `The en text is "${personFormMessages.en.deleteButton('<name>')}" with the person's name; the row checks the element, not the name.`,
  },
  // Transits filter dialog.
  {
    surface: 'Transits filter dialog',
    label: transitFilterPanelMessages.en.applyAsDefaultButton,
    file: 'src/ui/TransitFilterPanel.tsx',
    anchor: '{t.applyAsDefaultButton}',
    kind: 'pill',
    note: FILTER_NOTE,
  },
  // Extended settings: the formula add button and the orb presets.
  {
    surface: 'Extended settings',
    label: extendedSettingsPanelMessages.en.formulaAdd,
    file: EXTENDED,
    anchor: '{t.formulaAdd}',
    kind: 'pill',
    note: `${EXTENDED_NOTE} Special points tab.`,
  },
  {
    surface: 'Extended settings',
    label: extendedSettingsPanelMessages.en.orbScaleChips.tight,
    file: EXTENDED,
    anchor: '{t.orbScaleChips[segment.value]}',
    kind: 'compact',
    capsule: true,
    note: `${EXTENDED_NOTE} One Button renders all three presets from ORB_SCALE_SEGMENTS.`,
  },
  {
    surface: 'Extended settings',
    label: extendedSettingsPanelMessages.en.orbScaleChips.standard,
    file: EXTENDED,
    anchor: '{t.orbScaleChips[segment.value]}',
    kind: 'compact',
    capsule: true,
    note: `${EXTENDED_NOTE} One Button renders all three presets from ORB_SCALE_SEGMENTS.`,
  },
  {
    surface: 'Extended settings',
    label: extendedSettingsPanelMessages.en.orbScaleChips.wide,
    file: EXTENDED,
    anchor: '{t.orbScaleChips[segment.value]}',
    kind: 'compact',
    capsule: true,
    note: `${EXTENDED_NOTE} One Button renders all three presets from ORB_SCALE_SEGMENTS.`,
  },
  // Extended settings: the eight Special points steppers (four NumberFields). The station window k pair renders only when the window is on.
  ...stepperRows('antisciaMaxOrb'),
  ...stepperRows('declinationMaxOrb'),
  ...stepperRows('midpointTreeOrb'),
  ...stepperRows('stationWindowK', 'Rendered only while the station window is on; asserted from source.'),
  // People list.
  {
    surface: 'People list',
    label: peopleMessages.en.addPerson,
    file: 'src/ui/People.tsx',
    anchor: '{t.addPerson}',
    kind: 'pill',
  },
  {
    surface: 'People list',
    label: chartSearchPanelMessages.en.addCondition,
    file: 'src/ui/ChartSearchPanel.tsx',
    anchor: '{t.addCondition}',
    kind: 'pill',
  },
  {
    surface: 'People list',
    label: chartSearchPanelMessages.en.run,
    file: 'src/ui/ChartSearchPanel.tsx',
    anchor: '{t.run}',
    kind: 'pill',
  },
  {
    surface: 'People list',
    label: chartSearchPanelMessages.en.removeCondition('1'),
    file: 'src/ui/ChartSearchConditionRow.tsx',
    anchor: 'aria-label={t.removeCondition(n)}',
    kind: 'pill',
    note: 'Rendered once per condition row; the label is row 1.',
  },
  // Timing timeline Now (outside .date-animation-bar, so its radius is the base button rule).
  {
    surface: 'Timing timeline',
    label: timingTimelineViewMessages.en.nowLabel,
    file: 'src/ui/TimingTimelineView.tsx',
    anchor: '{t.nowLabel}',
    kind: 'now',
    capsule: true,
  },
  // Transits, Progressions and Solar Arc: the Now button and the step buttons of the date animation bar.
  {
    surface: 'Transits, Progressions, Solar Arc',
    label: dateAnimationBarMessages.en.now,
    file: DATE_BAR,
    anchor: '{t.now}',
    kind: 'now',
    capsule: true,
    note: DATE_NOTE,
  },
  {
    surface: 'Transits, Progressions, Solar Arc',
    label: dateAnimationBarMessages.en.stepBack(DAY),
    file: DATE_BAR,
    anchor: 'aria-label={t.stepBack(intervalName)}',
    kind: 'circle',
    note: `${DATE_NOTE} Label for the day interval.`,
  },
  {
    surface: 'Transits, Progressions, Solar Arc',
    label: dateAnimationBarMessages.en.stepForward(DAY),
    file: DATE_BAR,
    anchor: 'aria-label={t.stepForward(intervalName)}',
    kind: 'circle',
    note: `${DATE_NOTE} Label for the day interval.`,
  },
];

/** app.css without comments and without @media blocks: the default (fine pointer) layout, which the row assertions are about. */
const css = stripMediaBlocks(readFileSync('src/ui/app.css', 'utf-8').replace(/\/\*[\s\S]*?\*\//g, ''));

function stripMediaBlocks(source: string): string {
  let out = '';
  let i = 0;
  while (i < source.length) {
    const at = source.indexOf('@media', i);
    if (at < 0) {
      out += source.slice(i);
      break;
    }
    out += source.slice(i, at);
    const open = source.indexOf('{', at);
    let depth = 0;
    let end = open;
    for (; end < source.length; end += 1) {
      if (source.charAt(end) === '{') depth += 1;
      else if (source.charAt(end) === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    i = end + 1;
  }
  return out;
}
const OPENER = /<(Button|button|FileInput)[\s>]/g;

/** Index of the `>` that closes the opening tag at `start`, skipping `>` inside braces and quoted values. */
function openingTagEnd(source: string, start: number): number {
  let depth = 0;
  let inString = false;
  for (let i = start; i < source.length; i += 1) {
    const ch = source.charAt(i);
    if (inString) {
      if (ch === '"') inString = false;
    } else if (ch === '"' && depth === 0) inString = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    else if (ch === '>' && depth === 0 && source.charAt(i - 1) !== '=') return i;
  }
  throw new Error(`unclosed opening tag at offset ${String(start)}`);
}

/** The opening tag of the nearest Button, button or FileInput before the anchor's last occurrence. */
function openingTag(source: string, anchor: string): string | undefined {
  const at = source.lastIndexOf(anchor);
  if (at < 0) return undefined;
  let opener: number | undefined;
  for (const match of source.slice(0, at).matchAll(OPENER)) opener = match.index;
  if (opener === undefined) return undefined;
  return source.slice(opener, openingTagEnd(source, opener) + 1);
}

/** The class names an element carries: literal className strings, plus the classes its shape, size and variant props map to. */
function carriedClasses(tag: string): string[] {
  const names: string[] = [];
  for (const match of tag.matchAll(/className="([^"]*)"/g)) names.push(...(match[1] ?? '').split(' '));
  if (tag.includes('shape="capsule"')) names.push('primitive-button-capsule');
  if (tag.includes('shape="circle"')) names.push('primitive-button-circle');
  if (tag.includes('size="compact"')) names.push('primitive-button-compact');
  if (tag.includes('variant="primary"')) names.push('primitive-button-primary');
  return names.filter((name) => name !== '');
}

/**
 * The value the cascade gives a property from the classes an element carries: the last rule in app.css, in file order,
 * whose selector names one of the classes and sets the property. A later class rule overrides an earlier one (for
 * example `.primitive-button-circle` after `button.quiet`), so the last match is the one that applies.
 */
function classDeclaration(classes: readonly string[], property: string): string | undefined {
  let found: string | undefined;
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = match[1] ?? '';
    if (!classes.some((name) => new RegExp(`\\.${name}(?![\\w-])`).test(selector))) continue;
    const value = new RegExp(`(?:^|[;\\s])${property}:\\s*([^;]+);`).exec(match[2] ?? '');
    if (value?.[1] !== undefined) found = value[1].trim();
  }
  return found;
}

/** The property in the bare `button` rule, which every button takes unless a class rule sets it. */
function baseButtonDeclaration(property: string): string | undefined {
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = (match[1] ?? '').split(',').map((part) => part.trim());
    if (!selectors.includes('button')) continue;
    const value = new RegExp(`(?:^|[;\\s])${property}:\\s*([^;]+);`).exec(match[2] ?? '');
    if (value?.[1] !== undefined) return value[1].trim();
  }
  return undefined;
}

/** Resolves each var(--token) to the first value declared for it in app.css. */
function resolve(value: string): string {
  let out = value;
  for (let i = 0; i < 4; i += 1) {
    out = out.replace(/var\((--[\w-]+)\)/g, (_all, token: string) => {
      const declared = new RegExp(`${token}:\\s*([^;]+);`).exec(css);
      return declared?.[1]?.trim() ?? `var(${token})`;
    });
  }
  return out;
}

function checkRow(row: ButtonRow): string[] {
  const id = `${row.surface}: ${row.label} (${row.file})`;
  const source = readFileSync(row.file, 'utf-8');
  const tag = openingTag(source, row.anchor);
  if (tag === undefined) return [`${id}: no Button or FileInput found for anchor ${row.anchor}`];
  const classes = carriedClasses(tag);
  const problems: string[] = [];

  if (row.wiredBy !== undefined) {
    const wired = readFileSync(row.wiredBy.file, 'utf-8');
    if (!wired.includes(row.wiredBy.anchor))
      problems.push(`${id}: not wired from ${row.wiredBy.file} (${row.wiredBy.anchor})`);
  }

  if (row.kind === 'pill') {
    if (
      !classes.includes('primitive-button-capsule') &&
      !classes.includes('primitive-button-form-action') &&
      !classes.includes('primitive-button-circle')
    ) {
      problems.push(`${id}: carries ${classes.join(' ')}, none of the capsule, form-action or circle class`);
    }
  } else if (row.kind === 'circle') {
    if (!classes.includes('primitive-button-circle'))
      problems.push(`${id}: carries ${classes.join(' ')}, not the circle class`);
    const width = classDeclaration(['primitive-button-circle'], 'width');
    const height = classDeclaration(['primitive-button-circle'], 'height');
    const resolvedWidth = width === undefined ? undefined : resolve(width);
    const resolvedHeight = height === undefined ? undefined : resolve(height);
    if (resolvedWidth === undefined || resolvedWidth !== resolvedHeight)
      problems.push(
        `${id}: circle width is ${String(resolvedWidth)} and height is ${String(resolvedHeight)}, expected equal`,
      );
  } else if (row.kind === 'compact') {
    if (!classes.includes('primitive-button-compact'))
      problems.push(`${id}: carries ${classes.join(' ')}, not the compact class`);
  } else if (!classes.includes('date-animation-now')) {
    problems.push(`${id}: carries ${classes.join(' ')}, not date-animation-now`);
  }
  if (row.capsule === true && !classes.includes('primitive-button-capsule')) {
    problems.push(`${id}: carries ${classes.join(' ')}, not the capsule class`);
  }

  if (row.kind === 'compact') {
    const height = classDeclaration(['primitive-button-compact'], 'min-height');
    const resolved = height === undefined ? undefined : resolve(height);
    if (resolved !== '2.25rem') problems.push(`${id}: compact min-height is ${String(resolved)}, expected 2.25rem`);
  }
  if (row.kind !== 'compact' || row.capsule === true) {
    // `now` takes its radius from the base button rule: the .date-animation-bar Now rule applies only inside the bar.
    const radius =
      row.kind === 'now' && row.capsule !== true
        ? baseButtonDeclaration('border-radius')
        : (classDeclaration(classes, 'border-radius') ?? baseButtonDeclaration('border-radius'));
    const resolved = radius === undefined ? undefined : resolve(radius);
    if (resolved !== '999px') problems.push(`${id}: radius is ${String(resolved)}, expected 999px`);
  }
  return problems;
}

describe('in-scope button shapes (#1650)', () => {
  it('lists every in-scope button and asserts the class it carries and its pill, circle or compact height', () => {
    expect(ROWS).toHaveLength(30);
    expect(ROWS.flatMap((row) => checkRow(row))).toEqual([]);
  });
});
