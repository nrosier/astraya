/**
 * Small pieces shared by more than one e2e spec — kept here rather than duplicated so the
 * two specs' notion of "fill in a person's birth data" cannot drift apart.
 */
import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

/**
 * `PersonForm` nests each field's inline error `<span>` inside its `<label>`, and validation
 * runs unconditionally — so a freshly-created, still-empty person has an invalid Name/Date/
 * Latitude/Longitude from the very first render, and the label's accessible text becomes
 * `"Name" + errorMessage` with no separating space. The "How the time is known" `<select>` has
 * the same shape for a different reason: its `<label>`'s accessible name includes every nested
 * `<option>`'s text, not just the selected one, so it is never exactly "How the time is known"
 * either. `getByLabel(label, { exact: true })` can't match either case. Scoping by the label's
 * own element (matched with a start-anchored regex, tolerant of the appended text) plus a
 * descendant selector sidesteps the accessible-name computation entirely, and — because the
 * anchor is on the label, not a substring — disambiguates from `AccountPanel`'s same-page
 * Username field (mounted alongside `PersonForm` on every `Stored` route) without an exact match.
 */
export function labeledField(page: Page, label: RegExp, selector: string): Locator {
  const nested = page.locator('label').filter({ hasText: label }).locator(selector);
  // A shared primitive (`ui/primitives/Field`) keeps its control beside its label, tied by `for`/`id`, not inside it.
  const associated = page.getByLabel(label).and(page.locator(selector));
  return nested.or(associated);
}

export interface PersonInput {
  readonly name: string;
  readonly date: string;
  readonly time?: string;
  readonly latitude: string;
  readonly longitude: string;
}

/**
 * Navigates and waits out the one-time reload `pwa/register.ts` triggers the instant a fresh
 * context's service worker first takes control (`controllerchange`) — without this, anything
 * that runs immediately after `page.goto` (like an axe scan) can have its execution context
 * torn out from under it by that reload. Safe to call even when no reload happens: the second
 * `waitForEvent` just times out and is swallowed.
 */
export async function gotoAndSettle(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.waitForEvent('load', { timeout: 5_000 }).catch(() => undefined);
}

/** Starting from the People list, creates a person and saves. Works offline — no network involved. */
export async function createPerson(page: Page, input: PersonInput): Promise<void> {
  await page.getByRole('button', { name: 'Add a person', exact: true }).click();
  await labeledField(page, /^Name/, 'input[type="text"]').fill(input.name);
  await page.locator('input[type="date"]').fill(input.date);
  if (input.time !== undefined) {
    await labeledField(page, /^How the time is known/, 'select').selectOption('recorded');
    await page.locator('input[type="time"]').fill(input.time);
  }
  await labeledField(page, /^Latitude/, 'input[type="number"]').fill(input.latitude);
  await labeledField(page, /^Longitude/, 'input[type="number"]').fill(input.longitude);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved on this device.')).toBeVisible();
}

/**
 * If this device holds local changes from before sign-in, `AccountPanel` swaps in the
 * adoption prompt (#109) instead of completing the switch — accept it, since callers
 * that pre-populate local data want it to end up on the account.
 *
 * Signed-in confirmation comes from `SyncBadge`'s "(logged in as: {username})" rather
 * than from `AccountPanel` itself, which no longer repeats it (#230).
 */
export async function signIn(page: Page, username: string, password: string): Promise<void> {
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Username', { exact: true }).fill(username);
  await dialog.getByLabel('Password', { exact: true }).fill(password);
  await dialog.getByRole('button', { name: 'Sign in', exact: true }).click();
  const adopt = page.getByRole('button', { name: 'Add it to my account', exact: true });
  const signedIn = page.getByText(`(logged in as: ${username})`, { exact: true });
  await expect(adopt.or(signedIn)).toBeVisible();
  if (await adopt.isVisible()) {
    await adopt.click();
  }
  await expect(signedIn).toBeVisible();
}

/** Opens a screen from the header's Tools menu (#421): the menu button, then the tool's link. */
export async function openTool(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'Tools', exact: true }).click();
  await page.getByRole('link', { name, exact: true }).click();
}

/** Opens one kind of chart (`Natal`, `Draconic`, `Harmonic`, `Solar return` or `Lunar return`): the header's Charts link, then the page's Chart type select (#511). */
export async function openChart(page: Page, type: string): Promise<void> {
  await page.getByRole('banner').getByRole('link', { name: 'Charts', exact: true }).click();
  await page.getByLabel('Chart type', { exact: true }).selectOption({ label: type });
}

/**
 * Opens the natal chart from the header's Charts link (#430), at one of its views (#511): the wheel
 * by default, or `Aspects`, `Placements` or `Patterns & condition` — ordinary links, not ARIA tabs.
 */
export async function openNatalChart(page: Page, view = 'Wheel'): Promise<void> {
  await openChart(page, 'Natal');
  if (view !== 'Wheel') await page.getByRole('link', { name: view, exact: true }).click();
}

/** Picks an export from the header's Export menu; `group` opens a submenu first, for an export that is in one. */
export async function chooseExport(page: Page, item: string, group?: string): Promise<void> {
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  if (group !== undefined) await page.getByRole('button', { name: group, exact: true }).click();
  await page.getByRole('button', { name: item, exact: true }).click();
}

/** Opens the chart's Extended settings card (a modal dialog) from its trigger, if it is not open already. */
export async function openSettings(page: Page): Promise<void> {
  const dialog = page.locator('dialog.settings-card');
  const trigger = page.locator('button.extended-settings-trigger');
  // Below 450px the tab row's actions sit behind one "Chart actions" toggle (#818).
  if (!(await dialog.isVisible()) && !(await trigger.isVisible()))
    await page.getByRole('button', { name: 'Chart actions', exact: true }).click();
  if (!(await dialog.isVisible())) await trigger.click();
  await expect(dialog).toBeVisible();
}

/** Closes the card with "Apply and redraw": the draft settings and rulers are saved on the person, and the symbols it previewed stay (#510, #806). */
export async function applySettings(page: Page): Promise<void> {
  const dialog = page.locator('dialog.settings-card');
  await dialog.getByRole('button', { name: /^Apply and redraw/ }).click();
  await expect(dialog).toBeHidden();
}

/** Closes the card without applying: whatever was previewed or drafted in it, the rulers and the symbols included, is put back. */
export async function closeSettings(page: Page): Promise<void> {
  const dialog = page.locator('dialog.settings-card');
  if (await dialog.isVisible()) await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toBeHidden();
}

/** One text-showing operation in a PDF: the font resource it is set in (`F15`) and its text. */
export interface PdfTextRun {
  readonly font: string;
  readonly text: string;
}

/**
 * The text a jsPDF-generated PDF draws, run by run, in drawing order (#655). jsPDF writes its streams uncompressed;
 * text in an embedded font is hex glyph codes (`<0022…> Tj`), read back through that font's ToUnicode map, and
 * text in a built-in font is a literal string (`(…) Tj`).
 */
export function pdfTextRuns(raw: string): readonly PdfTextRun[] {
  const objectBody = (id: string): string => new RegExp(`\\n${id} 0 obj([^]*?)endobj`).exec(raw)?.[1] ?? '';
  const maps = new Map<string, Map<string, string>>();
  const mapFor = (resource: string): Map<string, string> => {
    const cached = maps.get(resource);
    if (cached !== undefined) return cached;
    const fontObject = new RegExp(`/${resource} (\\d+) 0 R`).exec(raw)?.[1];
    const toUnicode = fontObject === undefined ? undefined : /\/ToUnicode (\d+) 0 R/.exec(objectBody(fontObject))?.[1];
    const map = new Map<string, string>();
    if (toUnicode !== undefined) {
      for (const [, code, unicode] of objectBody(toUnicode).matchAll(/<([0-9a-f]{4})><([0-9a-f]{4,8})>/gi)) {
        if (code !== undefined && unicode !== undefined)
          map.set(code.toLowerCase(), String.fromCodePoint(parseInt(unicode, 16)));
      }
    }
    maps.set(resource, map);
    return map;
  };
  const runs: PdfTextRun[] = [];
  let font = '';
  for (const [, resource, hex, literal] of raw.matchAll(
    /\/(F\d+) [\d.]+ Tf|<([0-9a-f]+)> Tj|\(((?:\\.|[^\\)])*)\) Tj/gi,
  )) {
    if (resource !== undefined) font = resource;
    else if (hex !== undefined) {
      const map = mapFor(font);
      const text = (hex.toLowerCase().match(/.{4}/g) ?? []).map((code) => map.get(code) ?? '').join('');
      runs.push({ font, text });
    } else if (literal !== undefined) runs.push({ font, text: literal.replace(/\\(.)/g, '$1') });
  }
  return runs;
}
