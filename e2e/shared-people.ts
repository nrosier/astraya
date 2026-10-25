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
import { tmpdir } from 'node:os';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { gotoAndSettle } from './support.ts';
import type { PersonInput } from './support.ts';

/** Where global setup writes the saved-state location; a fixed path so specs can find it without env plumbing. */
export const SEED_POINTER_PATH = join(tmpdir(), 'astraya-e2e-shared-people.json');

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
  const pointer = JSON.parse(readFileSync(SEED_POINTER_PATH, 'utf-8')) as SeedPointer;
  const saved = JSON.parse(readFileSync(pointer.statePath, 'utf-8')) as SavedState;
  const origin = new URL(baseUrl).origin;
  return browser.newContext({
    storageState: { ...saved, origins: saved.origins.map((entry) => ({ ...entry, origin })) },
  });
}

/** Opens one of the shared people from the People list, landing on their birth record. */
export async function openSharedPerson(page: Page, baseUrl: string, person: PersonInput): Promise<void> {
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await page.getByRole('link', { name: new RegExp(`^${person.name}`) }).click();
}
