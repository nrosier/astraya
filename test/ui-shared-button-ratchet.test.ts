/**
 * The shared-button ratchet (#1348, owner decision G-05): the shared controls (sort headers, copy/download/reset
 * table actions, dropdown and sync triggers, close and update actions) go through the `Button` primitive, so a
 * new shared button cannot quietly come back as a bare `<button>`.
 *
 * Every `<button` element under `src/ui` outside `src/ui/primitives/` is counted. The allowlist records the exact
 * number of bare buttons each file may keep. The counts only shrink: a file that gains a bare button fails, and a
 * file that drops one must lower its entry here, so the list cannot go stale.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const UI_ROOT = 'src/ui';
const PRIMITIVES = 'src/ui/primitives';

/**
 * Bare `<button>` elements that stay for now. None is one of the G-05 shared controls (sort, dropdown, close, sync).
 * Each is a bespoke nav, corner-pill or page-header control with its own class and layout, and migrating it is
 * outside the G-05 scope, so it is recorded here rather than silently left in.
 */
const ALLOWED_BARE_BUTTONS: Readonly<Record<string, number>> = {
  // Nav-tab and nav-family items (disabled states) plus the narrow-viewport menu toggle: bespoke `app-nav-*` classes.
  'src/ui/AppNav.tsx': 3,
  // Corner-pill language switch: `corner-pill language-toggle`, not a shared action.
  'src/ui/LanguageToggle.tsx': 1,
  // Page-header export dropdown toggle and its item buttons: bespoke page-header classes, and a nav-style dropdown
  // whose migration changes its look, so it is left for the owner to review (see #1348 report).
  'src/ui/PageHeader.tsx': 2,
  // Saved-interpretation trigger and the up/down move icons: bespoke `pdf-ai-move` picker controls.
  'src/ui/PdfAiInterpretationPicker.tsx': 3,
  // Relationship-summary trigger and history entries: bespoke summary markup.
  'src/ui/RelationshipSummary.tsx': 2,
  // Corner-pill theme switch: `corner-pill theme-toggle`, not a shared action.
  'src/ui/ThemeToggle.tsx': 1,
  // Workspace rail toggle: bespoke `workspace-rail-toggle` layout control.
  'src/ui/WorkspaceShell.tsx': 1,
};

/** Every `.tsx` file under `dir`, recursively, as a path relative to the repository root. */
function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return tsxFiles(path);
    return name.endsWith('.tsx') ? [path] : [];
  });
}

/** Count `<button` opening tags in `source`, ignoring block comments (which may describe the element in prose). */
function countBareButtons(source: string): number {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '');
  return (code.match(/<button(?=[\s>])/g) ?? []).length;
}

/** Bare button count per UI file (files with zero are omitted). */
function bareButtonCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const file of tsxFiles(UI_ROOT)) {
    const path = relative('.', file).split('\\').join('/');
    if (path.startsWith(`${PRIMITIVES}/`)) continue;
    const count = countBareButtons(readFileSync(file, 'utf-8'));
    if (count > 0) counts[path] = count;
  }
  return counts;
}

describe('shared-button ratchet (#1348, G-05)', () => {
  it('counts a bare button and ignores one that only appears in a comment (self-check)', () => {
    expect(countBareButtons('<button type="button">x</button>')).toBe(1);
    expect(countBareButtons('<Button variant="quiet">x</Button>')).toBe(0);
    expect(countBareButtons('/** the <button> element */ <Button />')).toBe(0);
  });

  it('allows no bare button beyond the recorded allowlist', () => {
    const actual = bareButtonCounts();
    const over = Object.entries(actual).filter(([file, count]) => count > (ALLOWED_BARE_BUTTONS[file] ?? 0));
    expect(over).toEqual([]);
  });

  it('keeps the allowlist exact, so a fixed file must lower its entry', () => {
    const actual = bareButtonCounts();
    const stale = Object.entries(ALLOWED_BARE_BUTTONS).filter(([file, count]) => actual[file] !== count);
    expect(stale).toEqual([]);
  });

  it('migrates the G-05 shared controls to the Button primitive', () => {
    const shared = [
      'src/ui/SortableTable.tsx',
      'src/ui/PersonSwitcher.tsx',
      'src/ui/SyncBadge.tsx',
      'src/ui/PwaStatus.tsx',
      'src/ui/PdfAiInterpretationPicker.tsx',
    ];
    for (const file of shared) {
      expect(readFileSync(file, 'utf-8'), file).toMatch(/from '\.\/primitives\/Button\.js'/);
    }
  });
});
