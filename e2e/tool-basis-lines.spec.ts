/**
 * Every calculated tool and global view states its calculation basis under the title, with the Edit link (#1059):
 * a real server, no person, so each page shows the device defaults.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { gotoAndSettle } from './support.ts';

let dir: string;
let app: FastifyInstance;
let baseUrl: string;

test.beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'astraya-e2e-'));
  process.env.LOG_LEVEL = 'silent';
  app = await build({ dbPath: join(dir, 'astraya.db') });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (address === null || typeof address === 'string') throw new Error('server did not bind to a port');
  baseUrl = `http://127.0.0.1:${String(address.port)}`;
});

test.afterAll(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

// Horary casts with its own house system (Regiomontanus by default), so its line names that, not the device's.
const TOOLS: readonly (readonly [string, string])[] = [
  ['cycles', 'Placidus'],
  ['event-search', 'Placidus'],
  ['eclipses', 'Placidus'],
  ['horary', 'Regiomontanus'],
  ['electional', 'Placidus'],
  ['rectification', 'Placidus'],
];

for (const [tool, houses] of TOOLS) {
  test(`the ${tool} page states its calculation basis with an Edit link`, async ({ page }) => {
    await gotoAndSettle(page, `${baseUrl}/#/explore/${tool}`);
    await expect(page.locator('.page-header-basis')).toContainText(
      `Tropical · ${houses} · Modern rulers · Standard orbs`,
    );
    await expect(page.getByRole('link', { name: 'Edit calculation basis in Preferences' })).toBeVisible();
  });
}
