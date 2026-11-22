/**
 * Two-step sign-in enrolment, end to end (#1500, steps 4 and 5): a signed-in local account opens Preferences,
 * sets up an authenticator with its password, sees the QR code and the key, is refused a wrong code, is accepted with
 * the correct code, gets the ten recovery codes once (copy, download), and finishes on the "on" message.
 *
 * The real built app runs against the real server with an encryption key set (enrolment is off without one). The
 * correct code is computed from the secret the page shows, with the same RFC 6238 algorithm the server uses (SHA-1,
 * 6 digits, 30-second steps); nothing is hard-coded.
 */
import { createHmac, randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { gotoAndSettle, signIn } from './support.ts';

const BOOTSTRAP_TOKEN = 'e2e-bootstrap-token';
const USERNAME = 'alice';
const PASSWORD = 'correct-horse-battery-e2e';
const STEP_SECONDS = 30;
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

let dir: string;
let app: FastifyInstance;
let baseUrl: string;

test.beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'astraya-e2e-'));
  process.env.LOG_LEVEL = 'silent';
  process.env.ASTRAYA_BOOTSTRAP_TOKEN = BOOTSTRAP_TOKEN;
  process.env.ASTRAYA_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  app = await build({ dbPath: join(dir, 'astraya.db') });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (address === null || typeof address === 'string') throw new Error('server did not bind to a port');
  baseUrl = `http://127.0.0.1:${String(address.port)}`;

  const response = await fetch(new URL('/api/setup', baseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: BOOTSTRAP_TOKEN, username: USERNAME, password: PASSWORD }),
  });
  if (!response.ok) throw new Error(`bootstrap failed with status ${String(response.status)}`);
});

test.afterAll(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
  delete process.env.ASTRAYA_BOOTSTRAP_TOKEN;
  delete process.env.ASTRAYA_ENCRYPTION_KEY;
});

/** Test helper: RFC 4648 base32 (no padding) to bytes. */
function decodeBase32(text: string): Buffer {
  let bits = 0;
  let buffer = 0;
  const out: number[] = [];
  for (const char of text.replace(/\s+/g, '').toUpperCase()) {
    const value = BASE32.indexOf(char);
    if (value < 0) throw new Error('not base32');
    buffer = (buffer << 5) | value;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return Buffer.from(out);
}

/** Test helper: the RFC 6238 code (HMAC-SHA1, 6 digits, 30 s) for the step `stepOffset` away from now. */
function totpNow(secretBase32: string, stepOffset = 0): string {
  const counter = Math.floor(Date.now() / 1000 / STEP_SECONDS) + stepOffset;
  const counterBytes = Buffer.alloc(8);
  counterBytes.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', decodeBase32(secretBase32)).update(counterBytes).digest();
  const offset = (hmac[hmac.length - 1] ?? 0) & 0x0f;
  const binary =
    (((hmac[offset] ?? 0) & 0x7f) << 24) |
    ((hmac[offset + 1] ?? 0) << 16) |
    ((hmac[offset + 2] ?? 0) << 8) |
    (hmac[offset + 3] ?? 0);
  return String(binary % 1_000_000).padStart(6, '0');
}

test('a local account turns on two-step sign-in and saves its recovery codes', async ({ page }) => {
  test.setTimeout(90_000);
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await signIn(page, USERNAME, PASSWORD);

  // 1. The account screen (Preferences, Data & privacy) has the "Two-step sign-in" section.
  await gotoAndSettle(page, `${baseUrl}/#/preferences/data`);
  const panel = page.locator('section.totp-panel');
  await expect(panel.getByRole('heading', { name: 'Two-step sign-in', level: 2 })).toBeVisible();

  // 2. Set up with the correct password shows the QR code and the key.
  await panel.getByLabel('Current password').fill(PASSWORD);
  await panel.getByRole('button', { name: 'Set up', exact: true }).click();
  const qr = panel.getByRole('img', { name: 'QR code for your authenticator app' });
  await expect(qr).toBeVisible();
  expect(await qr.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
  const key = (await panel.locator('.totp-key code').innerText()).replace(/\s+/g, '');
  expect(key).toMatch(/^[A-Z2-7]{32}$/);

  // 3. A wrong code shows the wrong-code message and keeps the key on screen. A code five steps away is outside the
  // server's window of one step either side, so it cannot be right by chance.
  await panel.getByLabel('6-digit code from the app').fill(totpNow(key, 5));
  await panel.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(panel.getByRole('alert')).toHaveText(
    "That code didn't match. Check the time on your device and try the newest code.",
  );
  await expect(qr).toBeVisible();

  // 4. The correct code, computed from the shown key, shows the recovery codes.
  await panel.getByLabel('6-digit code from the app').fill(totpNow(key));
  await panel.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(panel.getByRole('heading', { name: 'Save your recovery codes', level: 2 })).toBeVisible();
  await expect(panel.locator('.totp-recovery-codes li')).toHaveCount(10);
  await expect(qr).toHaveCount(0);

  // 5. Copy and download are there, and the download holds the ten codes.
  await expect(panel.getByRole('button', { name: 'Copy codes', exact: true })).toBeVisible();
  const shown = await panel.locator('.totp-recovery-codes li code').allInnerTexts();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    panel.getByRole('button', { name: 'Download as text file', exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('astraya-recovery-codes.txt');
  const lines = readFileSync(await download.path(), 'utf8')
    .split('\n')
    .filter((line) => line !== '');
  expect(lines).toHaveLength(10);
  expect(lines).toEqual(shown);

  // 6. "I've saved them" closes the screen and shows the enabled message; the codes are gone.
  await panel.getByRole('button', { name: "I've saved them", exact: true }).click();
  await expect(panel.getByText('Two-step sign-in is on. Other devices have been signed out.')).toBeVisible();
  await expect(panel.locator('.totp-recovery-codes')).toHaveCount(0);
  for (const code of shown) await expect(page.getByText(code)).toHaveCount(0);
});
