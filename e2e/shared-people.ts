/**
 * The three linked people `global-setup.ts` seeds once (#799), and the helper a read-only spec uses
 * to open a browser context that already holds them — instead of recreating a person through the UI
 * in every test.
 *
 * Person records live only in the browser's IndexedDB (ADR 0002), which is per origin, and each spec
 * runs its own server on a random port. So the saved state is re-pointed at the spec's base URL here
 * rather than pinning a fixed port.
 *
 * The Einstein and Born birth times are widely cited but still need a primary source; Marić's time is
 * unknown (date only). They are test data, not a claim about the sources.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { gotoAndSettle } from './support.ts';
import type { PersonInput } from './support.ts';

/** Environment variable through which global setup hands each run's own pointer file to the workers. */
export const SEED_POINTER_ENV = 'ASTRAYA_E2E_SEED_POINTER';

/** This run's pointer file (inside the run's own temp dir, so concurrent runs never collide). */
export function seedPointerPath(): string {
  const path = process.env[SEED_POINTER_ENV];
  if (path === undefined || path === '') {
    throw new Error(`${SEED_POINTER_ENV} is not set: shared-people specs need e2e/global-setup.ts to run first`);
  }
  return path;
}

export const EINSTEIN: PersonInput = {
  name: 'Albert Einstein',
  date: '1879-03-14',
  time: '11:30',
  latitude: '48.4011',
  longitude: '9.9876',
};

/** Date only: the time of birth is unknown. */
export const MARIC: PersonInput = {
  name: 'Mileva Marić',
  date: '1875-12-19',
  latitude: '45.2',
  longitude: '20.3',
};

export const BORN: PersonInput = {
  name: 'Max Born',
  date: '1882-12-11',
  time: '02:00',
  latitude: '51.1079',
  longitude: '17.0385',
};

export const SHARED_PEOPLE: readonly PersonInput[] = [EINSTEIN, MARIC, BORN];

type SavedState = Awaited<ReturnType<BrowserContext['storageState']>>;

interface SeedPointer {
  readonly statePath: string;
}

/**
 * A fresh context holding the seeded people, on the spec's own server. Read-only specs only: the
 * state is copied into each context, so a mutation never reaches the file, but a test that edits or
 * deletes a person should still create its own.
 */
export async function newSeededContext(browser: Browser, baseUrl: string): Promise<BrowserContext> {
  const pointer = JSON.parse(readFileSync(seedPointerPath(), 'utf-8')) as SeedPointer;
  const saved = JSON.parse(readFileSync(pointer.statePath, 'utf-8')) as SavedState;
  const origin = new URL(baseUrl).origin;
  const context = await browser.newContext({
    storageState: { ...saved, origins: saved.origins.map((entry) => ({ ...entry, origin })) },
  });
  await pinE2eFont(context);
  return context;
}

/** The font the e2e run pins. Shipped under `public/fonts/pdf/` (Bitstream Vera licence, DEPENDENCIES.md). */
const PINNED_FONT_FILE = 'public/fonts/pdf/DejaVuSans.ttf';
/** A URL the test context answers itself; the app's CSP is never asked to load it. */
const PINNED_FONT_URL = 'https://e2e-font.invalid/DejaVuSans.ttf';

/**
 * Pins one font for the whole e2e context (#895). The app uses the system UI stack, which resolves to a different
 * font on each machine (Verdana on macOS, a CJK face on the Ubuntu CI runner), so a column's wrapped text measures
 * differently. This swaps every element's family to one shipped font, in e2e only: production CSS and the
 * `system-ui` stack are not changed. The font is served from a route, not the network, so it works offline.
 */
export async function pinE2eFont(context: BrowserContext): Promise<void> {
  const bytes = readFileSync(join(process.cwd(), PINNED_FONT_FILE));
  await context.route(PINNED_FONT_URL, (route) => route.fulfill({ body: bytes, contentType: 'font/ttf' }));
  // A string script: the e2e tsconfig has no DOM types, so the body cannot name `document` in TypeScript.
  await context.addInitScript(`(() => {
    const attach = () => {
      const style = document.createElement('style');
      style.textContent = "@font-face { font-family: 'E2E Pinned'; src: url('${PINNED_FONT_URL}') format('truetype'); }" +
        " html, body, body * { font-family: 'E2E Pinned', sans-serif; }";
      (document.head ?? document.documentElement).appendChild(style);
    };
    if (document.documentElement !== null) attach();
    else document.addEventListener('readystatechange', attach, { once: true });
  })();`);
}

/** Opens one of the shared people from the People list, landing on their birth record. */
export async function openSharedPerson(page: Page, baseUrl: string, person: PersonInput): Promise<void> {
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await page.getByRole('link', { name: new RegExp(`^${person.name}`) }).click();
}
