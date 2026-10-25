/**
 * Seeds three linked people once for the whole e2e run (#799): builds one app, creates them through
 * the UI, and saves the browser's IndexedDB with `storageState({ indexedDB: true })` for
 * `shared-people.ts` to hand to read-only specs. The server is only a host for the page here — it
 * holds no person (ADR 0002).
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { build } from '../server/index.ts';
import { SEED_POINTER_ENV, SHARED_PEOPLE } from './shared-people.ts';
import { createPerson, gotoAndSettle } from './support.ts';

export default async function globalSetup(): Promise<() => void> {
  const dir = mkdtempSync(join(tmpdir(), 'astraya-e2e-seed-'));
  const pointerPath = join(dir, 'pointer.json');
  try {
    process.env.LOG_LEVEL = 'silent';

    const app = await build({ dbPath: join(dir, 'astraya.db') });
    try {
      await app.listen({ port: 0, host: '127.0.0.1' });
      const address = app.server.address();
      if (address === null || typeof address === 'string') throw new Error('server did not bind to a port');
      const baseUrl = `http://127.0.0.1:${String(address.port)}`;

      const browser = await chromium.launch();
      try {
        const context = await browser.newContext();
        const page = await context.newPage();
        await gotoAndSettle(page, `${baseUrl}/#/people`);
        for (const person of SHARED_PEOPLE) {
          await createPerson(page, person);
          await page.getByRole('link', { name: '← People' }).click();
        }
        const statePath = join(dir, 'state.json');
        await context.storageState({ path: statePath, indexedDB: true });
        writeFileSync(pointerPath, JSON.stringify({ statePath, origin: baseUrl }));
      } finally {
        await browser.close();
      }
    } finally {
      await app.close();
    }
    process.env[SEED_POINTER_ENV] = pointerPath;
  } catch (error) {
    rmSync(dir, { recursive: true, force: true });
    Reflect.deleteProperty(process.env, SEED_POINTER_ENV);
    throw error;
  }

  return () => {
    rmSync(dir, { recursive: true, force: true });
    Reflect.deleteProperty(process.env, SEED_POINTER_ENV);
  };
}
