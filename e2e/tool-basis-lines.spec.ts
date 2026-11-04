/**
 * Every calculated tool and global view states the basis it really calculates with under its title (#1059): a real
 * server, no person. None of these tools reads the saved default calculation profile, so a saved non-default one must
 * not reach their line, and they show no Edit link (Preferences cannot change what they calculate with).
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

// Horary casts with its own house system (Regiomontanus by default) and follows the device rulers; the rest use the shipped defaults.
const TOOLS: readonly (readonly [string, string])[] = [
  ['cycles', 'Placidus'],
  ['event-search', 'Placidus'],
  ['eclipses', 'Placidus'],
  ['horary', 'Regiomontanus'],
  ['electional', 'Placidus'],
  ['rectification', 'Placidus'],
];

const EDIT_LINK = 'Edit calculation basis in Preferences';

for (const [tool, houses] of TOOLS) {
  test(`the ${tool} page states its calculation basis without an Edit link`, async ({ page }) => {
    await gotoAndSettle(page, `${baseUrl}/#/explore/${tool}`);
    await expect(page.locator('.page-header-basis')).toHaveText(`Tropical · ${houses} · Modern rulers · Standard orbs`);
    await expect(page.getByRole('link', { name: EDIT_LINK })).toHaveCount(0);
  });

  test(`the ${tool} page ignores a saved non-default profile`, async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'astraya:defaultCalculationProfile',
        JSON.stringify({
          settings: { houseSystem: 'W', zodiac: { kind: 'sidereal', ayanamsa: 1 }, orbScalePercent: -50 },
          rulership: 'traditional',
        }),
      );
      localStorage.setItem('astraya:rulershipChoice', 'traditional');
    });
    await gotoAndSettle(page, `${baseUrl}/#/explore/${tool}`);
    // Horary does follow the device rulers (#806); every other part of its line, and all of the others', stays shipped.
    const rulers = tool === 'horary' ? 'Traditional' : 'Modern';
    await expect(page.locator('.page-header-basis')).toHaveText(
      `Tropical · ${houses} · ${rulers} rulers · Standard orbs`,
    );
    await expect(page.getByRole('link', { name: EDIT_LINK })).toHaveCount(0);
  });
}
